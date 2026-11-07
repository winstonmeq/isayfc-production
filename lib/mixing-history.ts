export type MixingMovement = { _id?: unknown; referenceId?: unknown; type: string; productName: string; quantity: number; unitCost: number; baseUnit?: string; entryUnit?: string; transactionDate?: Date | string; remarks?: string; sourceChannel?: string; createdBy?: { name?: string; username?: string } | null };
const rounded = (value: number) => Math.round(value * 100) / 100;
export function mixingBatchDetails(id: string, rows: MixingMovement[]) {
  const mapped = rows.map(row => ({ productName: row.productName, quantity: Number(row.quantity || 0), unit: row.baseUnit || row.entryUnit || "QTY", unitCost: Number(row.unitCost || 0), cost: rounded(Number(row.quantity || 0) * Number(row.unitCost || 0)), remarks: row.remarks || "" }));
  const inputs = mapped.filter((_, index) => rows[index].type === "REPACK_OUT");
  const outputs = mapped.filter((_, index) => rows[index].type === "REPACK_IN");
  const outputRows = rows.filter(row => row.type === "REPACK_IN");
  return { id, batchNumber: `MIX-${id.toUpperCase()}`, date: outputRows[0]?.transactionDate || rows[0]?.transactionDate,
    createdBy: outputRows[0]?.createdBy?.name || outputRows[0]?.createdBy?.username || "Unknown / legacy",
    channel: outputRows[0]?.sourceChannel || "UNKNOWN", inputs, outputs,
    productionCost: rounded(outputRows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitCost || 0), 0)),
    consumedCost: rounded(rows.filter(row => row.type === "REPACK_OUT").reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitCost || 0), 0)),
    inputCount: inputs.length, status: "Posted" as const };
}
