export const twMerge = (...a) => a.flat(Infinity).filter(Boolean).join(" ");
export const extendTailwindMerge = () => twMerge;
