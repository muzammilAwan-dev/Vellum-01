import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/common";
import { EVENT_GROUPS, EVENT_LABEL } from "@/lib/auditEvents";
import { cn } from "@/lib/cn";

// Every filter is its own grid cell with a visible label, so nothing is squeezed or overlapped
// at any width (two date inputs used to share one cell and pushed "Clear" over the To date).
const Cell = ({ label, children, id }) => (
  <div className="min-w-0">
    <span id={id} className="mb-1.5 block text-[12px] font-semibold text-ink-3">{label}</span>
    {children}
  </div>
);

export const EventFilters = ({ value, onChange, actors, onClear }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const typeChoices = (EVENT_GROUPS.find((g) => g.id === value.group)?.types ?? EVENT_GROUPS.flatMap((g) => g.types)).map((t) => ({ value: t, label: EVENT_LABEL(t) }));
  const active = Object.values(value).filter(Boolean).length;
  return (
    <section aria-label="Filter events" className="mb-4 rounded-[var(--radius-container)] border border-rule bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">
          Filters{active > 0 && <span className="ml-2 rounded-full bg-primary-dim px-2 py-px text-[12px] font-semibold text-primary">{active} on</span>}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={!active}>
          Clear all
        </Button>
      </div>
      <div className="grid gap-3 narrow:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_repeat(2,minmax(0,168px))]">
        <Cell label="Kind of event">
          <Select
            aria-label="Kind of event"
            value={value.group}
            onChange={(group) => set({ group, type: "" })}
            options={[{ value: "", label: "All kinds" }, ...EVENT_GROUPS.map((g) => ({ value: g.id, label: g.label }))]}
          />
        </Cell>
        <Cell label="Specific event">
          <Select aria-label="Specific event" value={value.type} onChange={(type) => set({ type })} options={[{ value: "", label: "Any event" }, ...typeChoices]} />
        </Cell>
        <Cell label="Person">
          <Select
            aria-label="Person"
            value={value.actor}
            onChange={(actor) => set({ actor })}
            options={[{ value: "", label: "Anyone" }, ...actors.map((a) => ({ value: a.id, label: `${a.name}${a.role && a.role !== "system" ? ` (${a.role})` : ""}` }))]}
          />
        </Cell>
        <div className="grid min-w-0 grid-cols-2 gap-3 narrow:col-span-2 lg:col-span-3 lg:max-w-[360px] xl:col-span-2 xl:max-w-none">
          <Cell label="From">
            <input type="date" aria-label="From date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} className={cn(inputClass, "w-full min-w-0")} />
          </Cell>
          <Cell label="To">
            <input type="date" aria-label="To date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className={cn(inputClass, "w-full min-w-0")} />
          </Cell>
        </div>
      </div>
    </section>
  );
};
