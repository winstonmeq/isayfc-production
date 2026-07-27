export type InventoryBaseUnit = "PCS" | "KG" | "QTY";
export type InventoryEntryUnit = InventoryBaseUnit | "PACK" | "BAG";

export type PackingSnapshot = {
  packingId?: string;
  unit: InventoryEntryUnit;
  baseUnit: InventoryBaseUnit;
  multiplier: number;
  label?: string;
};

export type StockBreakdown = {
  baseQty: number;
  fullUnits: number;
  looseBaseQty: number;
  multiplier: number;
};

export function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function positiveMultiplier(value: unknown) {
  const parsed = Math.trunc(finiteNumber(value));
  return parsed > 0 ? parsed : 1;
}

export function isPackagedUnit(unit: unknown) {
  return unit === "PACK" || unit === "BAG";
}

export function toBaseQuantity(
  enteredQty: unknown,
  packing?: Pick<PackingSnapshot, "unit" | "multiplier"> | null
) {
  const qty = finiteNumber(enteredQty);
  if (!packing || !isPackagedUnit(packing.unit)) return qty;
  return qty * positiveMultiplier(packing.multiplier);
}

export function fromBaseQuantity(
  baseQty: unknown,
  packing?: Pick<PackingSnapshot, "unit" | "multiplier"> | null
): StockBreakdown {
  const quantity = finiteNumber(baseQty);
  const multiplier =
    packing && isPackagedUnit(packing.unit)
      ? positiveMultiplier(packing.multiplier)
      : 1;

  if (multiplier <= 1) {
    return {
      baseQty: quantity,
      fullUnits: 0,
      looseBaseQty: quantity,
      multiplier: 1,
    };
  }

  const fullUnits = Math.floor(quantity / multiplier);
  return {
    baseQty: quantity,
    fullUnits,
    looseBaseQty: quantity - fullUnits * multiplier,
    multiplier,
  };
}

export function toBaseUnitCost(
  packageCost: unknown,
  packing?: Pick<PackingSnapshot, "unit" | "multiplier"> | null
) {
  const cost = finiteNumber(packageCost);
  if (!packing || !isPackagedUnit(packing.unit)) return cost;
  return cost / positiveMultiplier(packing.multiplier);
}

export function formatStock(
  baseQty: unknown,
  packing?: Pick<
    PackingSnapshot,
    "unit" | "baseUnit" | "multiplier" | "label"
  > | null
) {
  const breakdown = fromBaseQuantity(baseQty, packing);
  const baseUnit = packing?.baseUnit || "QTY";

  if (!packing || !isPackagedUnit(packing.unit)) {
    return `${breakdown.baseQty.toLocaleString()} ${baseUnit.toLowerCase()}`;
  }

  const packageLabel = packing.unit.toLowerCase();
  const loose = breakdown.looseBaseQty;
  const detail = packing.label ? ` (${packing.label})` : "";
  return `${breakdown.fullUnits.toLocaleString()} ${packageLabel}(s) + ${loose.toLocaleString()} ${baseUnit.toLowerCase()}${detail}`;
}

export function packingSnapshot({
  packingId,
  unit,
  baseUnit = "PCS",
  multiplier,
  label,
}: {
  packingId?: string;
  unit: InventoryEntryUnit;
  baseUnit?: InventoryBaseUnit;
  multiplier?: unknown;
  label?: string;
}): PackingSnapshot {
  return {
    packingId,
    unit,
    baseUnit,
    multiplier: isPackagedUnit(unit) ? positiveMultiplier(multiplier) : 1,
    label,
  };
}
