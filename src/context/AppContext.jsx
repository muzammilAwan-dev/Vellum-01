import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchMe } from "@/api/auth";
import { clearCache } from "@/api/cache";
import { onUnauthorized, setAuthToken } from "@/api/client";
import { usePersistentState } from "@/hooks/usePersistentState";
import { AppCtx } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useClasses, useSubjects } from "@/hooks/useSubjects";

// ═══════════════════════════════════════════════════════════════
// APP CONTEXT
//
// All cross-cutting state that used to live in Root(). Now provided
// once by <AppProvider> (which wraps <RouterProvider>), so AppShell
// and any feature page can read/write without prop drilling.
//
// Persisted (survives reload):
//   · user            — who is signed in (from /auth/login); `role` comes from it
//   · activeClassId, activeSubjectId — the teacher's current class and subject
//
// Transient (in-memory only):
//     (tests, attempts and grading come from the API via hooks/)
//   · modal open/close flags
// ═══════════════════════════════════════════════════════════════
export const AppProvider = ({ children }) => {
  const toast = useToast();
  // ── Persisted ──────────────────────────────────────────────
  const [user, setUser]               = usePersistentState("vellum.user", null);
  const role = user?.role ?? null;
  const [activeClassId, setActiveClassId] = usePersistentState("vellum.activeClass", null);
  const [activeSubjectId, setActiveSubjectId] = usePersistentState("vellum.activeSubject", null);

  // ── Session ────────────────────────────────────────────────
  const signIn = useCallback(({ token, user: signedIn }) => {
    setAuthToken(token);
    setUser(signedIn);
  }, [setUser]);
  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    clearCache(); // nothing from this session may show up for the next user
  }, [setUser]);

  // Re-reads the signed-in user (e.g. after the password change clears `mustChangePassword`).
  const refreshUser = useCallback(() => fetchMe().then(setUser), [setUser]);

  // Any 401 from the API ends the session; on load, confirm the saved one
  // is still valid and refresh what we know about the user.
  // A 401 while signed in = expired session → sign out and say why. A 401
  // with no session (e.g. wrong password on /login) is the form's own error.
  const sessionRef = useRef(!!user);
  useLayoutEffect(() => {
    sessionRef.current = !!user; // kept current after every render, never written while rendering
  }, [user]);
  useEffect(() => {
    onUnauthorized(() => {
      if (!sessionRef.current) return;
      sessionRef.current = false; // several polls can 401 at once — react once
      signOut();
      toast.push("Your session expired — please sign in again", "info");
    });
    if (user) fetchMe().then(setUser).catch(() => {});
    // run once at startup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Transient app data ─────────────────────────────────────

  // ── Modal + overlay state ──────────────────────────────────
  const [cmdOpen, setCmdOpen]                   = useState(false);
  const [confirmState, setConfirmState]         = useState(null);

  // ── Mobile nav drawer ──────────────────────────────────────
  const [mobileNavOpen, setMobileNavOpen]       = useState(false);

  // ── Derived: classes and subjects from the API ─────────────
  // Falls back to the first class / subject when the saved choice is gone
  // (renamed account, deleted subject). Both are null until loaded.
  const signedIn = !!user;
  const classesRes = useClasses({ enabled: signedIn });
  const subjectsRes = useSubjects({ enabled: signedIn });

  const classList = useMemo(
    () =>
      (classesRes.data ?? []).map((c) => ({
        id: c.id,
        short: c.code,
        name: c.name,
        students: c.studentCount,
      })),
    [classesRes.data]
  );
  const activeClassObj =
    classList.find((c) => c.id === activeClassId) || classList[0] || null;

  const classSubjects = useMemo(
    () => (subjectsRes.data ?? []).filter((s) => s.classId === activeClassObj?.id),
    [subjectsRes.data, activeClassObj?.id]
  );
  const activeSubject =
    classSubjects.find((s) => s.id === activeSubjectId) || classSubjects[0] || null;

  const scopeLoading =
    signedIn && (classesRes.isLoading || subjectsRes.isLoading);
  const scopeError = classesRes.error || subjectsRes.error || null;

  const value = useMemo(
    () => ({
      user, role, signIn, signOut, refreshUser,
      classList, activeClassObj, activeClassId, setActiveClassId,
      classSubjects, activeSubject, setActiveSubjectId, scopeLoading, scopeError,
      cmdOpen, setCmdOpen,
      confirmState, setConfirmState,
      mobileNavOpen, setMobileNavOpen,
    }),
    [
      user, role, signIn, signOut, refreshUser, classList, activeClassObj, activeClassId,
      classSubjects, activeSubject, scopeLoading, scopeError,
      setActiveClassId, setActiveSubjectId,
      cmdOpen, confirmState, mobileNavOpen,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};
