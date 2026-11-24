import { BrandMark } from "./BrandMark";
import { useBranding } from "@/hooks/useInstitution";
import { cn } from "@/lib/cn";

// The institution's own logo (or the Vellum mark when it has none). Reads the public
// branding itself, so it works on the sign-in page too. While that loads it keeps its
// space and shows nothing, so the wrong brand never flashes.
export const InstitutionMark = ({ size = 28, className }) => {
  const { data } = useBranding();
  if (!data) return <span aria-hidden="true" className="shrink-0" style={{ width: size, height: size }} />;
  if (!data.logo) return <BrandMark size={size} />;
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md bg-white", className)} style={{ width: size, height: size }}>
      <img src={data.logo} alt="" className="size-full object-contain p-0.5" />
    </span>
  );
};

// Mark + the institution's short name in the serif wordmark style.
export const InstitutionWordmark = ({ size = 28, tone = "ink", className = "" }) => {
  const { data } = useBranding();
  return (
    <span className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}>
      <InstitutionMark size={size} />
      <span
        title={data?.name}
        className={`truncate font-serif font-semibold leading-none tracking-[-0.02em] ${tone === "sidebar" ? "text-sidebar-ink" : "text-ink"}`}
        style={{ fontSize: Math.round(size * 0.72) }}
      >
        {data?.shortName}
      </span>
    </span>
  );
};

// Letterhead for printed pages (hidden on screen): logo, full name, city, print date.
export const PrintHeader = ({ institution, title }) => (
  <div className="print-only mb-6 items-center gap-3 border-b border-rule-2 pb-3">
    {institution?.logo && <img src={institution.logo} alt="" className="size-12 object-contain" />}
    <div className="min-w-0 flex-1">
      <div className="font-serif text-[18px] font-semibold text-ink">{institution?.name}</div>
      <div className="text-[12px] text-ink-3">{[institution?.city, title].filter(Boolean).join(" · ")}</div>
    </div>
    <div className="text-[12px] text-ink-3">{new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>
);
