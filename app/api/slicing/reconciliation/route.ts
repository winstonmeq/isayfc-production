import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requirePermission } from "@/lib/require-permission";
import { manilaDateString, startOfDayManila, addDays } from "@/lib/date-utils";
import { reconcileChickenKilos } from "@/lib/chicken-reconciliation";
import BodegaProduct from "@/models/BodegaProduct";
import BodegaStockTransaction from "@/models/BodegaStockTransaction";
import DeliveryItem from "@/models/DeliveryItem";
import SlicingItem from "@/models/SlicingItem";
import StandardPacking from "@/models/StandardPacking";
import SlicingBatch from "@/models/SlicingBatch";
import Delivery from "@/models/Delivery";

export async function GET(req: NextRequest) {
  const { response } = await requirePermission("slicing.view");
  if (response) return response;
  const day = req.nextUrl.searchParams.get("date") || manilaDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day > manilaDateString()) {
    return NextResponse.json({ success: false, message: "Select a valid date, today or earlier." }, { status: 400 });
  }
  await dbConnect();
  const start = startOfDayManila(new Date(`${day}T12:00:00+08:00`));
  const end = addDays(start, 1);
  const [received, sliced, standards] = await Promise.all([
    DeliveryItem.aggregate([
      { $lookup: { from: "deliveries", localField: "deliveryId", foreignField: "_id", as: "delivery" } },
      { $unwind: "$delivery" },
      { $match: { "delivery.isVoided": false, "delivery.deliveryDate": { $gte: start, $lt: end } } },
      { $group: { _id: "$productId", kilos: { $sum: "$kilos" }, heads: { $sum: "$pieces" } } },
    ]),
    SlicingItem.aggregate([
      { $lookup: { from: "slicingbatches", localField: "batchId", foreignField: "_id", as: "batch" } },
      { $unwind: "$batch" },
      { $match: { "batch.isVoided": false, "batch.slicingDate": { $gte: start, $lt: end } } },
      { $group: { _id: "$mainProductId", kilos: { $sum: "$kilos" }, heads: { $sum: "$heads" }, expected: { $sum: "$totalStdPcs" }, actual: { $sum: "$actualSlicedPcs" } } },
    ]),
    StandardPacking.distinct("wholeChickenId"),
  ]);
  // Standards identify whole-chicken inputs; do not include sliced products received as PCS.
  const ids = [...standards, ...sliced.map(r => r._id)];
  const products = await BodegaProduct.find({ _id: { $in: ids } }).select("name stockKilos").lean();
  const movements = await BodegaStockTransaction.find({ bodegaProductId: { $in: products.map(p => p._id) }, transactionDate: { $gte: start } })
    .select("bodegaProductId transactionDate kilos previousStock newStock referenceType referenceId").lean();
  const slicingIds = movements.filter(m => m.referenceType === "SLICING_BATCH" && m.referenceId).map(m => String(m.referenceId));
  const deliveryIds = movements.filter(m => m.referenceType === "DELIVERY" && m.referenceId).map(m => String(m.referenceId));
  const [voidedSlices, voidedDeliveries] = await Promise.all([
    SlicingBatch.find({ _id: { $in: slicingIds }, isVoided: true }).select("_id").lean(),
    Delivery.find({ _id: { $in: deliveryIds }, isVoided: true }).select("_id").lean(),
  ]);
  const voided = new Set([
    ...voidedSlices.map(row => `SLICING_BATCH:${row._id}`),
    ...voidedDeliveries.map(row => `DELIVERY:${row._id}`),
  ]);
  const rows = products.map(product => {
    const id = String(product._id);
    const receipt = received.find(r => String(r._id) === id);
    const production = sliced.find(r => String(r._id) === id);
    const balance = reconcileChickenKilos(Number(product.stockKilos || 0), movements.filter(m => String(m.bodegaProductId) === id).map(m => ({ ...m, sourceVoided: voided.has(`${m.referenceType}:${m.referenceId}`) })), start, end);
    const receivedKilos = Number(receipt?.kilos || 0), slicedKilos = Number(production?.kilos || 0);
    const expected = Number(production?.expected || 0), actual = Number(production?.actual || 0);
    const difference = balance.opening + receivedKilos + balance.other - slicedKilos - balance.closing;
    const needsReview = balance.incomplete || Math.abs(difference) > 0.01 || balance.opening < -0.01 || balance.closing < -0.01;
    return { id, product: product.name, ...balance, receivedKilos, receivedHeads: Number(receipt?.heads || 0), slicedKilos, slicedHeads: Number(production?.heads || 0), expected, actual, variance: actual - expected, difference,
      status: needsReview ? "Check ledger" : Math.abs(balance.closing) > 0.01 ? "Unsliced stock" : actual !== expected ? "Check yield" : "Balanced" };
  }).filter(r => r.opening || r.closing || r.receivedKilos || r.slicedKilos || r.other || r.incomplete).sort((a, b) => a.product.localeCompare(b.product));
  return NextResponse.json({ success: true, data: rows, date: day });
}
