"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  ErpField,
  ErpKeyValue,
  ErpMetricCard,
  ErpMobileCard,
  ErpPage,
  ErpPageHeader,
  ErpSection,
} from "@/components/erp/ErpShell";
import { formatDecimal, formatWholeNumber, numberValue } from "@/components/erp/StockDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SlicingStandardOption = {
  _id: string;
  wholeChickenId: string;
  wholeChickenName: string;
  productId: string;
  productName: string;
  standardPacking: number;
  standardSlice: number;
  chickenSizeType?: string;
};

type SlicingRow = {
  standardId: string;
  wholeChickenId: string;
  wholeChickenName: string;
  productId: string;
  productName: string;
  standardPacking: number;
  standardSlice: number;
  bags: string;
  heads: string;
  kilos: string;
  actualSlicedPcs: string;
};

const MIN_SLICING_YIELD_RATE = 70;
const MAX_SLICING_YIELD_RATE = 120;
const MAX_KILOS_PER_HEAD = 4;
const MAX_HEADS_PER_ROW = 1000;

const emptyRow: SlicingRow = {
  standardId: "",
  wholeChickenId: "",
  wholeChickenName: "",
  productId: "",
  productName: "",
  standardPacking: 0,
  standardSlice: 0,
  bags: "0",
  heads: "0",
  kilos: "0",
  actualSlicedPcs: "0",
};

function calculateRow(row: SlicingRow) {
  const heads = Math.max(0, Math.trunc(numberValue(row.heads)));
  const actualSlicedPcs = Math.max(0, Math.trunc(numberValue(row.actualSlicedPcs)));
  const standardSlice = Math.max(0, Math.trunc(numberValue(row.standardSlice)));
  const standardPacking = Math.max(0, Math.trunc(numberValue(row.standardPacking)));

  const totalStdPcs = heads * standardSlice;
  const actualPacks = standardPacking > 0 ? Math.floor(actualSlicedPcs / standardPacking) : 0;
  const butal = standardPacking > 0 ? actualSlicedPcs - actualPacks * standardPacking : actualSlicedPcs;
  const variance = actualSlicedPcs - totalStdPcs;
  const yieldRate = totalStdPcs > 0 ? (actualSlicedPcs / totalStdPcs) * 100 : 0;

  return { totalStdPcs, actualPacks, butal, variance, yieldRate };
}

function formatPercent(value: number) {
  return `${numberValue(value).toFixed(2)}%`;
}

function hasRowEntry(row: SlicingRow) {
  return Boolean(row.standardId) ||
    numberValue(row.bags) > 0 ||
    numberValue(row.heads) > 0 ||
    numberValue(row.kilos) > 0 ||
    numberValue(row.actualSlicedPcs) > 0;
}

function getRowIssues(row: SlicingRow) {
  const issues: string[] = [];
  const heads = numberValue(row.heads);
  const bags = numberValue(row.bags);
  const kilos = numberValue(row.kilos);
  const actualSlicedPcs = numberValue(row.actualSlicedPcs);
  const computed = calculateRow(row);

  if (!row.standardId) {
    issues.push("Select a slicing standard.");
  }

  if (heads <= 0) {
    issues.push("Heads must be greater than zero.");
  } else {
    if (!Number.isInteger(heads)) {
      issues.push("Heads must be a whole number.");
    }
    if (heads > MAX_HEADS_PER_ROW) {
      issues.push(`Heads cannot exceed ${MAX_HEADS_PER_ROW.toLocaleString()} in one row.`);
    }
  }

  if (bags > 0 && !Number.isInteger(bags)) {
    issues.push("Bags must be a whole number.");
  }

  if (kilos > 0 && heads > 0 && kilos / heads > MAX_KILOS_PER_HEAD) {
    issues.push(`Kilos looks too high (${(kilos / heads).toFixed(2)} kg/head).`);
  }

  if (actualSlicedPcs <= 0) {
    issues.push("Actual sliced PCS must be greater than zero.");
  } else if (!Number.isInteger(actualSlicedPcs)) {
    issues.push("Actual sliced PCS must be a whole number.");
  }

  if (
    row.standardId &&
    computed.totalStdPcs > 0 &&
    (computed.yieldRate < MIN_SLICING_YIELD_RATE ||
      computed.yieldRate > MAX_SLICING_YIELD_RATE)
  ) {
    issues.push(
      `Yield is ${computed.yieldRate.toFixed(2)}%. Recount before saving.`
    );
  }

  return issues;
}

