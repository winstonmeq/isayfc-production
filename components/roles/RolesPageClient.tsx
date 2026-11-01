// components/roles/RolesPageClient.tsx
"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_PERMISSION_GROUPS, ROLE_PRESETS, normalizeRolePermissions } from "@/lib/role-permissions";

type RoleRow = {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  permissionCount: number;
  isSystem: boolean;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  name: "",
  description: "",
  permissions: [] as string[],
};

export function RolesPageClient() {
  const { data: session, update: refreshSession } = useSession();
  const canManage = session?.user.role === "ADMIN" || session?.user.roleName === "ADMIN" || session?.user.permissions.includes("roles.manage");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [page, setPage] = useState(1);
  const [limit] = useState("10");

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadRoles() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedSearch) {
      params.set("search", appliedSearch);
    }

    try {
      const res = await fetch(`/api/roles?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load roles.");
      }

      setRoles(json.data || []);
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
        error instanceof Error ? error.message : "Failed to load roles."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedSearch]);

  function openAddDialog() {
    setEditingRole(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(role: RoleRow) {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
    });
    setDialogOpen(true);
  }

  function togglePermission(permission: string) {
    setForm((current) => {
      const exists = current.permissions.includes(permission);

      return {
        ...current,
        permissions: normalizeRolePermissions(exists
          ? current.permissions.filter((item) => item !== permission)
          : [...current.permissions, permission]),
      };
    });
  }

  function toggleGroup(permissions: readonly { key: string; label: string }[]) {
    const keys = permissions.map((permission) => permission.key);
    const allSelected = keys.every((key) => form.permissions.includes(key));

    setForm((current) => ({
      ...current,
      permissions: allSelected
        ? current.permissions.filter((item) => !keys.includes(item))
        : Array.from(new Set([...current.permissions, ...keys])),
    }));
  }

  function applySearch() {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function resetSearch() {
    setSearch("");
    setAppliedSearch("");
    setPage(1);
  }

  async function saveRole() {
    if (!form.name.trim()) {
      toast.error("Role name is required.");
      return;
    }

    setIsSaving(true);

    try {
      const url = editingRole ? `/api/roles/${editingRole._id}` : "/api/roles";

      const res = await fetch(url, {
        method: editingRole ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          permissions: normalizeRolePermissions(form.permissions),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save role.");
      }

      toast.success(json.message || "Role saved successfully.");
      await refreshSession();

      setDialogOpen(false);
      setEditingRole(null);
      setForm(emptyForm);

      await loadRoles();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save role.");
    } finally {
      setIsSaving(false);
    }
  }

  async function disableRole(role: RoleRow) {
    const confirmed = window.confirm(`Disable role ${role.name}?`);

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/roles/${role._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to disable role.");
      }

      toast.success(json.message || "Role disabled successfully.");
      await loadRoles();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disable role."
      );
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Roles"
        description="Create user roles and assign module permissions."
        actions={
          <Button onClick={openAddDialog} disabled={!canManage} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Add Role
          </Button>
        }
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search role..."
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
            }}
          />

          <Button onClick={applySearch}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>

          <Button variant="secondary" onClick={resetSearch}>
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
                  <TableHead className="text-white">Role</TableHead>
                  <TableHead className="text-white">Description</TableHead>
                  <TableHead className="text-center text-white">
                    Permissions
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Type
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : roles.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No roles found.
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((role) => (
                    <TableRow key={role._id}>
                      <TableCell className="font-bold">{role.name}</TableCell>
                      <TableCell>{role.description || "—"}</TableCell>
                      <TableCell className="text-center">
                        {role.permissionCount}
                      </TableCell>
                      <TableCell className="text-center">
                        {role.isSystem ? "System" : "Custom"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(role)}
                            disabled={role.isSystem || !canManage}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => disableRole(role)}
                            disabled={role.isSystem || !canManage}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Disable
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Previous
            </Button>

            <span className="rounded-xl border px-3 py-2 text-sm text-slate-600">
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
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <EntryDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-black">
              <ShieldCheck className="h-6 w-6" />
              {editingRole ? "Edit Role" : "Add Role"}
            </DialogTitle>

            <DialogDescription>
              Assign permissions based on module access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Cashier"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe what this role can do"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-slate-600">{normalizeRolePermissions(form.permissions).length} permissions selected. Manage access includes the matching view page. Existing roles are not automatically granted new report access.</p>
              <div className="flex flex-wrap gap-2">{ROLE_PRESETS.map((preset) => <Button key={preset.name} type="button" size="sm" variant="outline" onClick={() => {
                if (form.permissions.length && !window.confirm(`Replace selected permissions with ${preset.name}?`)) return;
                setForm((current) => ({ ...current, permissions: normalizeRolePermissions(preset.permissions) }));
              }}>{preset.name}</Button>)}</div>
              <Input aria-label="Search permissions" placeholder="Search page or permission…" value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} />
            </div>
            <div className="space-y-4">
              {ROLE_PERMISSION_GROUPS.map((group) => ({ ...group, permissions: group.permissions.filter((permission) => `${group.group} ${permission.label} ${permission.key}`.toLowerCase().includes(permissionSearch.toLowerCase())) })).filter((group) => group.permissions.length > 0).map((group) => {
                const groupPermissionKeys = group.permissions.map(
                  (permission) => permission.key
                );

                const allSelected = groupPermissionKeys.every((key) =>
                  form.permissions.includes(key)
                );

                return (
                  <div
                    key={group.group}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {group.group}
                        </p>
                        <p className="text-xs text-slate-500">
                          {group.permissions.length} permissions
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleGroup(group.permissions)}
                      >
                        {allSelected ? "Unselect Group" : "Select Group"}
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {group.permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"
                        >
                          <Checkbox
                            checked={form.permissions.includes(permission.key)}
                            onCheckedChange={() =>
                              togglePermission(permission.key)
                            }
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
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

            <Button type="button" disabled={isSaving || !canManage} onClick={saveRole}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingRole ? "Save" : "Save"}
            </Button>
          </DialogFooter>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
