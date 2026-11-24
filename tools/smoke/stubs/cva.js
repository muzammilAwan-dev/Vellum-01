export const cva = (base, cfg = {}) => (props = {}) =>
  [base, ...Object.entries(cfg.variants ?? {}).map(([k, v]) => v[props[k] ?? cfg.defaultVariants?.[k]]), props.className].filter(Boolean).join(" ");
export const cx = (...a) => a.filter(Boolean).join(" ");
