"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock } from "lucide-react";
import {
  apiGetUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiResetUserPassword,
} from "@/lib/api";
import type { AgentUser } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Online now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function getInitials(user: AgentUser): string {
  const src = user.name || user.username;
  return src
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
        <Lock className="w-7 h-7 text-gray-400" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[17px] font-bold text-gray-900">This page is for admins only</h2>
        <p className="text-[13px] text-gray-400">You need admin privileges to manage team members.</p>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className="h-3.5 bg-gray-200 rounded w-28" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-3 bg-gray-100 rounded w-24" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 bg-gray-100 rounded-full w-14" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3 bg-gray-100 rounded w-16" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3 bg-gray-100 rounded w-20" />
      </td>
      <td className="px-4 py-3" />
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AgentUser["status"] }) {
  if (status === "ONLINE") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-gray-700">
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        Active
      </span>
    );
  }
  if (status === "ON_BREAK") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-gray-700">
        <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
        On break
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-gray-500">
      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
      Offline
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: AgentUser["role"] }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
      Agent
    </span>
  );
}

// ---------------------------------------------------------------------------
// Actions dropdown
// ---------------------------------------------------------------------------

interface ActionsDropdownProps {
  user: AgentUser;
  selfId: number | null;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}

function ActionsDropdown({ user, selfId, onEdit, onResetPassword, onDelete }: ActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1 overflow-hidden">
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onResetPassword(); }}
            className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Reset password
          </button>
          {user.id !== selfId && (
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full text-left px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared input / label styles
// ---------------------------------------------------------------------------

const inputCls =
  "w-full text-[14px] text-gray-800 border border-gray-200 rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors";

const labelCls = "block text-[13px] font-medium text-gray-700 mb-1.5";

// ---------------------------------------------------------------------------
// Create user drawer
// ---------------------------------------------------------------------------

interface CreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateUserDrawer({ open, onClose, onCreated }: CreateDrawerProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "AGENT">("AGENT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setUsername("");
      setPassword("");
      setRole("AGENT");
      setError(null);
      setTimeout(() => usernameRef.current?.focus(), 150);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError("Username is required."); return; }
    if (!password || password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiCreateUser({
        ...(name.trim() ? { name: name.trim() } : {}),
        username: username.trim(),
        password,
        role,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell open={open} onClose={onClose} title="Create user">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Full name <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Smith" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Username <span className="text-red-500">*</span></label>
          <input ref={usernameRef} type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jane.smith" className={inputCls} autoComplete="off" />
        </div>

        <div>
          <label className={labelCls}>Password <span className="text-red-500">*</span></label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className={inputCls} autoComplete="new-password" />
        </div>

        <div>
          <label className={labelCls}>Role</label>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard role="ADMIN" selected={role === "ADMIN"} onSelect={() => setRole("ADMIN")} />
            <RoleCard role="AGENT" selected={role === "AGENT"} onSelect={() => setRole("AGENT")} />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">
            {submitting ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Edit user drawer
// ---------------------------------------------------------------------------

interface EditDrawerProps {
  open: boolean;
  user: AgentUser | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditUserDrawer({ open, user, onClose, onSaved }: EditDrawerProps) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"ADMIN" | "AGENT">("AGENT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name ?? "");
      setUsername(user.username);
      setRole(user.role);
      setError(null);
    }
  }, [open, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!username.trim()) { setError("Username is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiUpdateUser(user.id, {
        name: name.trim() || null,
        username: username.trim(),
        role,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell open={open} onClose={onClose} title="Edit user">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Full name <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Smith" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Username <span className="text-red-500">*</span></label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. jane.smith" className={inputCls} autoComplete="off" />
        </div>

        <div>
          <label className={labelCls}>Role</label>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard role="ADMIN" selected={role === "ADMIN"} onSelect={() => setRole("ADMIN")} />
            <RoleCard role="AGENT" selected={role === "AGENT"} onSelect={() => setRole("AGENT")} />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Reset password drawer
// ---------------------------------------------------------------------------

interface ResetPasswordDrawerProps {
  open: boolean;
  user: AgentUser | null;
  onClose: () => void;
  onReset: () => void;
}

function ResetPasswordDrawer({ open, user, onClose, onReset }: ResetPasswordDrawerProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!newPassword || newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiResetUserPassword(user.id, newPassword);
      onReset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell open={open} onClose={onClose} title={`Reset password${user ? ` — ${user.name || user.username}` : ""}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>New password <span className="text-red-500">*</span></label>
          <input ref={inputRef} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" className={inputCls} autoComplete="new-password" />
        </div>

        <div>
          <label className={labelCls}>Confirm password <span className="text-red-500">*</span></label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" className={inputCls} autoComplete="new-password" />
        </div>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm drawer
// ---------------------------------------------------------------------------

interface DeleteConfirmDrawerProps {
  open: boolean;
  user: AgentUser | null;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteConfirmDrawer({ open, user, onClose, onDeleted }: DeleteConfirmDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function handleDelete() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiDeleteUser(user.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell open={open} onClose={onClose} title="Delete user">
      <div className="space-y-5">
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-4">
          <p className="text-[14px] text-red-700 font-medium">
            Delete {user?.name || user?.username}?
          </p>
          <p className="text-[13px] text-red-500 mt-1">
            This action cannot be undone. The user will lose access immediately.
          </p>
        </div>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={submitting} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">
            {submitting ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Drawer shell (slides from right on desktop, bottom on mobile)
// ---------------------------------------------------------------------------

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function DrawerShell({ open, onClose, title, children }: DrawerShellProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[100] transition-opacity duration-300 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel — slides from right on sm+ */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <h2 className="text-[17px] font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role radio card
// ---------------------------------------------------------------------------

interface RoleCardProps {
  role: "ADMIN" | "AGENT";
  selected: boolean;
  onSelect: () => void;
}

function RoleCard({ role, selected, onSelect }: RoleCardProps) {
  const isAdmin = role === "ADMIN";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`border rounded-lg p-3 flex items-center gap-2 transition-all cursor-pointer text-left w-full ${
        selected
          ? "border-[#3B694C] bg-[#EEF6F1]"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? "border-[#3B694C]" : "border-gray-300"
        }`}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-[#3B694C]" />}
      </div>
      <div>
        <p className={`text-[13px] font-semibold ${selected ? "text-[#3B694C]" : "text-gray-700"}`}>
          {isAdmin ? "Admin" : "Agent"}
        </p>
        <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
          {isAdmin ? "Full access" : "Limited access"}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Role filter pill
// ---------------------------------------------------------------------------

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterPill({ label, active, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer border ${
        active
          ? "bg-[#3B694C] text-white border-[#3B694C]"
          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type RoleFilter = "ALL" | "ADMIN" | "AGENT";

export default function TeamPage() {
  const [selfUser, setSelfUser] = useState<{ role: string; id?: number } | null>(null);
  const [users, setUsers] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");

  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showResetDrawer, setShowResetDrawer] = useState(false);
  const [showDeleteDrawer, setShowDeleteDrawer] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AgentUser | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read self from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setSelfUser(raw ? JSON.parse(raw) : null);
    } catch {
      setSelfUser(null);
    }
  }, []);

  const fetchUsers = useCallback(async (q: string, role: RoleFilter) => {
    setLoading(true);
    try {
      const res = await apiGetUsers({
        search: q.trim() || undefined,
        role: role !== "ALL" ? role : undefined,
        limit: 100,
      });
      setUsers(res.data);
      setTotal(res.pagination.total);
    } catch {
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search; immediate on role change
  useEffect(() => {
    if (selfUser?.role !== "ADMIN") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchUsers(search, roleFilter);
    }, search ? 400 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, selfUser?.role]);

  function openEdit(user: AgentUser) {
    setSelectedUser(user);
    setShowEditDrawer(true);
  }

  function openReset(user: AgentUser) {
    setSelectedUser(user);
    setShowResetDrawer(true);
  }

  function openDelete(user: AgentUser) {
    setSelectedUser(user);
    setShowDeleteDrawer(true);
  }

  const selfId = selfUser?.id ?? null;

  // While loading user info, render nothing to avoid flicker
  if (selfUser === null && loading) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="h-7 w-36 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-4 w-24 rounded bg-gray-100 animate-pulse mt-2" />
        </div>
        <div className="px-6 py-4">
          <div className="h-10 w-72 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        <div className="flex-1 px-6 overflow-auto">
          <table className="w-full border-collapse">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (selfUser?.role !== "ADMIN") {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Team &amp; access</h1>
        </div>
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white font-[family-name:var(--font-geist-sans)]">
      {/* Drawers */}
      <CreateUserDrawer
        open={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        onCreated={() => fetchUsers(search, roleFilter)}
      />
      <EditUserDrawer
        open={showEditDrawer}
        user={selectedUser}
        onClose={() => setShowEditDrawer(false)}
        onSaved={() => fetchUsers(search, roleFilter)}
      />
      <ResetPasswordDrawer
        open={showResetDrawer}
        user={selectedUser}
        onClose={() => setShowResetDrawer(false)}
        onReset={() => {}}
      />
      <DeleteConfirmDrawer
        open={showDeleteDrawer}
        user={selectedUser}
        onClose={() => setShowDeleteDrawer(false)}
        onDeleted={() => fetchUsers(search, roleFilter)}
      />

      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Team &amp; access</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {loading ? "Loading…" : `${total} team member${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDrawer(true)}
          className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create user
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 shrink-0 border-b border-gray-100">
        {/* Search */}
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 w-[300px] focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team by name or username…"
            className="flex-1 text-[13px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent min-w-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-gray-300 hover:text-gray-500 transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Role pills */}
        <div className="flex items-center gap-2 shrink-0">
          <FilterPill label="All roles" active={roleFilter === "ALL"} onClick={() => setRoleFilter("ALL")} />
          <FilterPill label="Admin" active={roleFilter === "ADMIN"} onClick={() => setRoleFilter("ADMIN")} />
          <FilterPill label="Agent" active={roleFilter === "AGENT"} onClick={() => setRoleFilter("AGENT")} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-10 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-[220px]">Name</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-[160px]">Username</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-[100px]">Role</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-[120px]">Status</th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-[140px]">Last active</th>
              <th className="px-4 py-3 w-[48px]" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-gray-700">
                      {search || roleFilter !== "ALL" ? "No team members found" : "No team members yet"}
                    </p>
                    <p className="text-[13px] text-gray-400">
                      {search || roleFilter !== "ALL"
                        ? "Try adjusting your search or filters."
                        : "Create your first team member to get started."}
                    </p>
                    {!search && roleFilter === "ALL" && (
                      <button
                        type="button"
                        onClick={() => setShowCreateDrawer(true)}
                        className="mt-1 flex items-center gap-1.5 bg-[#3B694C] hover:bg-[#2f5840] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Create user
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const initials = getInitials(user);
                const displayName = user.name || user.username;
                const avatarBg = user.role === "ADMIN" ? "bg-[#DCF2E3]" : "bg-gray-100";
                const avatarText = user.role === "ADMIN" ? "text-[#3B694C]" : "text-gray-500";

                return (
                  <tr
                    key={user.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center ${avatarText} font-semibold text-[11px] shrink-0`}>
                          {initials}
                        </div>
                        <span className="text-[14px] font-semibold text-gray-900 truncate">
                          {displayName}
                        </span>
                      </div>
                    </td>

                    {/* Username */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] text-gray-500">{user.username}</span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                    </td>

                    {/* Last active */}
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-gray-400">
                        {user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : "Pending"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <ActionsDropdown
                        user={user}
                        selfId={typeof selfId === "number" ? selfId : null}
                        onEdit={() => openEdit(user)}
                        onResetPassword={() => openReset(user)}
                        onDelete={() => openDelete(user)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
