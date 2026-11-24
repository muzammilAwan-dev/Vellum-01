# U1: UI/UX audit and polish

The step before the backend. An AI reviewer (Claude) renders **every page of one role at every screen size, in both themes**, looks at each screenshot as a product designer would, and writes down what is wrong and what could be better. The user then chooses what to fix. One chat per role: **admin → teacher → student → signed out (login, 404)**.

## 1. Tooling (already in the repo)
| Command | Result |
|---|---|
| `bash tools/smoke/build.sh` | bundles the real route table + fake backend → `tools/smoke/bundle.js` |
| `TAILWIND=<path to node_modules/tailwindcss> node tools/audit/build-css.mjs` | compiles `src/styles/index.css` with Tailwind v4's own compiler → `tools/audit/app.css` (so shots are styled like the real app) |
| `ROLE=admin node tools/audit/capture.mjs` | for each page: widths **360, 390, 768, 1024, 1280, 1536** × **light + dark**; extra shots for the scrolled-down parts of long pages; mechanical checks → `tools/audit/shots/<role>/{light,dark}/<page>__<width>.png`, `report.json`, `findings.md` |

`ROLE` = `admin` · `teacher` · `student` · `public` (signed out). Options: `WIDTHS=390,1280`, `THEMES=light`, `ONLY=/admin/users` (path substring). Needs Playwright + Chromium; run long captures in the background (a full role is 100–200 screenshots).

**Mechanical checks per page and width:** sideways page scroll, elements wider than the screen, tap targets under 24×24 px (WCAG 2.2 SC 2.5.8), controls without an accessible name, text under 11 px, images without `alt`, heading structure (one `h1`, no level jumps), duplicate ids, console errors, crashes.

**Not covered (say so in every report):** colour contrast (add a computed check as the first U1 task, or run axe-core on the user's machine), keyboard order and focus visibility, screen readers, real touch, real devices, performance. In this sandbox **fonts fall back** (Google Fonts are not reachable), **icons are placeholder squares** and **charts are placeholder boxes**: layout, spacing, hierarchy, copy, dark mode and the mechanical checks are reliable; type details, icons and chart styling need the user's own screenshots from `npm run dev`.

## 2. Review rubric (what the designer looks at on every page)
1. **Purpose and hierarchy:** is the one main thing obvious in 3 seconds? one primary action? clear heading structure?
2. **Information architecture:** navigation labels, grouping, depth, where am I, how do I go back.
3. **Layout and spacing:** alignment, a consistent spacing rhythm, density (data-heavy vs airy), line length (45–75 characters), empty or cramped areas.
4. **Typography:** scale, weights, serif/sans roles, truncation, long names and Urdu text.
5. **Colour and contrast:** 4.5:1 text, 3:1 for UI parts and focus rings, meaning never by colour alone, dark-mode parity (not just inverted).
6. **Responsive behaviour:** reflow at 360 px and at 400 % zoom, tables, dialogs on phones, sticky bars, safe areas, thumb reach.
7. **Components and consistency:** one pattern per job (buttons, chips, menus, dialogs); tokens only; hover, focus, active, disabled, loading.
8. **Forms:** labels, hints, errors next to the field, autocomplete, input types, keyboard flow.
9. **System feedback:** loading, empty, error and success states; confirmations for destructive actions; undo.
10. **Data visualisation:** can a teacher read it at a glance? labels, scale, colour-blind safe.
11. **Copy:** plain words, consistent names, tone fit for an institution (school, college or university; never say only "school").
12. **Motion and delight:** purposeful, short, `prefers-reduced-motion` respected; never in test-taking.
13. **Trust and brand:** the institution's identity (its name and logo, not Vellum's, lead on every screen), imagery, a calm professional feel.

## 3. Findings format and severity
Each role gets `docs/audit/<role>.md`: a short verdict, then a table.

| ID | Page @ width / theme | Sev | Rubric | What is wrong or could be better | Evidence | Proposed fix |
|---|---|---|---|---|---|---|

- **P0** broken or blocking (cannot read, cannot tap, content lost, crash).
- **P1** real usability or accessibility problem.
- **P2** polish (alignment, rhythm, consistency, small states).
- **P3** idea (a better layout, imagery, motion, a new pattern).

End each report with **"Big ideas"** (≤ 5 bigger moves for the role) and a **proposed batch plan** (what to do in which order). The user then says which IDs to do (default: all P0 + P1, plus the P2/P3 they pick).

