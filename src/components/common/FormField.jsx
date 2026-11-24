// ── Form field wrapper ──
export const Field = ({ label, hint, children }) => (
  <label className="mb-4 block">
    <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-[12px] text-ink-3">{hint}</span>}
  </label>
);
