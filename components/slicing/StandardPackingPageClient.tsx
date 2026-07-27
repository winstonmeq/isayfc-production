"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BodegaProductOption = {
  _id: string;
  name: string;
  categoryName?: string;
  stockQty?: number;
};

type StandardPackingRow = {
  _id: string;
  wholeChickenId: string;
  wholeChickenName: string;
  productId: string;
  productName: string;
  standardPacking: number;
  minimumKilos: number;
  maximumKilos: number;
  standardSlice: number;
  chickenSizeType: string;
};

const emptyForm = {
  wholeChickenId: "",
  productId: "",
  standardPacking: "0",
  minimumKilos: "0",
  maximumKilos: "0",
  standardSlice: "0",
  chickenSizeType: "",
};

export function StandardPackingPageClient() {
  const [standards, setStandards] = useState<StandardPackingRow[]>([]);
  const [bodegaProducts, setBodegaProducts] = useState<BodegaProductOption[]>(
    []
  );

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingItem, setEditingItem] = useState<StandardPackingRow | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const filteredStandards = standards.filter((item) => {
    const value = appliedSearch.toLowerCase();

    if (!value) return true;

    return (
      item.wholeChickenName.toLowerCase().includes(value) ||
      item.productName.toLowerCase().includes(value) ||
      item.chickenSizeType.toLowerCase().includes(value)
    );
  });

  async function loadBodegaProducts() {
    try {
      const res = await fetch("/api/bodega-products?limit=1000", {
        cache: "no-store",
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setBodegaProducts(json.data || []);
      }
    } catch {
      toast.error("Failed to load bodega products.");
    }
  }

  async function loadStandards() {
    setIsLoading(true);

    try {
      const res = await fetch("/api/slicing/standard-packing", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load standard packing.");
      }

      setStandards(json.data || []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load standard packing."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBodegaProducts();
    void loadStandards();
  }, []);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openAddDialog() {
    setEditingItem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(item: StandardPackingRow) {
    setEditingItem(item);
    setForm({
      wholeChickenId: item.wholeChickenId,
      productId: item.productId,
      standardPacking: String(item.standardPacking),
      minimumKilos: String(item.minimumKilos || 0),
      maximumKilos: String(item.maximumKilos || 0),
      standardSlice: String(item.standardSlice),
      chickenSizeType: item.chickenSizeType || "",
    });
    setDialogOpen(true);
  }

  async function saveStandard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.wholeChickenId) {
      toast.error("Select whole chicken bodega product.");
      return;
    }

    if (!form.productId) {
      toast.error("Select output bodega product.");
      return;
    }

    if ((Number(form.standardPacking) || 0) <= 0) {
      toast.error("Standard packing / pcs per pack must be greater than zero.");
      return;
    }

    if ((Number(form.standardSlice) || 0) <= 0) {
      toast.error("Standard slice / pcs per head must be greater than zero.");
      return;
    }

    if (
      Number(form.maximumKilos) > 0 &&
      Number(form.maximumKilos) < Number(form.minimumKilos)
    ) {
      toast.error("Maximum kilos must be greater than or equal to minimum kilos.");
      return;
    }

    setIsSaving(true);

    try {
      const url = editingItem
        ? `/api/slicing/standard-packing/${editingItem._id}`
        : "/api/slicing/standard-packing";

      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save standard packing.");
      }

      toast.success(json.message || "Standard packing saved successfully.");
      setDialogOpen(false);
      await loadStandards();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save standard packing."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteStandard(item: StandardPackingRow) {
    const confirmed = window.confirm(
      `Delete standard ${item.wholeChickenName} → ${item.productName}?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/slicing/standard-packing/${item._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete standard packing.");
      }

      toast.success(json.message || "Standard packing deleted successfully.");
      await loadStandards();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete standard packing."
      );
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Standard PCS & Packs"
        description="Standard Slice = pcs per whole chicken/head. Standard Packing = pcs per full pack."
        actions={
          <Button onClick={openAddDialog} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Standard
          </Button>
        }
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search whole chicken, output product, or size..."
            onKeyDown={(event) => {
              if (event.key === "Enter") setAppliedSearch(search.trim());
            }}
          />

          <Button onClick={() => setAppliedSearch(search.trim())}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="text-white">Whole Chicken</TableHead>
                  <TableHead className="text-white">Output Product</TableHead>
                  <TableHead className="text-right text-white">
                    Standard Packing
                    <span className="block text-xs font-normal text-slate-300">pcs per pack</span>
                  </TableHead>
                  <TableHead className="text-right text-white">
                    Minimum kg/bag
                  </TableHead>
                  <TableHead className="text-right text-white">
                    Maximum kg/bag
                  </TableHead>
                  <TableHead className="text-right text-white">
                    Standard Slice
                    <span className="block text-xs font-normal text-slate-300">pcs per head</span>
                  </TableHead>
                  <TableHead className="text-white">
                    Chicken Size Type
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filteredStandards.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No standard packing records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStandards.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell className="font-medium">
                        {item.wholeChickenName}
                      </TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-right">
                        {item.standardPacking.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.minimumKilos > 0
                          ? item.minimumKilos.toFixed(2)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.maximumKilos > 0
                          ? item.maximumKilos.toFixed(2)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.standardSlice.toLocaleString()}
                      </TableCell>
                      <TableCell>{item.chickenSizeType || "-"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(item)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteStandard(item)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {editingItem ? "Edit Standard Packing" : "Add Standard Packing"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={saveStandard} className="space-y-4">
            <div className="space-y-2">
              <Label>Whole Chicken / Bodega Product</Label>
              <Select
                value={form.wholeChickenId}
                onValueChange={(value) => updateForm("wholeChickenId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select whole chicken from bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegaProducts.map((product) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Output Product / Bodega Product</Label>
              <Select
                value={form.productId}
                onValueChange={(value) => updateForm("productId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select output product from bodega" />
                </SelectTrigger>
                <SelectContent>
                  {bodegaProducts.map((product) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Standard Packing (pcs per full pack)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.standardPacking}
                  onChange={(event) =>
                    updateForm("standardPacking", event.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Example: C10 = 50 pcs per pack.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Minimum kg/bag</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumKilos}
                  onChange={(event) =>
                    updateForm("minimumKilos", event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Maximum kg/bag</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maximumKilos}
                  onChange={(event) =>
                    updateForm("maximumKilos", event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Standard Slice (pcs per whole chicken/head)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.standardSlice}
                  onChange={(event) =>
                    updateForm("standardSlice", event.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Example: OS1 to C10 = 26 pcs per head.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Chicken Size Type</Label>
                <Input
                  value={form.chickenSizeType}
                  onChange={(event) =>
                    updateForm("chickenSizeType", event.target.value)
                  }
                  placeholder="e.g. OS1, PS3, C1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={isSaving}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
