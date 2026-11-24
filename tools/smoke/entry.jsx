import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ToastProvider } from "@/context/ToastContext";
import { AppProvider } from "@/context/AppContext";
import { useApp } from "@/context/useApp";
import { router } from "@/routes";
import { installMockServer } from "@/mocks/server";
import { resetMockData } from "@/mocks/db";
import * as client from "@/api/client";
import { clearCache } from "@/api/cache";
import { login } from "@/api/auth";

installMockServer({ baseUrl: client.BASE_URL });
window.__errors = [];
const origError = console.error;
const STUB_NOISE = /is unrecognized in this browser|incorrect casing/;
console.error = (...a) => {
  if (STUB_NOISE.test(String(a[0]) + String(a[1] ?? ""))) return origError(...a); window.__errors.push("console.error: " + a.map((x) => (x && x.stack) || String(x)).join(" ").slice(0, 600)); origError(...a); };
window.addEventListener("error", (e) => window.__errors.push("window.error: " + e.message));
window.addEventListener("unhandledrejection", (e) => window.__errors.push("unhandledrejection: " + (e.reason?.message ?? e.reason)));

class Boundary extends React.Component {
  state = { crashed: null };
  static getDerivedStateFromError(e) { return { crashed: e }; }
  componentDidCatch(e) { window.__onCrash?.(); window.__errors.push("RENDER CRASH: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 4).join("\n")); }
  render() { return this.state.crashed ? <pre data-crash>{String(this.state.crashed.message)}</pre> : this.props.children; }
}

const Boot = ({ role, email = "", onReady }) => {
  const { signIn, user } = useApp();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      if (role) { // role = null → stay signed out (login page, 404)
        const s = await login({ email, password: "x", role });
        signIn({ token: s.token, user: s.user });
      }
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (ready && (user || !role)) onReady?.(); }, [ready, user]);
  return ready && (user || !role) ? <RouterProvider router={router} /> : null;
};

let root = null;
window.__get = (p) => client.call(p);
window.__call = (p, opts) => client.call(p, opts); // writes, e.g. creating an account to sign in as
window.__mount = async (role, path, { fresh = true, email = "" } = {}) => {
  if (root) root.unmount();
  window.__errors.length = 0;
  window.localStorage.clear();
  client.setAuthToken(null);
  clearCache(); // what signing out does: nothing from the previous session may show up in the next one
  if (fresh) resetMockData();
  window.history.replaceState({}, "", path);
  document.body.innerHTML = '<div id="root"></div>';
  window.localStorage.setItem("vellum.sidebarCollapsed", "false");
  root = createRoot(document.getElementById("root"));
  // resolves when the app is up, when something crashes, or after 8 s (so a hang is reported, not endless)
  await Promise.race([
    new Promise((resolve) => {
      root.render(<ToastProvider><AppProvider><Boundary><Boot role={role} email={email} onReady={resolve} /></Boundary></AppProvider></ToastProvider>);
    }),
    new Promise((resolve) => { window.__onCrash = resolve; }),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
};
window.__text = () => document.body.innerText;
window.__crashed = () => !!document.querySelector("[data-crash]");
