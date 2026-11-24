import { Search, X } from "lucide-react";
import { inputClass } from "./inputClass";
import { cn } from "@/lib/cn";

// ── Search box: the input itself is the field (its own border and focus ring), with a
// leading icon and a clear button. `label` is for screen readers; the placeholder is a hint.
export const SearchField = ({ label, value, onChange, placeholder, className }) => (
  <div className={cn("relative min-w-0", className)}>
    <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={cn(inputClass, "pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden")}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear search"
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <X size={15} aria-hidden="true" />
      </button>
    )}
  </div>
);
