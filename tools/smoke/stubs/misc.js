export const clsx = (...a) => a.flat(Infinity).flatMap((x) => (!x ? [] : typeof x === "string" ? [x] : typeof x === "object" ? Object.entries(x).filter(([, v]) => v).map(([k]) => k) : [])).join(" ");
export default clsx;
