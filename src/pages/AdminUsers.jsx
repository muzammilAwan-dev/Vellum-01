import { useState } from "react";
import { useSearchParams } from "react-router";
import { KeyRound, Plus } from "lucide-react";
import { CreateAccountModal } from "@/components/admin-users/CreateAccountModal";
import { ParentContactDialog } from "@/components/guardian/ParentContact";
import { TemporaryPasswordDialog } from "@/components/admin-users/TemporaryPasswordDialog";
import { createUser, deleteUser, resetPassword, updateUser } from "@/api/admin";
import { Avatar, ConfirmDialog, EmptyState, PageError, PageFrame, PageHeader, PageLoading, SearchField, Segmented, StatusDot, TableShell, Td, Th } from "@/components/common";
import { ActionMenu } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useUsers } from "@/hooks/useAdmin";
import { useClasses } from "@/hooks/useSubjects";
import { ACCOUNT_SHOWS, accountCounts, filterAccounts } from "@/lib/adminHome";

// ═══════════════════════════════════════════════════════════════
// ADMIN ACCOUNTS
// Search + filters (kept in the URL, so the admin home can link to "students without a class"),
// one row per person, every action in one "Actions" menu (Remove last, in red).
// ═══════════════════════════════════════════════════════════════
const AdminUsers = () => {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // ?new=1 (from the admin home or the search menu) opens the form; closing removes it.
  const [createFlag, setCreateOpen] = useState(false);
  const createOpen = createFlag || params.get("new") === "1";
  const [confirmState, setConfirmState] = useState(null);
  const [contactOf, setContactOf] = useState(null); // { id, name } of the student whose parent contact is open
  const [secret, setSecret] = useState(null); // { name, email, password, reason } — shown once
  const { user: me } = useApp();
  const usersRes = useUsers();
  const classesRes = useClasses();

  const filters = { q: params.get("q") ?? "", role: params.get("role") ?? "", show: params.get("show") ?? "", classId: params.get("class") ?? "" };
  const setFilter = (key, value) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("new");
      return next;
    }, { replace: true }); // typing in the search box must not add a history entry per letter
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });

  if (usersRes.isLoading || classesRes.isLoading) return <PageLoading />;
  const loadError = usersRes.error || classesRes.error;
  if (loadError) return <PageError error={loadError} onRetry={() => { usersRes.refetch(); classesRes.refetch(); }} />;
  const users = usersRes.data ?? [];
  const classes = classesRes.data ?? [];
  const codeOf = (id) => classes.find((c) => c.id === id)?.code;
  // Students: their class code. Teachers: every class they teach.
  const classLabel = (u) =>
    u.role === "student" ? (u.cls ?? "—") : (u.classIds ?? []).map(codeOf).filter(Boolean).join(", ") || "—";
  const run = async (fn, fallback) => {
    try {
      await fn();
    } catch (err) {
      toast.push(err.message || fallback, "error");
    }
  };

  const shown = filterAccounts(users, { ...filters, classId: filters.classId });
  const counts = accountCounts(users, filters.role);
  const roleCount = (r) => (r ? users.filter((u) => u.role === r).length : users.length);
  const filtered = Object.values(filters).some(Boolean);

  const askReset = (u) =>
    setConfirmState({
      title: `Reset ${u.name}'s password?`,
      message: "Their current password stops working. You will get a temporary one to hand over, and they must choose a new password at their next sign-in.",
      confirmLabel: "Reset password",
      tone: "info",
      onConfirm: () =>
        run(async () => {
          const { temporaryPassword } = await resetPassword(u.id);
          setSecret({ name: u.name, email: u.email, password: temporaryPassword, reason: "reset" });
        }, "Couldn't reset the password"),
    });
  const toggleActive = (u) =>
    run(async () => {
      await updateUser(u.id, { active: !u.active });
      toast.push(u.active ? `${u.name} can no longer sign in` : `${u.name} can sign in again`, "info");
    }, "Couldn't update the account");
  const askRemove = (u) =>
    setConfirmState({
      title: `Remove ${u.name}?`,
      message: `This removes ${u.name}'s account from the platform. Their test results and history stay in the system, but they lose access immediately. This cannot be undone.${u.active ? " To pause access instead, deactivate the account: you can turn it back on later." : ""}`,
      confirmLabel: "Remove account",
      secondaryLabel: u.active ? "Deactivate instead" : undefined,
      onSecondary: () => toggleActive(u),
      onConfirm: () =>
        run(async () => {
          await deleteUser(u.id);
          toast.push(`Removed ${u.name}`, "info");
        }, "Couldn't remove the account"),
    });
  const menuFor = (u) => [
    ...(u.role === "student" ? [{ id: "contact", label: "Parent contact", onSelect: () => setContactOf({ id: u.id, name: u.name }) }] : []),
    { id: "reset", label: "Reset password", onSelect: () => askReset(u) },
    { id: "active", label: u.active ? "Deactivate" : "Reactivate", onSelect: () => toggleActive(u) },
    { id: "remove", label: "Remove account", danger: true, separatorBefore: true, onSelect: () => askRemove(u) },
  ];

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Accounts" }]}
        title="Accounts"
        intro="Every teacher and student at your institution. Search, filter, and manage access from one place."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={15} aria-hidden="true" /> Create account
          </Button>
        }
      />

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField label="Search accounts" value={filters.q} onChange={(v) => setFilter("q", v)} placeholder="Name, email or roll no." className="w-full tablet:w-auto tablet:min-w-[220px] tablet:flex-1" />
        <Segmented
          label="Role"
          className="shrink-0"
          value={filters.role}
          onChange={(v) => setFilter("role", v)}
          options={[
            { value: "", label: "All", count: roleCount("") },
            { value: "teacher", label: "Teachers", count: roleCount("teacher") },
            { value: "student", label: "Students", count: roleCount("student") },
          ]}
        />
        <div className="grid w-full grid-cols-2 gap-3 xl:flex xl:w-auto">
          <Select
            aria-label="Show"
            value={filters.show}
            onChange={(v) => setFilter("show", v)}
            options={ACCOUNT_SHOWS.map((s) => ({ value: s.id, label: `${s.label} (${counts[s.id || "all"]})` }))}
            className="xl:w-[210px]"
          />
          <Select
            aria-label="Class"
            value={filters.classId}
            onChange={(v) => setFilter("class", v)}
            options={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
            className="xl:w-[200px]"
          />
        </div>
      </div>

      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3" aria-live="polite">
          {filtered ? `${shown.length} of ${users.length} accounts` : `${users.length} accounts`}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          compact
          title={users.length ? "No accounts match" : "No accounts yet"}
          body={users.length ? "Try another search or clear the filters." : "Create the first teacher account, then the classes and students."}
          action={users.length ? "Clear filters" : "Create account"}
          onAction={users.length ? clearFilters : () => setCreateOpen(true)}
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-rule-2 bg-sunken/40">
              <Th>Name</Th>
              <Th className="max-narrow:hidden">Role</Th>
              <Th className="max-narrow:hidden">Class</Th>
              <Th className="max-tablet:hidden">Status</Th>
              <Th className="w-14 text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const status = (
                <span className="flex flex-col items-start gap-1">
                  <StatusDot tone={u.active ? "success" : "muted"}>{u.active ? "Active" : "Inactive"}</StatusDot>
                  {u.mustChangePassword && u.active && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
                      <KeyRound size={12} aria-hidden="true" /> Temporary password
                    </span>
                  )}
                  {u.role === "student" && u.hasParentContact === false && <span className="text-[12px] text-ink-3">No parent contact</span>}
                </span>
              );
              return (
                <tr key={u.id} className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/40">
                  <Td>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.name} src={u.photoUrl} size="md" decorative />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-ink">{u.name}</div>
                        <div className="truncate text-[12.5px] text-ink-3" title={u.email}>{u.email}</div>
                        <div className="mt-1 text-[12px] text-ink-3 narrow:hidden">
                          {u.role === "teacher" ? "Teacher" : "Student"} · {classLabel(u)}
                        </div>
                        <div className="mt-1.5 tablet:hidden">{status}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="max-narrow:hidden">
                    <span className={u.role === "teacher" ? "inline-flex rounded-full bg-primary-dim px-2.5 py-0.5 text-[12px] font-medium text-primary" : "inline-flex rounded-full bg-raised px-2.5 py-0.5 text-[12px] font-medium text-ink-2"}>
                      {u.role === "teacher" ? "Teacher" : "Student"}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] tabular-nums text-ink-2 max-narrow:hidden">{classLabel(u)}</Td>
                  <Td className="max-tablet:hidden">{status}</Td>
                  <Td className="px-2 text-right narrow:px-3">
                    {u.id !== me?.id && <ActionMenu label={`Actions for ${u.name}`} items={menuFor(u)} />}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <CreateAccountModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (params.get("new")) setFilter("new", "");
        }}
        classes={classes}
        onCreate={async (data) => {
          const { temporaryPassword, ...made } = await createUser(data);
          toast.push(`${made.role === "teacher" ? "Teacher" : "Student"} account created for ${made.name}`, "success");
          setSecret({ name: made.name, email: made.email, password: temporaryPassword, reason: "created" });
        }}
      />
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        secondaryLabel={confirmState?.secondaryLabel}
        onSecondary={confirmState?.onSecondary}
        onConfirm={() => confirmState?.onConfirm?.()}
        tone={confirmState?.tone}
        onClose={() => setConfirmState(null)}
      />
      <ParentContactDialog student={contactOf} onClose={() => setContactOf(null)} />
      <TemporaryPasswordDialog state={secret} onClose={() => setSecret(null)} />
    </PageFrame>
  );
};

export default AdminUsers;
