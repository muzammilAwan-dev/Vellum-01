import { useEffect } from "react";
import { useLocation } from "react-router";
import { PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
import { InstitutionForm } from "@/components/admin-institution/InstitutionForm";
import { PrivacyPolicyEditor } from "@/components/admin-institution/PrivacyPolicyEditor";
import { useInstitution, usePrivacy } from "@/hooks/useInstitution";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "contact", label: "Contact" },
  { id: "photos", label: "Student photos" },
  { id: "privacy", label: "Privacy policy" },
];

const AdminInstitution = () => {
  const { data: institution, isLoading, error, refetch } = useInstitution();
  const { data: privacy } = usePrivacy();
  const { hash } = useLocation();
  // Links like /admin/institution#privacy (from the admin home) land on that section once it exists.
  const ready = !!institution && !!privacy;
  useEffect(() => {
    if (!ready || !hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
  if (isLoading) return <PageLoading />;
  if (error || !institution) return <PageError error={error} onRetry={refetch} />;
  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Institution" }]}
        title="Institution"
        intro="Your institution's name and logo lead every screen, printed report and profile. These settings apply to everyone."
      />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Institution settings" className="max-lg:hidden">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={cn("flex min-h-9 items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40")}
                >
                  {s.label}
                  {s.id === "privacy" && privacy && !privacy.reviewed && <span className="rounded-full bg-warning-dim px-2 py-px text-[11.5px] font-semibold text-warning">Draft</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-[820px] flex-col gap-6">
          <InstitutionForm institution={institution} />
          <PrivacyPolicyEditor />
        </div>
      </div>
    </PageFrame>
  );
};

export default AdminInstitution;
