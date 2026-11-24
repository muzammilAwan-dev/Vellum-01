import { inputClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Same look as <Input>; kept as a class string for existing <input>/<textarea> usages (selects use components/ui/select.jsx).
// min-h (not h) so <textarea> can still grow; 44px floor matches touch-target guidance.
// (Apart from FormField.jsx so that file only exports a component.)
export const inputClass = cn(inputClasses, "min-h-11 py-2.5 pointer-coarse:min-h-12");
