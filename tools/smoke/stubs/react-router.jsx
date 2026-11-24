// Minimal react-router stand-in: matches the app's real route config and renders it,
// so RequireAuth / RequireRole / SubjectGate / Layout / pages all run for real.
import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const snap = () => window.location.pathname + window.location.search;
const subscribe = (l) => { listeners.add(l); window.addEventListener("popstate", l); return () => { listeners.delete(l); window.removeEventListener("popstate", l); }; };
const navigateTo = (to, opts = {}) => {
  if (typeof to === "number") { window.history.go(to); return; }
  window.history[opts.replace ? "replaceState" : "pushState"]({}, "", to);
  emit();
};

export const createBrowserRouter = (routes) => ({ routes });

const matchNodes = (nodes, segs, params) => {
  for (const node of nodes) {
    if (node.index) { if (segs.length === 0) return [{ node, params }]; continue; }
    const own = (node.path ?? "").split("/").filter(Boolean);
    if (own.length > segs.length) continue;
    const p = { ...params };
    let ok = true;
    own.forEach((s, i) => { if (s.startsWith(":")) p[s.slice(1)] = decodeURIComponent(segs[i]); else if (s !== segs[i]) ok = false; });
    if (!ok) continue;
    const rest = segs.slice(own.length);
    if (node.children) { const sub = matchNodes(node.children, rest, p); if (sub) return [{ node, params: p }, ...sub]; }
    else if (rest.length === 0) return [{ node, params: p }];
  }
  return null;
};

const Ctx = createContext({ chain: [], i: -1, params: {} });
const renderAt = (chain, i) => {
  const m = chain[i];
  if (!m) return null;
  return <Ctx.Provider value={{ chain, i }}>{m.node.element ?? <Outlet />}</Ctx.Provider>;
};

export const RouterProvider = ({ router }) => {
  const path = useSyncExternalStore(subscribe, snap);
  const pathname = path.split("?")[0];
  const chain = matchNodes(router.routes, pathname.split("/").filter(Boolean), {});
  if (!chain) return <div data-no-route>No route for {pathname}</div>;
  return renderAt(chain, 0);
};

export const Outlet = () => {
  const { chain, i } = useContext(Ctx);
  return renderAt(chain, i + 1);
};
export const useParams = () => { const { chain } = useContext(Ctx); return chain.reduce((a, m) => ({ ...a, ...m.params }), {}); };
export const useMatches = () => { const { chain } = useContext(Ctx); return chain.map((m) => ({ handle: m.node.handle, params: m.params, pathname: window.location.pathname })); };
export const useLocation = () => { const p = useSyncExternalStore(subscribe, snap); const [pathname, search = ""] = p.split("?"); return { pathname, search: search ? `?${search}` : "", hash: "", state: null, key: p }; };
export const useNavigate = () => navigateTo;
export const useSearchParams = () => { const p = useSyncExternalStore(subscribe, snap); const q = new URLSearchParams(p.split("?")[1] ?? ""); return [q, (next) => navigateTo(window.location.pathname + "?" + new URLSearchParams(typeof next === "function" ? next(q) : next).toString(), { replace: true })]; };
export const Link = ({ to, children, replace, onClick, ...rest }) => <a href={to} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) { e.preventDefault(); navigateTo(to, { replace }); } }} {...rest}>{children}</a>;
export const NavLink = ({ to, end, children, className, ...rest }) => {
  const { pathname } = useLocation();
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  return (
    <Link to={to} aria-current={isActive ? "page" : undefined} className={typeof className === "function" ? className({ isActive }) : className} {...rest}>
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
};
export const Navigate = ({ to, replace }) => { useEffect(() => { navigateTo(to, { replace }); }, [to]); return null; };
export const ScrollRestoration = () => null;
export const isRouteErrorResponse = () => false;
export const useRouteError = () => null;
