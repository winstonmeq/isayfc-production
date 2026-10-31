"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatPeso } from "@/lib/utils";

type ExpenseCategory = "GROCERY" | "BODEGA";

type ExpenseType = string;

type ExpenseTypeOption = {
  _id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
};

type ExpenseRow = {
  _id: string;
  name: string;
  expenseCategory: ExpenseCategory;
  type: ExpenseType;
  expenseDate?: string;
  amount: number;
  remarks: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ExpenseCategorySummary = {
  expenseCategory: ExpenseCategory;
  rows: number;
  totalAmount: number;
};

type ExpenseTypeSummary = {
  type: ExpenseType;
  rows: number;
  totalAmount: number;
};

const expenseCategoryOptions: { label: string; value: ExpenseCategory; description: string }[] = [
  {
    label: "Grocery/Product",
    value: "GROCERY",
    description: "Expenses related to grocery and product inventory operations.",
  },
  {
    label: "Bodega",
    value: "BODEGA",
    description: "Expenses related to chicken, bodega, slicing, and delivery operations.",
  },
];

const emptyForm = {
  name: "",
  expenseCategory: "BODEGA" as ExpenseCategory,
  type: "OTHERS" as ExpenseType,
  expenseDate: new Date().toISOString().slice(0, 10),
  amount: "0",
  remarks: "",
};

function getCategoryLabel(category: string) {
  return (
    expenseCategoryOptions.find((item) => item.value === category)?.label ||
    "Bodega"
  );
}

function getTypeLabel(type: string, options: ExpenseTypeOption[]) {
  return options.find((item) => item.code === type)?.name || type.replaceAll("_", " ");
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function getCategoryTotal(
  byCategory: ExpenseCategorySummary[],
  category: ExpenseCategory
) {
  return byCategory.find((item) => item.expenseCategory === category)?.totalAmount || 0;
}

export function ExpensesBodegaPageClient() {
  const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeOption[]>([]);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState({
    rows: 0,
    totalAmount: 0,
    byCategory: [] as ExpenseCategorySummary[],
    byType: [] as ExpenseTypeSummary[],
  });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("25");
  const [search, setSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    expenseCategory: "ALL",
    type: "ALL",
    dateFrom: "",
    dateTo: "",
  });

  const [form, setForm] = useState(emptyForm);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [typesDialogOpen, setTypesDialogOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: "", description: "" });
  const [editingType, setEditingType] = useState<ExpenseTypeOption | null>(null);
  const [isTypeSaving, setIsTypeSaving] = useState(false);

  const groceryTotal = getCategoryTotal(summary.byCategory, "GROCERY");
  const bodegaTotal = getCategoryTotal(summary.byCategory, "BODEGA");

  const activeFilterText = useMemo(() => {
    const parts: string[] = [];

    if (appliedFilters.search) parts.push(`Search: ${appliedFilters.search}`);
    if (appliedFilters.expenseCategory !== "ALL") {
      parts.push(`Category: ${getCategoryLabel(appliedFilters.expenseCategory)}`);
    }
    if (appliedFilters.type !== "ALL") {
      parts.push(`Type: ${getTypeLabel(appliedFilters.type, expenseTypes)}`);
    }
    if (appliedFilters.dateFrom) parts.push(`From: ${appliedFilters.dateFrom}`);
    if (appliedFilters.dateTo) parts.push(`To: ${appliedFilters.dateTo}`);

    return parts.length ? parts.join(" | ") : "No filters applied";
  }, [appliedFilters, expenseTypes]);

  async function loadExpenseTypes() {
    try {
      const res = await fetch("/api/expense-types?includeInactive=true", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load expense types.");
      setExpenseTypes(json.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load expense types.");
    }
  }

  async function loadExpenses() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedFilters.search) params.set("search", appliedFilters.search);
    if (appliedFilters.expenseCategory !== "ALL") {
      params.set("expenseCategory", appliedFilters.expenseCategory);
    }
    if (appliedFilters.type !== "ALL") params.set("type", appliedFilters.type);
    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

    try {
      const res = await fetch(`/api/expenses?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load expenses.");
      }

      setRows(json.data || []);
      setSummary(
        json.summary || {
          rows: 0,
          totalAmount: 0,
          byCategory: [],
          byType: [],
        }
      );
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
        error instanceof Error ? error.message : "Failed to load expenses."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, appliedFilters]);

  useEffect(() => {
    void loadExpenseTypes();
  }, []);

  const activeExpenseTypes = expenseTypes.filter((item) => item.isActive);

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openAddDialog(category: ExpenseCategory = "BODEGA") {
    setEditingExpense(null);
    setForm({
      ...emptyForm,
      expenseCategory: category,
      type: activeExpenseTypes.some((item) => item.code === "OTHERS")
        ? "OTHERS"
        : activeExpenseTypes[0]?.code || "",
      expenseDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  }

  function openEditDialog(expense: ExpenseRow) {
    setEditingExpense(expense);
    setForm({
      name: expense.name,
      expenseCategory: expense.expenseCategory || "BODEGA",
      type: expense.type,
      expenseDate: expense.expenseDate
        ? new Date(expense.expenseDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      amount: String(expense.amount),
      remarks: expense.remarks || "",
    });
    setDialogOpen(true);
  }

  function applyFilters() {
    setAppliedFilters({
      search: search.trim(),
      expenseCategory,
      type,
      dateFrom,
      dateTo,
    });
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setExpenseCategory("ALL");
    setType("ALL");
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({
      search: "",
      expenseCategory: "ALL",
      type: "ALL",
      dateFrom: "",
      dateTo: "",
    });
    setPage(1);
  }

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Expense name is required.");
      return;
    }

    if (!form.expenseDate) {
      toast.error("Expense date is required.");
      return;
    }

    if ((Number(form.amount) || 0) <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    setIsSaving(true);

    try {
      const url = editingExpense
        ? `/api/expenses/${editingExpense._id}`
        : "/api/expenses";
      const res = await fetch(url, {
        method: editingExpense ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save expense.");
      }

      toast.success(json.message || "Expense saved successfully.");
      setDialogOpen(false);
      await loadExpenses();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save expense."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteExpense(expense: ExpenseRow) {
    const confirmed = window.confirm(`Delete expense "${expense.name}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/expenses/${expense._id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to delete expense.");
      }

      toast.success(json.message || "Expense deleted successfully.");
      await loadExpenses();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete expense."
      );
    }
  }

  function openTypeManager() {
    setEditingType(null);
    setTypeForm({ name: "", description: "" });
    setTypesDialogOpen(true);
  }

  function editExpenseType(item: ExpenseTypeOption) {
    setEditingType(item);
    setTypeForm({ name: item.name, description: item.description || "" });
  }

  async function saveExpenseType(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typeForm.name.trim()) {
      toast.error("Expense type name is required.");
      return;
    }

    setIsTypeSaving(true);
    try {
      const res = await fetch(
        editingType ? `/api/expense-types/${editingType._id}` : "/api/expense-types",
        {
          method: editingType ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(typeForm),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to save expense type.");
      toast.success(json.message || "Expense type saved successfully.");
      setEditingType(null);
      setTypeForm({ name: "", description: "" });
      await loadExpenseTypes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save expense type.");
    } finally {
      setIsTypeSaving(false);
    }
  }

  async function removeExpenseType(item: ExpenseTypeOption) {
    if (!window.confirm(`Remove "${item.name}" from future expense entries?`)) return;
    try {
      const res = await fetch(`/api/expense-types/${item._id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to remove expense type.");
      toast.success(json.message);
      await loadExpenseTypes();
      if (type === item.code) setType("ALL");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove expense type.");
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Business Expenses"
        description="Track main-branch Grocery/Product and Bodega operating expenses. Outlet expenses are recorded in the outlet POS."
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openTypeManager} className="rounded-xl">
            <Settings2 className="mr-2 h-4 w-4" />
            Expense Types
          </Button>
          <Button onClick={() => openAddDialog("BODEGA")} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Expense
          </Button>
        </div>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-700">
              {formatPeso(summary.totalAmount)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.rows.toLocaleString()} filtered record{summary.rows === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ShoppingBasket className="h-4 w-4 text-emerald-700" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Grocery/Product
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatPeso(groceryTotal)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Product and grocery operating costs</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Building2 className="h-4 w-4 text-blue-700" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bodega
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatPeso(bodegaTotal)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Chicken, slicing, bodega, and delivery costs</p>
          </CardContent>
        </Card>

      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or remarks"
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
            />
          </div>

          <div>
            <Label>Category</Label>
            <Select value={expenseCategory} onValueChange={setExpenseCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {expenseCategoryOptions.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Expense Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {activeExpenseTypes.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Date From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          <div>
            <Label>Date To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <div className="flex items-end gap-2 md:col-span-6">
            <Button onClick={applyFilters} disabled={isLoading}>
              <Search className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="secondary" onClick={resetFilters} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <p className="text-sm text-muted-foreground">{activeFilterText}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Expense Records</CardTitle>
            <p className="text-sm text-muted-foreground">
              Showing {rows.length.toLocaleString()} of {meta.total.toLocaleString()} records
            </p>
          </div>
          <Select
            value={limit}
            onValueChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-950">
                <TableRow>
                  <TableHead className="text-white">#</TableHead>
                  <TableHead className="text-white">Name</TableHead>
                  <TableHead className="text-white">Category</TableHead>
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Date</TableHead>
                  <TableHead className="text-right text-white">Amount</TableHead>
                  <TableHead className="text-white">Remarks</TableHead>
                  <TableHead className="text-center text-white">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No expenses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((expense, index) => (
                    <TableRow key={expense._id}>
                      <TableCell>
                        {(meta.page - 1) * meta.limit + index + 1}
                      </TableCell>
                      <TableCell className="font-medium">{expense.name}</TableCell>
                      <TableCell>
                        <Badge variant={expense.expenseCategory === "GROCERY" ? "secondary" : "outline"}>
                          {getCategoryLabel(expense.expenseCategory)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getTypeLabel(expense.type, expenseTypes)}</TableCell>
                      <TableCell>{formatDate(expense.expenseDate)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPeso(expense.amount)}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground">
                        {expense.remarks || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(expense)}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteExpense(expense)}
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

          <div className="mt-4 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              disabled={meta.page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              disabled={meta.page >= meta.totalPages || isLoading}
              onClick={() =>
                setPage((current) => Math.min(current + 1, meta.totalPages))
              }
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              {editingExpense ? "Edit Expense" : "Add Expense"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={saveExpense} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="Example: Diesel, ice, salaries, repairs"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.expenseCategory}
                  onValueChange={(value) => updateForm("expenseCategory", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategoryOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expense Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => updateForm("type", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeExpenseTypes
                      .concat(
                        expenseTypes.filter(
                          (item) => !item.isActive && item.code === form.type
                        )
                      )
                      .map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name}{item.isActive ? "" : " (Inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => updateForm("expenseDate", event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border bg-slate-50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-slate-900">
                {getCategoryLabel(form.expenseCategory)} expense
              </p>
              <p>
                {expenseCategoryOptions.find((item) => item.value === form.expenseCategory)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input
                value={form.remarks}
                onChange={(event) => updateForm("remarks", event.target.value)}
                placeholder="Optional notes"
              />
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
        </EntryDialogContent>
      </Dialog>

      <Dialog open={typesDialogOpen} onOpenChange={setTypesDialogOpen}>
        <EntryDialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Expense Type Setup</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Add and maintain the choices available in the Expense Type dropdown.
            </p>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <form onSubmit={saveExpenseType} className="space-y-4 rounded-2xl border bg-slate-50 p-4">
              <div>
                <h3 className="font-bold">{editingType ? "Edit type" : "Add new type"}</h3>
                <p className="text-xs text-muted-foreground">
                  The internal code is generated automatically from the name.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={typeForm.name}
                  onChange={(event) => setTypeForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Example: Utilities"
                  maxLength={80}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={typeForm.description}
                  onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional description"
                  maxLength={200}
                />
              </div>
              <div className="flex gap-2">
                {editingType && (
                  <Button type="button" variant="secondary" onClick={() => {
                    setEditingType(null);
                    setTypeForm({ name: "", description: "" });
                  }}>
                    Cancel edit
                  </Button>
                )}
                <Button type="submit" disabled={isTypeSaving}>
                  {isTypeSaving ? "Saving..." : editingType ? "Update Type" : "Add Type"}
                </Button>
              </div>
            </form>

            <div className="max-h-[430px] overflow-auto rounded-2xl border">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-950">
                  <TableRow>
                    <TableHead className="text-white">Expense Type</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-center text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseTypes.map((item) => (
                    <TableRow key={item._id} className={item.isActive ? "" : "opacity-60"}>
                      <TableCell>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.description || item.code}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "secondary" : "outline"}>
                          {item.isActive ? "Active" : "Removed"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.isActive && (
                          <div className="flex justify-center gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => editExpenseType(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => void removeExpenseType(item)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setTypesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
