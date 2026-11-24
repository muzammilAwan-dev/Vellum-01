import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

// Theme is a per-device choice (the sidebar toggle edits the same setting).
// The parent-message style is its own section below (F12c2).
export const ProfilePreferences = () => {
  const { theme, toggleTheme } = useTheme();
  const choose = (id) => {
    if (id !== theme) toggleTheme();
  };
  return (
    <section aria-labelledby="profile-prefs" className="mb-10">
      <h2 id="profile-prefs" className="mb-3 text-[14px] font-semibold text-ink">
        Preferences
      </h2>
      <div className="text-[13px] font-medium text-ink-2" id="theme-label">
        Theme
      </div>
      <div role="group" aria-labelledby="theme-label" className="mt-1.5 inline-flex rounded-[var(--radius-control)] border border-rule-2 bg-surface p-1">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            onClick={() => choose(id)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3.5 text-[13px] font-semibold transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              theme === id ? "bg-primary text-on-primary" : "text-ink-2 hover:bg-raised hover:text-ink",
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Saved on this device.</p>
    </section>
  );
};