function StandardPicker({
  standards,
  value,
  onSelect,
}: {
  standards: SlicingStandardOption[];
  value: string;
  onSelect: (standard: SlicingStandardOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = standards.find((standard) => standard._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="h-11 w-full justify-between bg-white">
          {selected ? (
            <span className="truncate">{selected.wholeChickenName} to {selected.productName}</span>
          ) : (
            <span className="text-muted-foreground">Select standard...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search standard, whole chicken, product..." />
          <CommandList>
            <CommandEmpty>No standard found.</CommandEmpty>
            <CommandGroup>
              {standards.map((standard) => (
                <CommandItem
                  key={standard._id}
                  value={`${standard.wholeChickenName} ${standard.productName} ${standard.chickenSizeType || ""}`}
                  onSelect={() => {
                    onSelect(standard);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === standard._id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="font-semibold">{standard.wholeChickenName} to {standard.productName}</div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">Std Slice: {formatWholeNumber(standard.standardSlice)} pcs/head</Badge>
                      <Badge variant="secondary">Pack: {formatWholeNumber(standard.standardPacking)} pcs</Badge>
                      {standard.chickenSizeType ? <Badge variant="outline">{standard.chickenSizeType}</Badge> : null}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AddSlicingPageClient() {
  const router = useRouter();
  const [standards, setStandards] = useState<SlicingStandardOption[]>([]);
  const [slicingDate, setSlicingDate] = useState(new Date().toISOString().slice(0, 10));
  const [slicer, setSlicer] = useState("");
  const [packer, setPacker] = useState("");
  const [rows, setRows] = useState<SlicingRow[]>([{ ...emptyRow }]);
  const [isLoadingStandards, setIsLoadingStandards] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

	  const totals = useMemo(() => {
    const computed = rows.reduce(
      (sum, row) => {
        const rowComputed = calculateRow(row);
        return {
          heads: sum.heads + numberValue(row.heads),
          kilos: sum.kilos + numberValue(row.kilos),
          totalStdPcs: sum.totalStdPcs + rowComputed.totalStdPcs,
          actualSlicedPcs: sum.actualSlicedPcs + numberValue(row.actualSlicedPcs),
          packs: sum.packs + rowComputed.actualPacks,
          butal: sum.butal + rowComputed.butal,
          variance: sum.variance + rowComputed.variance,
        };
      },
      { heads: 0, kilos: 0, totalStdPcs: 0, actualSlicedPcs: 0, packs: 0, butal: 0, variance: 0 }
    );

    return {
      ...computed,
      yieldRate: computed.totalStdPcs > 0 ? (computed.actualSlicedPcs / computed.totalStdPcs) * 100 : 0,
    };
	  }, [rows]);

	  const hasBlockingIssues = useMemo(
	    () => rows.some((row) => hasRowEntry(row) && getRowIssues(row).length > 0),
	    [rows]
	  );

  async function loadStandards() {
    setIsLoadingStandards(true);
    try {
      const res = await fetch("/api/slicing/standards", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load slicing standards.");
      }

      setStandards(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load slicing standards.");
    } finally {
      setIsLoadingStandards(false);
    }
  }

	  useEffect(() => {
	    const timeoutId = window.setTimeout(() => {
	      void loadStandards();
	    }, 0);

	    return () => window.clearTimeout(timeoutId);
	  }, []);

  function updateRow(index: number, field: keyof SlicingRow, value: string) {
    setRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function selectStandard(index: number, standard: SlicingStandardOption) {
    setRows((current) => {
      const next = [...current];
      next[index] = {
        ...next[index],
        standardId: standard._id,
        wholeChickenId: standard.wholeChickenId,
        wholeChickenName: standard.wholeChickenName,
        productId: standard.productId,
        productName: standard.productName,
        standardPacking: numberValue(standard.standardPacking),
        standardSlice: numberValue(standard.standardSlice),
      };
      return next;
    });
  }

  function addRow() {
    setRows((current) => [...current, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((current) => {
      if (current.length === 1) return current;
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  async function saveAll() {
    if (!slicingDate) {
      toast.error("Slicing date is required.");
      return;
    }
    if (!slicer.trim()) {
      toast.error("Slicer name is required.");
      return;
    }
    if (!packer.trim()) {
      toast.error("Packer name is required.");
      return;
    }

    const enteredRows = rows.filter(hasRowEntry);
    if (enteredRows.length === 0) {
      toast.error("Add at least one valid slicing row.");
      return;
    }

    const invalidRow = enteredRows.find((row) => getRowIssues(row).length > 0);
    if (invalidRow) {
      toast.error(getRowIssues(invalidRow)[0] || "Please check the slicing rows before saving.");
      return;
    }

    const validRows = enteredRows.filter((row) => row.standardId && numberValue(row.heads) > 0 && numberValue(row.actualSlicedPcs) > 0);

    setIsSaving(true);
    try {
      const payload = {
        slicingDate,
        slicer,
        packer,
        items: validRows.map((row) => {
          const computed = calculateRow(row);
          return {
            standardId: row.standardId,
            wholeChickenId: row.wholeChickenId,
            mainProductId: row.wholeChickenId,
            productId: row.productId,
            slicedProductId: row.productId,
            bags: numberValue(row.bags),
            heads: numberValue(row.heads),
            qtyToSlice: numberValue(row.heads),
            kilos: numberValue(row.kilos),
            standardSlice: numberValue(row.standardSlice),
            standardPacking: numberValue(row.standardPacking),
            totalStdPcs: computed.totalStdPcs,
            actualSlicedPcs: numberValue(row.actualSlicedPcs),
            actualPacks: computed.actualPacks,
            butal: computed.butal,
            variance: computed.variance,
          };
        }),
      };

      const res = await fetch("/api/slicing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save slicing records.");
      }

      toast.success(json.message || "Slicing records saved successfully.");
      router.push("/slicing");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save slicing records.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ErpPage>
      <ErpPageHeader
        eyebrow="Production Entry"
        title="Add New Slicing"
        description="Record slicing activities with clear standard PCS, actual PCS, full packs, loose PCS, and variance. Profit information is hidden from this employee-facing screen."
        actions={
          <Button variant="secondary" onClick={() => router.push("/slicing")}>
            Back to History
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ErpMetricCard label="Heads" value={formatWholeNumber(totals.heads)} description="Whole chickens selected" tone="blue" />
        <ErpMetricCard label="Standard PCS" value={formatWholeNumber(totals.totalStdPcs)} description="Heads multiplied by standard slice" tone="violet" />
        <ErpMetricCard label="Actual PCS" value={formatWholeNumber(totals.actualSlicedPcs)} description={`${formatWholeNumber(totals.packs)} packs / ${formatWholeNumber(totals.butal)} loose pcs`} tone="emerald" />
        <ErpMetricCard label="Yield" value={formatPercent(totals.yieldRate)} description={`Variance ${formatWholeNumber(totals.variance)} pcs`} tone={totals.variance < 0 ? "rose" : "amber"} />
      </div>

      <ErpSection title="Slicing Details" description="One batch can contain multiple sliced products.">
        <div className="grid gap-4 md:grid-cols-3">
          <ErpField label="Slicing Date">
            <Input type="date" value={slicingDate} onChange={(event) => setSlicingDate(event.target.value)} />
          </ErpField>
          <ErpField label="Slicer">
            <Input value={slicer} onChange={(event) => setSlicer(event.target.value)} placeholder="Enter slicer name" />
          </ErpField>
          <ErpField label="Packer">
            <Input value={packer} onChange={(event) => setPacker(event.target.value)} placeholder="Enter packer name" />
          </ErpField>
        </div>
      </ErpSection>

      <ErpSection
        title="Slicing Items"
        description="Standard Slice means PCS per head. Standard Packing means PCS per pack."
        actions={
          <Button type="button" variant="secondary" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" />
            Add Row
          </Button>
        }
      >
        {isLoadingStandards ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="space-y-4">
	            {rows.map((row, index) => {
	              const computed = calculateRow(row);
	              const rowIssues = hasRowEntry(row) ? getRowIssues(row) : [];
	              return (
	                <ErpMobileCard key={index} className="bg-slate-50/60">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-950">Item #{index + 1}</div>
                      <p className="text-xs text-slate-500">{row.wholeChickenName && row.productName ? `${row.wholeChickenName} to ${row.productName}` : "Select slicing standard"}</p>
                    </div>
                    <Button type="button" size="sm" variant="destructive" onClick={() => removeRow(index)} disabled={rows.length === 1}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                      <Label>Standard</Label>
                      <StandardPicker standards={standards} value={row.standardId} onSelect={(standard) => selectStandard(index, standard)} />
                      <p className="mt-2 text-xs text-slate-500">
                        Std Slice: {formatWholeNumber(row.standardSlice)} pcs/head • Pack Size: {formatWholeNumber(row.standardPacking)} pcs/pack
                      </p>
                    </div>
                    <ErpField label="Bags">
                      <Input type="number" min="0" value={row.bags} onChange={(event) => updateRow(index, "bags", event.target.value)} />
                    </ErpField>
                    <ErpField label="Heads">
                      <Input type="number" min="0" value={row.heads} onChange={(event) => updateRow(index, "heads", event.target.value)} />
                    </ErpField>
                    <ErpField label="Kilos">
                      <Input type="number" min="0" step="0.01" value={row.kilos} onChange={(event) => updateRow(index, "kilos", event.target.value)} />
                    </ErpField>
                    <ErpField label="Actual Sliced PCS">
                      <Input type="number" min="0" value={row.actualSlicedPcs} onChange={(event) => updateRow(index, "actualSlicedPcs", event.target.value)} />
                    </ErpField>
                    <ErpField label="Std PCS">
                      <Input value={computed.totalStdPcs} readOnly />
                    </ErpField>
                    <ErpField label="Full Packs">
                      <Input value={computed.actualPacks} readOnly />
                    </ErpField>
                    <ErpField label="Loose PCS">
                      <Input value={computed.butal} readOnly />
                    </ErpField>
                    <ErpField label="Variance">
                      <Input
                        value={computed.variance}
                        readOnly
                        className={cn(computed.variance < 0 ? "font-bold text-red-600" : computed.variance > 0 ? "font-bold text-emerald-700" : "")}
                      />
                    </ErpField>
                  </div>

	                  <div className="mt-4 grid gap-3 md:grid-cols-5">
	                    <ErpKeyValue label="Standard Slice" value={`${formatWholeNumber(row.standardSlice)} pcs/head`} />
	                    <ErpKeyValue label="Pack Size" value={`${formatWholeNumber(row.standardPacking)} pcs/pack`} />
	                    <ErpKeyValue label="Actual Packs" value={formatWholeNumber(computed.actualPacks)} />
	                    <ErpKeyValue label="Loose PCS" value={formatWholeNumber(computed.butal)} />
	                    <ErpKeyValue label="Yield" value={formatPercent(computed.yieldRate)} />
	                  </div>

	                  {rowIssues.length > 0 ? (
	                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
	                      <div className="mb-1 flex items-center gap-2 font-bold">
	                        <AlertTriangle className="h-4 w-4" />
	                        Check this row before saving
	                      </div>
	                      <ul className="list-disc space-y-1 pl-5">
	                        {rowIssues.map((issue) => (
	                          <li key={issue}>{issue}</li>
	                        ))}
	                      </ul>
	                    </div>
	                  ) : null}
	                </ErpMobileCard>
	              );
	            })}
          </div>
        )}

        <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <div>Total Heads: <span className="font-bold">{formatWholeNumber(totals.heads)}</span></div>
            <div>Total Kilos: <span className="font-bold">{formatDecimal(totals.kilos, 2)}</span></div>
            <div>Std PCS: <span className="font-bold">{formatWholeNumber(totals.totalStdPcs)}</span></div>
            <div>Actual PCS: <span className="font-bold">{formatWholeNumber(totals.actualSlicedPcs)}</span></div>
            <div>Packs: <span className="font-bold">{formatWholeNumber(totals.packs)}</span></div>
            <div>Loose: <span className="font-bold">{formatWholeNumber(totals.butal)}</span></div>
            <div>Variance: <span className={cn("font-bold", totals.variance < 0 ? "text-red-600" : "text-emerald-700")}>{formatWholeNumber(totals.variance)}</span></div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/slicing")}>
            Cancel
          </Button>
	          <Button type="button" onClick={saveAll} disabled={isSaving || hasBlockingIssues}>
	            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
	            Save All
	          </Button>
        </div>
      </ErpSection>
    </ErpPage>
  );
}
