// components/users/UsersPageClient.tsx
"use client";

import { EntryDialogContent } from "@/components/erp/EntryForm";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ROLE_PERMISSION_GROUPS, roleNeedsOutlet } from "@/lib/role-permissions";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/app-shell/ModuleHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type RoleOption = {
  permissions: string[];
  _id: string;
  name: string;
  permissionCount: number;
};

type UserRow = {
  _id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  roleName: string;
  outletId: string;
  outletName: string;
  permissionCount: number;
};

type OutletOption = {
  _id: string;
  name: string;
  code: string;
};

type ApiMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "USER",
  roleId: "",
  outletId: "",
};

export function UsersPageClient() {
  const { data: session, update: refreshSession } = useSession();
  const canManage = session?.user.role === "ADMIN" || session?.user.roleName === "ADMIN" || session?.user.permissions.includes("users.manage");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);

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
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadRoles() {
    try {
      const res = await fetch("/api/roles?limit=1000&lookup=true", {
        cache: "no-store",
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setRoles(json.data || []);
      }
    } catch {
      toast.error("Failed to load roles.");
    }
  }

  async function loadOutlets() {
    try {
      const res = await fetch("/api/outlets?limit=1000&lookup=true", {
        cache: "no-store",
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setOutlets(json.data || []);
      }
    } catch {
      // outlets are optional for non-cashier users; fail quietly
    }
  }

  async function loadUsers() {
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      limit,
    });

    if (appliedSearch) {
      params.set("search", appliedSearch);
    }

    try {
      const res = await fetch(`/api/users?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load users.");
      }

      setUsers(json.data || []);
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
        error instanceof Error ? error.message : "Failed to load users."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
    void loadOutlets();
  }, []);

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedSearch]);

  function openAddDialog() {
    setEditingUser(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(user: UserRow) {
    setEditingUser(user);

    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "USER",
      roleId: user.roleId || "",
      outletId: user.outletId || "",
    });

    setDialogOpen(true);
  }

  function updateForm(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
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

  async function saveUser() {
    const selected = roles.find((role) => role._id === form.roleId);
    if (selected && roleNeedsOutlet(selected.name, selected.permissions || []) && !form.outletId) { toast.error("Select the store assigned to this outlet cashier."); return; }
    if (!form.name.trim()) {
      toast.error("User name is required.");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Email is required.");
      return;
    }

    if (!editingUser && !form.password.trim()) {
      toast.error("Password is required.");
      return;
    }

    if (!form.roleId) {
      toast.error("Role is required.");
      return;
    }

    setIsSaving(true);

    try {
      const url = editingUser ? `/api/users/${editingUser._id}` : "/api/users";

      const res = await fetch(url, {
        method: editingUser ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          roleId: form.roleId,
          outletId: form.outletId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to save user.");
      }

      toast.success(json.message || "User saved successfully.");
      await refreshSession();

      setDialogOpen(false);
      setEditingUser(null);
      setForm(emptyForm);

      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save user.");
    } finally {
      setIsSaving(false);
    }
  }

  async function disableUser(user: UserRow) {
    const confirmed = window.confirm(`Disable user ${user.name}?`);

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to disable user.");
      }

      toast.success(json.message || "User disabled successfully.");
      await loadUsers();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disable user."
      );
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Users"
        description="Create users and assign role-based permissions."
        actions={
          <Button onClick={openAddDialog} disabled={!canManage} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user name or email..."
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
                  <TableHead className="text-white">Name</TableHead>
                  <TableHead className="text-white">Email</TableHead>
                  <TableHead className="text-white">Role</TableHead>
                  <TableHead className="text-center text-white">
                    Permissions
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Assigned Outlet
                  </TableHead>
                  <TableHead className="text-center text-white">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell className="font-bold">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleName || "No role assigned"}</TableCell>
                      <TableCell className="text-center">
                        {user.permissionCount || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {user.outletName || "No outlet assigned"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(user)}
                            disabled={!canManage}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => disableUser(user)}
                            disabled={!canManage}
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
        <EntryDialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-black">
              <UserRoundCog className="h-6 w-6" />
              {editingUser ? "Edit User" : "Add User"}
            </DialogTitle>

            <DialogDescription>
              Assign a system role to control user permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Password{" "}
                  {editingUser ? (
                    <span className="text-xs text-muted-foreground">
                      optional
                    </span>
                  ) : null}
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    updateForm("password", event.target.value)
                  }
                  placeholder={
                    editingUser ? "Leave blank to keep password" : "Password"
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.roleId}
                  onValueChange={(value) => updateForm("roleId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>

                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role._id} value={role._id}>
                        {role.name} — {role.permissionCount} permissions
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Outlet{" "}
                <span className="text-xs font-normal text-slate-400">
                  (required for cashiers — the outlet they sell from)
                </span>
              </Label>
              <Select
                value={form.outletId || "none"}
                onValueChange={(value) =>
                  updateForm("outletId", value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No outlet" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="none">No outlet</SelectItem>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet._id} value={outlet._id}>
                      {outlet.name}
                      {outlet.code ? ` (${outlet.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <Label>Selected Role Access</Label>
              <p className="text-xs text-slate-500">Access comes from the selected role. Cashiers require an assigned store. Other roles may be saved without one; outlet access remains restricted.</p>
              <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm">{ROLE_PERMISSION_GROUPS.flatMap<{ key: string; label: string }>((group) => group.permissions).filter((permission) => roles.find((role) => role._id === form.roleId)?.permissions?.includes(permission.key)).map((permission) => <li key={permission.key}>{permission.label}</li>)}</ul>
              {roles.find((role) => role._id === form.roleId)?.name === "ADMIN" && <p className="text-sm font-semibold">Administrator — full system access.</p>}
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

            <Button type="button" disabled={isSaving || !canManage} onClick={saveUser}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingUser ? "Save" : "Save"}
            </Button>
          </DialogFooter>
        </EntryDialogContent>
      </Dialog>
    </div>
  );
}
