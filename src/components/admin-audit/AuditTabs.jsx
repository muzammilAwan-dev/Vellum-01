import { NavLink } from "react-router";
import { cn } from "@/lib/cn";

const TABS = [
  { to: "/admin/audit", label: "Overview", end: true },
  { to: "/admin/audit/tests", label: "Tests" },
  { to: "/admin/audit/teachers", label: "Teachers" },
  { to: "/admin/audit/events", label: "Events" },
];

// Four views of one record: overview and integrity, by test (what happened to each
// answer), by teacher (how each marks compared with the others) and the raw events.
export const AuditTabs = () => (
  <nav aria-label="Audit views" className="mb-6 flex gap-1 border-b border-rule">
    {TABS.map((t) => (
      <NavLink
        key={t.to}
        to={t.to}
        end={t.end}
        className={({ isActive }) =>
          cn(
            "-mb-px inline-flex min-h-10 items-center border-b-2 px-4 text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-12",
            isActive ? "border-primary text-primary" : "border-transparent text-ink-3 hover:text-ink",
          )
        }
      >
        {t.label}
      </NavLink>
    ))}
  </nav>
);
