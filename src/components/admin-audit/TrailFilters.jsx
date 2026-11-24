import { Search } from "lucide-react";
import { Chip, ChipRow } from "@/components/common";
import { TRAIL_FILTERS } from "@/lib/auditTrail";

export const TrailFilters = ({ filter, onFilter, query, onQuery, counts }) => (
  <div className="mb-4 flex flex-wrap items-center gap-2">
    <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-[var(--radius-control)] border border-rule-2 bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 narrow:max-w-[320px]">
      <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
      <input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search student or question…"
        aria-label="Search by student or question"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
      />
    </label>
    <ChipRow>
      {TRAIL_FILTERS.map((f) => (
        <Chip key={f.id} active={filter === f.id} onClick={() => onFilter(f.id)}>
          {f.label}
          <span className="ml-1.5 tabular-nums opacity-70">{counts[f.id]}</span>
        </Chip>
      ))}
    </ChipRow>
  </div>
);
