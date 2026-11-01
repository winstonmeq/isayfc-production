"use client";
import { useEffect, useState } from "react";
export function ProductUnitSelect({ value, onChange, bodega = false }: { value: string; onChange: (value: string) => void; bodega?: boolean }) {
  const [units, setUnits] = useState<Array<{ code: string; name: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/units", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.message || "Unable to load units"); setUnits(json.data);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load units"); });
    return () => controller.abort();
  }, []);
  const options = bodega ? units.filter((unit) => ["PCS", "HEAD", ...(value === "PACK" ? ["PACK"] : [])].includes(unit.code)) : units;
  return <div className="space-y-1"><label className="text-sm font-medium">Unit<select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} disabled={bodega && value === "PACK"}>
    {!options.some((unit) => unit.code === value) && <option value={value}>{value}</option>}
    {options.map((unit) => <option key={unit.code} value={unit.code}>{unit.code} — {unit.name}</option>)}
  </select></label>{bodega && <p className="text-xs text-slate-500">Chicken packs and PCS per pack are configured in Standard PCS & Packs.</p>}{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</div>;
}
