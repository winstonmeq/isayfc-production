export type SlicingKiloRange = {
  minimumTotalKilos: number;
  maximumTotalKilos: number;
};

export function getSlicingVariance(actualSlicedPcs: unknown, totalStdPcs: unknown) {
  const actual = Number(actualSlicedPcs);
  const standard = Number(totalStdPcs);

  return (Number.isFinite(actual) ? actual : 0) - (Number.isFinite(standard) ? standard : 0);
}

export function getSlicingKiloRange(
  bags: number,
  minimumKilosPerBag: number,
  maximumKilosPerBag: number
): SlicingKiloRange {
  const safeBags = Math.max(0, bags);
  const safeMinimum = Math.max(0, minimumKilosPerBag);
  const safeMaximum = Math.max(0, maximumKilosPerBag);

  return {
    minimumTotalKilos: safeBags * safeMinimum,
    maximumTotalKilos: safeBags * safeMaximum,
  };
}

export function getSlicingKiloIssue({
  bags,
  kilosPerBag,
  minimumKilosPerBag,
  maximumKilosPerBag,
}: {
  bags: number;
  kilosPerBag: number;
  minimumKilosPerBag: number;
  maximumKilosPerBag: number;
}) {
  if (bags <= 0) return null;

  const range = getSlicingKiloRange(
    bags,
    minimumKilosPerBag,
    maximumKilosPerBag
  );

  if (minimumKilosPerBag > 0 && kilosPerBag < minimumKilosPerBag) {
    return { kind: "below-minimum" as const, ...range };
  }

  if (maximumKilosPerBag > 0 && kilosPerBag > maximumKilosPerBag) {
    return { kind: "above-maximum" as const, ...range };
  }

  return null;
}
