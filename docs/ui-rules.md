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
