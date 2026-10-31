// components/master-data/MasterDataPage.tsx
"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type MasterDataItem = {
  _id: string;
  [key: string]: string | number | boolean | null | undefined;
};

type FieldOption = {
  label: string;
  value: string;
};

export type MasterDataField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  inputType?: "text" | "email" | "tel" | "textarea" | "select";
  options?: FieldOption[];
  defaultValue?: string;
};

export type MasterDataColumn = {
  key: string;
  label: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ApiResponse = {
  success: boolean;
  message?: string;
  data?: MasterDataItem[];
  meta?: ApiMeta;
};

export function MasterDataPage({
  cardTitle,
  apiPath,
  resourceName,
  searchPlaceholder,
  fields,
  columns,
}: {
  cardTitle: string;
  apiPath: string;
  resourceName: string;
  searchPlaceholder: string;
  fields: MasterDataField[];
  columns: MasterDataColumn[];
}) {
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("10");
  const [page, setPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});

  const emptyFormState = useMemo(() => {
    const state: Record<string, string> = {};

    for (const field of fields) {
      state[field.name] = field.defaultValue ?? "";
    }

    return state;
  }, [fields]);

  async function loadItems() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (search) {
      params.set("search", search);
    }

    try {
      const res = await fetch(`${apiPath}?${params.toString()}`, {
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed to load ${resourceName}.`);
      }

      setItems(json.data || []);
      setMeta(
        json.meta || {
          page,
          limit: Number(limit),
          total: 0,
          totalPages: 1,
        }
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to load ${resourceName}.`
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath, page, limit, search]);

  function openCreateDialog() {
    setEditingItem(null);
    setFormState(emptyFormState);
    setDialogOpen(true);
  }

  function openEditDialog(item: MasterDataItem) {
    const nextState: Record<string, string> = {};

    for (const field of fields) {
      nextState[field.name] = String(
        item[field.name] ?? field.defaultValue ?? ""
      );
    }

    setEditingItem(item);
    setFormState(nextState);
    setDialogOpen(true);
  }

  function updateField(name: string, value: string) {
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);

    try {
      const url = editingItem ? `${apiPath}/${editingItem._id}` : apiPath;
      const method = editingItem ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formState),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed to save ${resourceName}.`);
      }

      toast.success(json.message || `${resourceName} saved successfully.`);
      setDialogOpen(false);
      await loadItems();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to save ${resourceName}.`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item: MasterDataItem) {
    const label = String(item.name || resourceName);

    const confirmed = window.confirm(
      `Delete ${label}? This will hide it from active records.`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`${apiPath}/${item._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed to delete ${resourceName}.`);
      }

      toast.success(json.message || `${resourceName} deleted successfully.`);
      await loadItems();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to delete ${resourceName}.`
      );
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function resetSearch() {
    setDraftSearch("");
    setSearch("");
    setPage(1);
  }

  function formatCellValue(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground">—</span>;
    }

    if (typeof value === "string") {
      if (["SALE", "DELIVERY", "BOTH"].includes(value)) {
        return value.charAt(0) + value.slice(1).toLowerCase();
      }

      return value;
    }

    return String(value);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-md">
          <Label>Filter by Name</Label>
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder={searchPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch();
              }
            }}
          />
        </div>

        <div className="w-full lg:w-36">
          <Label>Show entries</Label>
          <Select
            value={limit}
            onValueChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={applySearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>

          <Button variant="outline" onClick={resetSearch}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-xl">{cardTitle}</CardTitle>

          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
        </CardHeader>

        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className="whitespace-nowrap text-center font-bold text-white"
                    >
                      {column.label}
                    </TableHead>
                  ))}

                  <TableHead className="whitespace-nowrap text-center font-bold text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="h-32 text-center"
                    >
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item._id}>
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className="whitespace-nowrap text-center"
                        >
                          {formatCellValue(item[column.key])}
                        </TableCell>
                      ))}

                      <TableCell className="whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="icon"
                            className="bg-yellow-500 text-black hover:bg-yellow-600"
                            onClick={() => openEditDialog(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {items.length} of {meta.total} records
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
              >
                Previous
              </Button>

              <span className="rounded-md border px-3 py-2">
                Page {meta.page} of {meta.totalPages}
              </span>

              <Button
                variant="outline"
                disabled={page >= meta.totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(current + 1, meta.totalPages))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? `Edit ${resourceName}` : `Add ${resourceName}`}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className={field.inputType === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required ? (
                    <span className="text-red-500"> *</span>
                  ) : null}
                </Label>

                {field.inputType === "textarea" ? (
                  <Textarea
                    id={field.name}
                    value={formState[field.name] || ""}
                    onChange={(event) =>
                      updateField(field.name, event.target.value)
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : field.inputType === "select" ? (
                  <Select
                    value={formState[field.name] || ""}
                    onValueChange={(value) => updateField(field.name, value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={field.placeholder || "Select option"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.inputType || "text"}
                    value={formState[field.name] || ""}
                    onChange={(event) =>
                      updateField(field.name, event.target.value)
                    }
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
