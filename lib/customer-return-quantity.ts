export function customerReturnQuote(sold: number, alreadyReturned: number, requested: number, netAmount: number, soldBaseQuantity: number) {
  if (![sold, alreadyReturned, requested, netAmount, soldBaseQuantity].every(Number.isFinite) || sold <= 0 || alreadyReturned < 0 || requested <= 0 || netAmount < 0 || soldBaseQuantity <= 0) throw new Error("Invalid original sale or return quantities.");
  if (requested + alreadyReturned > sold + 0.000001) throw new Error("Returned quantity exceeds the unreturned sold quantity.");
  return { baseQuantity: requested * soldBaseQuantity / sold, creditAmount: Math.round(requested * netAmount / sold * 100) / 100 };
}
