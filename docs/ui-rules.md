# UI rules

Tailwind v4 + WCAG 2.2 AA; re-verify at U1.

 semantic tokens only (`text-ink`, `bg-surface`, `border-rule`, `--radius-control`; no raw palette/hex), `cn()` to merge, no `@apply`, no class names built from fragments, `size-N` when w=h
- tokens in `@theme`; dark/light = custom variants on `data-theme`
- page layout by viewport breakpoints (`narrow` 520, `tablet` 860), reusable parts by container queries; `dvh` not `100vh`; `min-w-0`+`truncate` in flex rows; wide tables in `overflow-x-auto`; pills `whitespace-nowrap` (or truncate + `title` for user text)
- visible `focus-visible` on everything (never bare `outline-none`), not hidden under sticky bars; hit area ≥24×24 (2.5.8; ≥44 on touch via `pointer-coarse:`), check by hand (axe target-size is off by default); contrast 4.5:1 / 3:1; `motion-reduce:`; native `<button>`/`<a>`, icon-only buttons need `aria-label`; dialogs trap/restore focus; `aria-live` for async status; tooltips dismissible + hoverable (1.4.13)
- every drag/reorder has a click alternative (2.5.7); never re-ask known info (3.3.7); login allows paste/autofill (3.3.8); 2.4.13 is AAA but keep 3:1 focus rings
- every data screen has loading / empty / error+retry / success and survives long names, 50+ rows, ≤640 px, dark + light
- **icons** = `lucide-react` only (shadcn default, tree-shakes, one look), `react-icons` only for brand logos, never text glyphs (`▶ ≡ × ✓`)
- **motion** = CSS/Tailwind first, `transform`/`opacity` only (not width/height), 150–300 ms; `motion` package only for exit/layout/spring needs (none yet); `tw-animate-css` replaces `tailwindcss-animate`
- `collapsed` sidebar is desktop-only (`useIsDesktop`).

## Shared patterns (U1, vellum-65/66) — reuse, don't rebuild
- every admin/teacher page starts with `PageHeader` (breadcrumb, the one `h1`, intro, actions); the top bar shows the same name as plain text. The `h1` = the nav name (or the object's name: a test, a student); playful lines go in the intro
- search = `SearchField` (16 px on phones, its own focus ring); filters = `Chip` with the count inside; one choice of a few = `Segmented`
- tables = `TableShell` (`label` makes the scroll box focusable); add `stack` + `Td label="…"` so rows become cards under 520 px, `hideMid` for secondary columns between 520 and 1024
- expandable rows: `RowToggle` in the first cell (keyboard + `aria-expanded`); a row click is only a mouse shortcut
- row actions: one visible main action + `ActionMenu` ("⋯") for the rest; Delete goes last, `danger`
- numbers in a row of tiles only when they act (link or filter); otherwise one summary sentence. `MetricCard` is compact on phones
- live things use `StatusDot tone="live"` (primary, pulsing), never the danger colour; a "Live" indicator only where something really polls
- steppers = `NumberStepper` with a `label`; growing text = `AutoTextarea`; WhatsApp text previews = `WhatsAppText`
- disabled primary buttons are neutral (raised + ink-3), and the page says why when it isn't obvious
