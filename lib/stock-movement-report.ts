type LedgerTransaction = {
  _id?: unknown;
  bodegaProductId?: unknown;
  productId?: unknown;
  referenceId?: unknown;
  type?: unknown;
  quantity?: unknown;
  previousStock?: unknown;
  newStock?: unknown;
  createdAt?: unknown;
};

function id(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function direction(transaction: LedgerTransaction) {
  const previous = number(transaction.previousStock);
  const next = number(transaction.newStock);
  if (next > previous) return "IN";
  if (next < previous) return "OUT";
  return "NONE";
}

function quantity(transaction: LedgerTransaction) {
  const explicit = number(transaction.quantity);
  return explicit > 0
    ? explicit
    : Math.abs(
        number(transaction.newStock) - number(transaction.previousStock)
      );
}

/**
 * A void/edit writes an opposite VOID_REVERSAL entry instead of deleting the
 * original ledger entry. Business movement reports should omit both entries
 * in that cancelled pair while retaining any newly applied corrected entry.
 */
export function activeMovementTransactions<T extends LedgerTransaction>(
  transactions: T[]
) {
  const ordered = [...transactions].sort(
    (a, b) =>
      new Date(String(a.createdAt || 0)).getTime() -
      new Date(String(b.createdAt || 0)).getTime()
  );
  const unmatched = new Map<string, T[]>();
  const cancelled = new Set<string>();

  for (const transaction of ordered) {
    const transactionId = id(transaction._id);
    const productId = id(
      transaction.bodegaProductId ?? transaction.productId
    );
    const referenceId = id(transaction.referenceId);
    if (!transactionId || !productId || !referenceId) continue;

    const key = `${productId}:${referenceId}`;
    if (String(transaction.type).toUpperCase() !== "VOID_REVERSAL") {
      const entries = unmatched.get(key) || [];
      entries.push(transaction);
      unmatched.set(key, entries);
      continue;
    }

    const entries = unmatched.get(key) || [];
    const reversalDirection = direction(transaction);
    const reversalQuantity = quantity(transaction);
    const matchIndex = entries.findLastIndex(
      (entry) =>
        direction(entry) !== "NONE" &&
        direction(entry) !== reversalDirection &&
        Math.abs(quantity(entry) - reversalQuantity) < 0.000001
    );

    if (matchIndex < 0) continue;
    const [original] = entries.splice(matchIndex, 1);
    cancelled.add(id(original._id));
    cancelled.add(transactionId);
  }

  return transactions.filter(
    (transaction) => !cancelled.has(id(transaction._id))
  );
}
