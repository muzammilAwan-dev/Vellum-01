import { Minus, Plus } from "lucide-react";

// ── Number stepper: − [value] + (suffix) ──
// `label` names the value for screen readers ("Duration in minutes"); the buttons say what they do
// to it. 16 px text on phones (no iOS zoom), 44 px buttons on touch screens, visible focus.
export const NumberStepper = ({ value, onChange, min = 1, max = 100, step = 1, suffix, label = "Value", id }) => {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const btn =
    "grid w-10 place-items-center text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:text-ink-3 pointer-coarse:w-11";
  return (
    <div role="group" aria-label={label} className="inline-flex h-10 items-stretch overflow-hidden rounded-[var(--radius-control)] border border-rule-2 bg-sunken pointer-coarse:h-11">
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Less (${label})`} className={btn}>
        <Minus size={15} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "");
          onChange(v === "" ? min : clamp(parseInt(v, 10)));
        }}
        onBlur={(e) => {
          if (e.target.value === "") onChange(min);
        }}
        className="w-16 border-x border-rule bg-transparent text-center font-mono text-[16px] font-semibold tabular-nums text-ink outline-none focus:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 narrow:text-[15px]"
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`More (${label})`} className={btn}>
        <Plus size={15} aria-hidden="true" />
      </button>
      {suffix && (
        <span aria-hidden="true" className="grid place-items-center border-l border-rule bg-surface px-3.5 text-[12.5px] font-medium text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  );
};
