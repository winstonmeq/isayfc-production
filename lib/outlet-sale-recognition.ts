/** Receipt recognizes the main outlet-customer sale; retail sales remain separate. */
export function outletSaleRecognitionUpdate(date = new Date()) {
  return [{ $set: {
    fulfillmentStatus: "RECOGNIZED",
    recognizedAt: date,
    status: { $cond: [{ $lte: ["$totalAmount", "$paidAmount"] }, "PAID", { $cond: [{ $gt: ["$paidAmount", 0] }, "PARTIAL", "UNPAID"] }] },
    balance: { $max: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] },
  } }];
}
