import { USE_MOCK, call } from "./client";

// ═══════════════════════════════════════════════════════════════
// AUTH API (API-CONTRACT.md "Auth")
//
//   POST /api/auth/login  { email, password }  → { token, user }
//   GET  /api/auth/me                          → user
//   POST /api/auth/change-password { current, next } → 204 (400 + code TOO_SHORT|TOO_LONG|SAME_AS_CURRENT|CONTAINS_EMAIL|TOO_COMMON|WRONG_PASSWORD)
//
// user = { id, name, email, role: "admin"|"teacher"|"student", mustChangePassword, cls?, roll? }
// The real backend derives the role from the account. Only the fake server
// also reads a `role` hint (so the demo can sign in as anyone), which is why
// it is sent in mock mode alone.
// ═══════════════════════════════════════════════════════════════
export const login = ({ email, password, role }) =>
  call("/auth/login", {
    method: "POST",
    body: { email, password, ...(USE_MOCK ? { role } : {}) },
  });

export const fetchMe = () => call("/auth/me");

/** Changes the signed-in user's own password and clears `mustChangePassword`. Rules: lib/password.js. */
export const changePassword = ({ current, next }) =>
  call("/auth/change-password", { method: "POST", body: { current, next }, invalidates: [["profile"]] });
