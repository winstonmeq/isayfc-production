export type SaleFulfillmentState = {
  balance: number;
  status: "PENDING" | "UNPAID";
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
    status: "UNPAID",
    fulfillmentStatus: "DIRECT",
    recognizedAt: saleDate,
  };
}

export function isRevenueRecognized(fulfillmentStatus?: string | null) {
  return fulfillmentStatus !== "PENDING";
}
