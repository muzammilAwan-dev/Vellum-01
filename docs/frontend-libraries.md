# Frontend library decisions

Researched Nov 2026 (vellum-49); the recommended order was accepted by the user. **Nothing is installed yet.** The assistant's sandbox has no network, so each library is installed with `npm i` on the user's machine and cannot be verified by the assistant in a real browser: adopt one at a time, at the phase shown, and re-check versions and licences then.

Current runtime dependencies: React, React Router, Recharts, react-to-print, lucide-react, class-variance-authority, clsx, tailwind-merge. Select, menu, modal, toasts, forms and the data cache are hand-built.

| When | Library | Why / how |
|---|---|---|
| U1 | **Base UI** (`@base-ui/react`, shadcn default since Jul 2026; stable 1.0 Dec 2025) | Replace hand-built `ui/select.jsx`, `ui/menu.jsx`, `ModalShell` one at a time (focus trap, keyboard, ARIA). Expect silent behaviour changes in menus/selects: test each. `components.json` already supports the shadcn CLI |
| Before U1 | **Playwright + axe-core**, then **Vitest + Testing Library** | Real-browser layout and a11y checks (our smoke test loads no CSS). The 762 node checks keep running; port them to Vitest at F10 |
| B0 | **Zod** (+ **React Hook Form** only for large forms: test builder) | One schema for the form, the API input and docs; replaces hand-porting `lib/profile.js` shape rules. Password blocklist logic stays custom |
| B1/B2 | **TanStack Query v5** | Behind `hooks/useResource.js` and `api/client.js` only; adds retries, dedupe, optimistic updates with rollback, devtools. Not worth it against the fake backend |
| F12a | **@react-pdf/renderer** (alt: pdfmake) | Same JSX template in the browser now and `renderToBuffer` on the server (B14). **First task: a one-page Urdu spike**; if shaping is poor keep react-to-print (browser print) for Urdu |
| F13d (code written, vellum-50) | **react-avatar-editor** (alt: react-easy-crop) | **Run `npm i react-avatar-editor`** (not yet in `package.json`). Zero runtime deps; used behind `components/profile/PhotoDialog.jsx` only, so it is replaceable. Re-encoded to a 256 px JPEG in `lib/encodePhoto.js`. Real drag/zoom behaviour and the controlled `position` props are unverified here |
| Optional | **React Bits** (MIT + Commons Clause, copy-paste via CLI) | Login page and empty states only; never in test-taking or dense dashboards; honour `prefers-reduced-motion`; avoid WebGL backgrounds on phones |
Not yet researched: Urdu/RTL interface (i18n), offline/PWA, math in questions (KaTeX).

## Notes
- **Base UI vs Radix:** shadcn/ui's CLI defaults to Base UI since July 2026; Radix remains supported (`-b radix`). Base UI is the actively maintained successor; migration renames are cheap, behaviour changes in menus/selects are the real cost.
- **Zod:** the same schema runs on the Express API (backend rule in plan §2) and in the form. `lib/profile.js` and `lib/password.js` are plain JS rules written to be ported; Zod replaces the shape checks, not the password blocklist.
- **PDF:** react-to-print (browser print) shapes Urdu correctly but cannot run on the server; `@react-pdf/renderer` and pdfmake can. Decide after the F12a Urdu spike.
- **React Bits:** MIT + Commons Clause is free for personal and commercial use; the clause only bars selling the components themselves.
- **Not researched:** Urdu/RTL interface (i18n), offline/PWA, math rendering (KaTeX).
