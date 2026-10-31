export type SaleFulfillmentState = {
  balance: number;
  status: "PENDING" | "UNPAID" | "PAID";
  fulfillmentStatus: "PENDING" | "DIRECT";
  recognizedAt?: Date;
};

export function initialSaleFulfillment(
  linkedToOutlet: boolean,
  totalAmount: number,
  saleDate: Date
): SaleFulfillmentState {
  if (linkedToOutlet) {
    return {
      balance: 0,
      status: "PENDING",
      fulfillmentStatus: "PENDING",
    };
  }

  return {
    balance: totalAmount,
    status: totalAmount === 0 ? "PAID" : "UNPAID",
    fulfillmentStatus: "DIRECT",
    recognizedAt: saleDate,
  };
}

export function isRevenueRecognized(fulfillmentStatus?: string | null, transactionType?: string | null) {
  return transactionType !== "INTERNAL_TRANSFER" && fulfillmentStatus !== "PENDING";
}
