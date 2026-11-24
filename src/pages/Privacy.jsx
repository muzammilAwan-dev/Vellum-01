import { Link } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { PageError, PageLoading } from "@/components/common";
import { PolicyDocument } from "@/components/privacy/PolicyDocument";
import { Button, buttonVariants } from "@/components/ui/button";
import { useBranding, usePrivacy } from "@/hooks/useInstitution";
import { cn } from "@/lib/cn";

// ═══════════════════════════════════════════════════════════════
// /privacy — the institution's privacy policy. Public: readable before sign-in (the sign-in page links here).
// ═══════════════════════════════════════════════════════════════
const fmt = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

const Privacy = () => {
  const { data, error, refetch } = usePrivacy();
  const { data: branding } = useBranding();
  if (error) return <div className="mx-auto max-w-[720px] px-4 py-10"><PageError error={error} onRetry={refetch} /></div>;
  if (!data) return <PageLoading />;
  const date = fmt(data.effectiveDate) || fmt(data.updatedAt);
  return (
    <main id="main" className="mx-auto max-w-[720px] px-5 py-8 tablet:py-12">
      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <Link to="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}><ArrowLeft size={14} />Back</Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} />Print</Button>
      </div>
      <header className="mb-6 flex items-center gap-3 border-b border-rule pb-5">
        {branding?.logo && <img src={branding.logo} alt="" className="size-12 rounded-lg object-contain" />}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink-2">{branding?.name}</div>
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">Privacy policy</h1>
        </div>
      </header>
      <p className="mb-5 text-[12.5px] text-ink-3">
        Version {data.version}{date ? ` · ${data.effectiveDate ? "In effect from" : "Last updated"} ${date}` : ""}
      </p>
      {!data.reviewed && (
        <p role="note" className="mb-6 rounded-[var(--radius-control)] border border-warning/40 bg-warning-dim px-4 py-3 text-[13px] leading-relaxed text-ink">
          The institution has not confirmed this policy yet. It may change.
        </p>
      )}
      <PolicyDocument text={data.text} />
    </main>
  );
};

export default Privacy;
