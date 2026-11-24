import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/common";
import { EVENT_GROUPS, EVENT_LABEL } from "@/lib/auditEvents";

export const EventFilters = ({ value, onChange, actors, onClear }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const typeChoices = (EVENT_GROUPS.find((g) => g.id === value.group)?.types ?? EVENT_GROUPS.flatMap((g) => g.types)).map((t) => ({ value: t, label: EVENT_LABEL(t) }));
  const dirty = Object.values(value).some(Boolean);
  return (
    <div className="mb-4 grid gap-3 narrow:grid-cols-2 tablet:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <Select
        aria-label="Kind of event"
        value={value.group}
        onChange={(group) => set({ group, type: "" })}
        options={[{ value: "", label: "All kinds of event" }, ...EVENT_GROUPS.map((g) => ({ value: g.id, label: g.label }))]}
      />
      <Select
        aria-label="Specific event"
        value={value.type}
        onChange={(type) => set({ type })}
        options={[{ value: "", label: "Any specific event" }, ...typeChoices]}
      />
      <Select
        aria-label="Person"
        value={value.actor}
        onChange={(actor) => set({ actor })}
        options={[{ value: "", label: "Anyone" }, ...actors.map((a) => ({ value: a.id, label: `${a.name}${a.role && a.role !== "system" ? ` (${a.role})` : ""}` }))]}
      />
      <div className="flex items-center gap-2">
        <input type="date" aria-label="From date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} className={inputClass} />
        <span className="text-ink-3">–</span>
        <input type="date" aria-label="To date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className={inputClass} />
      </div>
      <Button variant="ghost" onClick={onClear} disabled={!dirty}>
        Clear
      </Button>
    </div>
  );
};
