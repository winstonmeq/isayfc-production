export function purchaseBatchSummaries(lines: Array<{ purchaseBatchId: unknown; productName?: unknown }>) {
  const summaries = new Map<string, { productNames: string[]; lineCount: number }>();
  for (const line of lines) {
    const id = String(line.purchaseBatchId || "");
    if (!id) continue;
    const summary = summaries.get(id) || { productNames: [], lineCount: 0 };
    summary.lineCount += 1;
    const name = String(line.productName || "").trim();
    if (name && !summary.productNames.includes(name)) summary.productNames.push(name);
    summaries.set(id, summary);
  }
  return summaries;
}
