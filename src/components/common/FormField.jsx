// ── Form field wrapper ──
// `error` shows under the control (red, with a mark so it is not colour alone). The text sits
// inside the <label>, so a screen reader reads it with the field's name; callers also set
// aria-invalid on the control.
const FieldError = ({ children }) => (
  <span role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-medium text-danger">
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-[3px] size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 4.8v3.6M8 11.1v.1" />
    </svg>
    {children}
  </span>
);

export const Field = ({ label, hint, error, children }) => (
  <label className="mb-4 block">
    <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
    {children}
    {error ? <FieldError>{error}</FieldError> : hint && <span className="mt-1.5 block text-[12px] text-ink-3">{hint}</span>}
  </label>
);

// A group of controls under one name (chips, radios). A <label> may hold only one control:
// wrapping several buttons in one makes a click on the label text press the first button.
export const FieldGroup = ({ label, hint, error, children }) => (
  <fieldset className="mb-4 min-w-0 border-0 p-0">
    <legend className="mb-1.5 block p-0 text-[13px] font-medium text-ink-2">{label}</legend>
    {children}
    {error ? <FieldError>{error}</FieldError> : hint && <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p>}
  </fieldset>
);
