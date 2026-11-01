/** Receipt posts allocations without creating revenue, cash or customer debt. */
export function outletSaleRecognitionUpdate(date = new Date()) {
  return [{ $set: {
    fulfillmentStatus: "RECOGNIZED",
    recognizedAt: date,
    status: { $cond: [{ $eq: ["$transactionType", "INTERNAL_TRANSFER"] }, "INTERNAL", { $cond: [{ $lte: ["$totalAmount", "$paidAmount"] }, "PAID", { $cond: [{ $gt: ["$paidAmount", 0] }, "PARTIAL", "UNPAID"] }] }] },
    balance: { $cond: [{ $eq: ["$transactionType", "INTERNAL_TRANSFER"] }, 0, { $max: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] }] },
  } }];
}
