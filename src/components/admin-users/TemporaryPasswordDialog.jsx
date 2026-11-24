import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { ModalShell } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";

// ═══════════════════════════════════════════════════════════════
// TEMPORARY PASSWORD DIALOG
// Shown once after an account is created or its password is reset. The server never returns the
// password again, so a click outside does not close this dialog. The account must choose its own
// password at first sign-in.
// ═══════════════════════════════════════════════════════════════
export const TemporaryPasswordDialog = ({ state, onClose }) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  const { name, email, password, reason } = state;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push("Couldn't copy. Select the password and copy it by hand", "error");
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeOnBackdrop={false}
      title={reason === "reset" ? "Password reset" : "Account created"}
      maxWidth="480px"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <p className="mb-4 text-[14px] leading-relaxed text-ink-2">
        Temporary password for <b className="font-semibold text-ink">{name}</b>
        <span className="block text-[13px] text-ink-3 [overflow-wrap:anywhere]">{email}</span>
      </p>
      <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-rule-2 bg-sunken px-3.5 py-3">
        <code dir="ltr" className="min-w-0 flex-1 select-all font-mono text-[17px] tracking-wide text-ink [overflow-wrap:anywhere]" aria-label="Temporary password">
          {password}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
        <li>
          <b className="font-semibold text-ink">This is the only time it is shown.</b> Vellum doesn't send it by email.
        </li>
        <li>Hand it over in person or on paper, not in a group chat.</li>
        <li>They will be asked to choose their own password the first time they sign in.</li>
      </ul>
    </ModalShell>
  );
};
