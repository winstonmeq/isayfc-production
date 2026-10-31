"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  ErpEmptyState,
  ErpField,
  ErpKeyValue,
  ErpMobileCard,
  ErpPage,
  ErpSection,
  ErpToolbar,
} from "@/components/erp/ErpShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OutletStatus = "ACTIVE" | "INACTIVE";

type OutletItem = {
  _id: string;
  name: string;
  code: string;
  address: string;
  managerName: string;
  contactNumber: string;
  remarks: string;
  status: OutletStatus;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  name: "",
  code: "",
  address: "",
  managerName: "",
  contactNumber: "",
  remarks: "",
  status: "ACTIVE" as OutletStatus,
};

export function OutletsPageClient() {
  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("25");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletItem | null>(null);
  const [form, setForm] = useState(emptyForm);


  async function loadOutlets() {
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit });
    if (search) params.set("search", search);
    if (status !== "ALL") params.set("status", status);

    try {
      const res = await fetch(`/api/outlets?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load outlets.");
      }

      setOutlets(json.data || []);
      setMeta(json.meta || { page, limit: Number(limit), total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load outlets.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOutlets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, status]);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [name]: value } as typeof emptyForm));
  }

  function openCreateDialog() {
    setEditingOutlet(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(outlet: OutletItem) {
    setEditingOutlet(outlet);
    setForm({
      name: outlet.name,
      code: outlet.code,
      address: outlet.address || "",
      managerName: outlet.managerName || "",
      contactNumber: outlet.contactNumber || "",
      remarks: outlet.remarks || "",
      status: outlet.status || "ACTIVE",
    });
    setDialogOpen(true);
  }

  async function saveOutlet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch(
        editingOutlet ? `/api/outlets/${editingOutlet._id}` : "/api/outlets",
        {
          method: editingOutlet ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save outlet.");
      }

      toast.success(json.message || "Outlet saved successfully.");
      setDialogOpen(false);
      await loadOutlets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save outlet.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteOutlet(outlet: OutletItem) {
    const confirmed = window.confirm(`Delete outlet ${outlet.name}?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/outlets/${outlet._id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete outlet.");
      }

      toast.success(json.message || "Outlet deleted successfully.");
      await loadOutlets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete outlet.");
    }
  }

  return (
    <ErpPage>
      <ErpToolbar>
        <ErpField label="Search">
          <div className="flex gap-2">
            <Input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Name, code, manager, address..."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setSearch(draftSearch.trim());
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPage(1);
                setSearch(draftSearch.trim());
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </ErpField>

        <ErpField label="Status">
          <Select
            value={status}
            onValueChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>

        <ErpField label="Rows">
          <Select
            value={limit}
            onValueChange={(value) => {
              setPage(1);
              setLimit(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </ErpField>

        <div className="flex items-end gap-2 xl:col-span-2 xl:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraftSearch("");
              setSearch("");
              setStatus("ALL");
              setPage(1);
            }}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={openCreateDialog} className="rounded-2xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Outlet
          </Button>
        </div>
      </ErpToolbar>

      <ErpSection
        title="Outlet List"
        description="Each outlet will later receive customer deliveries and maintain its own POS inventory."
      >
        {isLoading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : outlets.length === 0 ? (
          <ErpEmptyState
            title="No outlets found"
            description="Create the first outlet to start separating inventory, POS, sales, and expenses by branch."
            action={<Button onClick={openCreateDialog}>Add Outlet</Button>}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Outlet</TableHead>
                    <TableHead className="text-white">Manager</TableHead>
                    <TableHead className="text-white">Contact</TableHead>
                    <TableHead className="text-white">Address</TableHead>
                    <TableHead className="text-center text-white">Status</TableHead>
                    <TableHead className="text-right text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outlets.map((outlet) => (
                    <TableRow key={outlet._id}>
                      <TableCell>
                        <div className="font-black text-slate-950">{outlet.name}</div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {outlet.code}
                        </div>
                      </TableCell>
                      <TableCell>{outlet.managerName || "-"}</TableCell>
                      <TableCell>{outlet.contactNumber || "-"}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{outlet.address || "-"}</TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-black",
                            outlet.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {outlet.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(outlet)}>
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteOutlet(outlet)}>
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {outlets.map((outlet) => (
                <ErpMobileCard key={outlet._id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-950">{outlet.name}</div>
                      <div className="text-xs font-semibold text-slate-500">{outlet.code}</div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[11px] font-black",
                        outlet.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {outlet.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <ErpKeyValue label="Manager" value={outlet.managerName || "-"} />
                    <ErpKeyValue label="Contact" value={outlet.contactNumber || "-"} />
                    <ErpKeyValue label="Address" value={outlet.address || "-"} />
                    <ErpKeyValue label="Remarks" value={outlet.remarks || "-"} />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(outlet)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteOutlet(outlet)}>
                      Delete
                    </Button>
                  </div>
                </ErpMobileCard>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
              <div>
                Showing page {meta.page} of {meta.totalPages} • {meta.total.toLocaleString()} rows
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </ErpSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingOutlet ? "Edit Outlet" : "Add Outlet"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={saveOutlet} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Outlet Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="e.g. Matina Outlet"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Outlet Code</Label>
                <Input
                  value={form.code}
                  onChange={(event) => updateForm("code", event.target.value)}
                  placeholder="e.g. MATINA"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <Input
                  value={form.managerName}
                  onChange={(event) => updateForm("managerName", event.target.value)}
                  placeholder="Outlet manager"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input
                  value={form.contactNumber}
                  onChange={(event) => updateForm("contactNumber", event.target.value)}
                  placeholder="Mobile or phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => updateForm("status", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
                placeholder="Outlet address"
              />
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(event) => updateForm("remarks", event.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>
    </ErpPage>
  );
}