## 4. Flow of one role chat
1. **Capture** (§1). Read `findings.md`.
2. **Review:** `view` every screenshot (all widths, both themes, scrolled parts) page by page; also list the *states* the capture can't reach on its own (open dialogs, menus, the command palette, empty / loading / error, very long names, forced temporary-password banner) and capture those with `ONLY=` plus a small script step.
3. **Write** `docs/audit/<role>.md`.
4. **User triage.**
5. **Fix at the shared layer, then sweep** (same pattern elsewhere; light and dark; ≤ 640 px; long text). Swap the hand-built select, menu and modal for **Base UI** here (see `docs/frontend-libraries.md`).
6. **Re-capture only the affected pages** and compare before / after. Run V1 bundle, the integration tests, `node scripts/ui-audit.mjs` (counts must not rise; baseline vellum-38: outline-removed 10, div-onclick 13, inline-style 19, 100vh 0, same-size-wh 1, target-blank 1, rest 0).
7. **Deliver** the zip, the report with items marked done, and what is still unverified.

## 5. Imagery and brand assets (login first)
**Current login (seen in the dry run):** a flat navy slab with a large serif headline and a typing cursor, a lot of dead space, and no imagery; on phones the brand panel disappears completely and the lower 40 % is empty.

**Direction:** calm, premium, editorial; the story is *paper, rubric, marks, clarity*, not stock-photo classrooms. **No faces of children** (privacy, and an institution may not have consent). No text inside images.

**Palette** (approximate, from the app): midnight navy `#0E1340`, indigo `#4350D4`, warm gold `#EBC35A`, paper `#F7F5F0`.

**Technical requirements:** master 2400×1600 (3:2) with the subject on the right two thirds and empty space on the left third; export **AVIF or WebP ≤ 180 KB + a JPEG fallback**; a navy gradient overlay in CSS so white text keeps 4.5:1; `alt=""` (decorative); `fetchpriority="high"` for the one above-the-fold image; a separate crop for phones (a 780×360 banner above the form, not a hidden panel); a dark-mode variant only if the light one looks wrong on navy.

**Prompt A, abstract editorial (recommended):**
> A wide abstract editorial illustration for an education assessment app's sign-in screen. Deep midnight navy background (#0E1340) with fine film grain. Layered, translucent sheets of aged parchment paper in warm ivory and gold (#EBC35A) fanning diagonally, each marked with faint hand-drawn rubric grid lines, tick marks and small margin annotations (no legible words). One bold indigo (#4350D4) ink checkmark stroke sweeping across the composition. Soft light from the upper left, shallow depth of field, calm, premium, modern editorial style. Keep the left third mostly empty dark navy for a headline. 3:2 landscape, 2400×1600.

**Prompt B, photographic, hands only:**
> Macro photograph of a teacher's hand marking a paper test with a fountain pen, warm window light, shallow depth of field, a worn wooden desk, a few loose sheets with abstract scribbles (no readable text), a small brass paperclip. Navy-toned colour grade with warm gold highlights. No faces, no people other than the hand. 3:2 landscape, 2400×1600, left third quiet and dark.

**Prompt C, phone banner / pattern:**
> A subtle seamless geometric pattern of tiny checkmarks, rubric grid lines and dots in slightly lighter navy (#1A2058) on midnight navy (#0E1340), very low contrast, no text, tileable, 1200×1200.

**Negative prompt (if the tool has one):** text, letters, words, logo, watermark, faces, children, cartoon, clipart, neon, busy, high contrast.

**Alternatives:** free-licence stock (Unsplash, Pexels, Pixabay: **check the licence of each file when downloading**; choose hands, paper and desks, never identifiable children); or **no raster at all**: hand-written SVG (layered paper shapes, grid lines, one ink stroke) that Claude can write directly, weighs a few KB and stays sharp at any size. Claude cannot generate or download raster images in this sandbox; the user supplies the file, or Claude writes the SVG.

**Motion (optional, React Bits):** a slow text or background effect on the login page only; respects `prefers-reduced-motion`; no WebGL on phones.

## 6. Seed findings (from the tooling dry run, vellum-51)
| ID | Page @ width | Sev | Finding |
|---|---|---|---|
| S-1 | student profile @ 390 | P2 | "Show passwords" checkbox is 16×16 px (target under 24×24); make the whole label the target and the box 20 px |
| S-2 | login @ 1280 | P3 | Left panel is a flat navy slab with large empty areas; add the hero image (§5) and a short proof line |
| S-3 | login @ 390 | P3 | The brand story is hidden on phones and the lower 40 % of the screen is empty; add a banner above the form and anchor the form lower |

## 7. Polish mode (user-reported issues; one chat = one batch)
*Start:* (1) `node scripts/ui-audit.mjs` leads; (2) web-search current Tailwind v4 / React UI / a11y guidance, add ≤ 8 one-line tips to plan §7; (3) read `src/styles/index.css` and skim `components/ui` + `components/common` so fixes reuse them; (4) ask for the user's issues (screenshots welcome).
*Per issue:* `view` the screenshot, restate it in one line, find the **root cause** (token? shared primitive? one-off classes?), fix at the shared layer, then **sweep** `src/` for the same pattern. Reply: "fixed here + N similar in <files>".
*Limits:* keep the theme, tokens and layout language; no new dependency without asking; say what is unverified visually.
