import { useState } from "react";
import { KeyRound, Phone, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { CreateAccountModal } from "@/components/admin-users/CreateAccountModal";
import { ParentContactDialog } from "@/components/guardian/ParentContact";
import { TemporaryPasswordDialog } from "@/components/admin-users/TemporaryPasswordDialog";
import { createUser, deleteUser, resetPassword, updateUser } from "@/api/admin";
import { ConfirmDialog, PageError, PageLoading, StatusDot, TableShell, Td, Th } from "@/components/common";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useUsers } from "@/hooks/useAdmin";
import { useClasses } from "@/hooks/useSubjects";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

// Row actions: text buttons from 520 px, 40 px icon buttons below (aria-label keeps the name).
const ROW_BTN =
  "inline-flex items-center justify-center rounded-[var(--radius-control)] text-[12px] font-medium text-ink-3 transition-colors max-narrow:size-10 narrow:px-3 narrow:py-2";

// ═══════════════════════════════════════════════════════════════
// ADMIN USERS
// ═══════════════════════════════════════════════════════════════
const AdminUsers = () => {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [contactOf, setContactOf] = useState(null); // { id, name } of the student whose parent contact is open
  const [secret, setSecret] = useState(null); // { name, email, password, reason } — shown once
  const { user: me } = useApp();
  const usersRes = useUsers();
  const classesRes = useClasses();

  if (usersRes.isLoading || classesRes.isLoading) return <PageLoading />;
  const loadError = usersRes.error || classesRes.error;
  if (loadError) return <PageError error={loadError} onRetry={() => { usersRes.refetch(); classesRes.refetch(); }} />;
  const users = usersRes.data ?? [];
  const classes = classesRes.data ?? [];
  const codeOf = (id) => classes.find((c) => c.id === id)?.code;
  // Students: their class code. Teachers: every class they teach.
  const classLabel = (u) =>
    u.role === "student"
      ? (u.cls ?? "—")
      : (u.classIds ?? []).map(codeOf).filter(Boolean).join(", ") || "—";
  const run = async (fn, fallback) => {
    try {
      await fn();
    } catch (err) {
      toast.push(err.message || fallback, "error");
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span className="text-ink-3">/</span> Accounts
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            Accounts
          </h1>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
            Every teacher and student in the system.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} /> Create account
        </Button>
      </div>

      <TableShell>
        <thead>
          <tr className="border-b border-rule-2">
            <Th>Name</Th>
            <Th className="max-tablet:hidden">Email</Th>
            <Th className="max-tablet:hidden">Role</Th>
            <Th className="max-tablet:hidden">Class</Th>
            <Th className="max-narrow:hidden">Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const status = (
              <StatusDot tone={u.active ? "success" : "warning"}>
                {u.active ? "Active" : "Inactive"}
              </StatusDot>
            );
            return (
            <tr
              key={u.id}
              className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50"
            >
              <Td className="text-[13.5px] font-medium text-ink">
                {u.name}
                <div className="mt-0.5 wrap-anywhere text-[12px] font-normal text-ink-3 tablet:hidden">
                  {u.email}
                  <br />
                  {u.role} · Class {classLabel(u)}
                </div>
                <div className="mt-1.5 narrow:hidden">{status}</div>
              </Td>
              <Td className="text-[12px] text-ink-3 max-tablet:hidden">{u.email}</Td>
              <Td className="max-tablet:hidden">
                <span
                  className={cn(
                    "text-[12px] font-medium",
                    u.role === "teacher" ? "text-primary" : "text-ink-2",
                  )}
                >
                  {u.role === "teacher" ? "Teacher" : "Student"}
                </span>
              </Td>
              <Td className="text-[12px] tabular-nums max-tablet:hidden">{classLabel(u)}</Td>
              <Td className="max-narrow:hidden">{status}</Td>
              <Td className="whitespace-nowrap px-2 text-right narrow:px-4">
                {u.id !== me?.id && (
                  <button
                    onClick={() =>
                      run(
                        () => updateUser(u.id, { active: !u.active }),
                        "Couldn't update the account",
                      )
                    }
                    aria-label={`${u.active ? "Deactivate" : "Reactivate"} ${u.name}`}
                    className={cn(ROW_BTN, "hover:bg-raised hover:text-ink")}
                  >
                    {u.active ? (
                      <UserX size={16} aria-hidden="true" className="narrow:hidden" />
                    ) : (
                      <UserCheck size={16} aria-hidden="true" className="narrow:hidden" />
                    )}
                    <span className="max-narrow:hidden">{u.active ? "Deactivate" : "Reactivate"}</span>
                  </button>
                )}
                {u.role === "student" && (
                  <button
                    onClick={() => setContactOf({ id: u.id, name: u.name })}
                    aria-label={`Parent contact for ${u.name}`}
                    className={cn(ROW_BTN, "hover:bg-raised hover:text-ink")}
                  >
                    <Phone size={16} aria-hidden="true" className="narrow:hidden" />
                    <span className="max-narrow:hidden">Parent contact</span>
                  </button>
                )}
                <button
                  onClick={() =>
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
                    })
                  }
                  aria-label={`Reset password for ${u.name}`}
                  className={cn(ROW_BTN, "hover:bg-raised hover:text-ink")}
                >
                  <KeyRound size={16} aria-hidden="true" className="narrow:hidden" />
                  <span className="max-narrow:hidden">Reset password</span>
                </button>
                <button
                  onClick={() =>
                    setConfirmState({
                      title: `Remove ${u.name}?`,
                      message: `This removes ${u.name}'s account from the platform. Their existing test results and history will remain in the system, but they will lose access immediately. This cannot be undone.`,
                      confirmLabel: "Remove account",
                      onConfirm: () =>
                        run(async () => {
                          await deleteUser(u.id);
                          toast.push(`Removed ${u.name}`, "info");
                        }, "Couldn't remove the account"),
                    })
                  }
                  aria-label={`Remove ${u.name}`}
                  className={cn(ROW_BTN, "hover:bg-danger-dim hover:text-danger")}
                >
                  <Trash2 size={16} aria-hidden="true" className="narrow:hidden" />
                  <span className="max-narrow:hidden">Remove</span>
                </button>
              </Td>
            </tr>
            );
          })}
        </tbody>
      </TableShell>

      <CreateAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
        onConfirm={() => confirmState?.onConfirm?.()}
        tone={confirmState?.tone}
        onClose={() => setConfirmState(null)}
      />
      <ParentContactDialog student={contactOf} onClose={() => setContactOf(null)} />
      <TemporaryPasswordDialog state={secret} onClose={() => setSecret(null)} />
    </div>
  );
};

export default AdminUsers;
