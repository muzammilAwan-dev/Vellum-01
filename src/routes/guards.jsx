import { Navigate, Outlet, useLocation } from "react-router";
import { useApp } from "@/context/useApp";
import { ROLE_HOME, resolvePath } from "./paths";

export const RequireAuth = ({ children }) => {
  const { role } = useApp();
  if (!role) return <Navigate to="/login" replace />;
  return children;
};

export const RedirectToRoleHome = () => {
  const { role } = useApp();
  return <Navigate to={role ? ROLE_HOME[role] : "/login"} replace />;
};

// Signed out → /login. Signed in with another role → that role's own home.
// Wraps children, or renders <Outlet /> when used as a route-group element.
// A user on a temporary password may only see their Profile (to set a new one) until it is changed.
export const RequireRole = ({ role: allowed, children }) => {
  const { role, user } = useApp();
  const { pathname } = useLocation();
  if (!role) return <Navigate to="/login" replace />;
  if (role !== allowed) return <Navigate to={ROLE_HOME[role]} replace />;
  const profilePath = resolvePath(role, "profile");
  if (user?.mustChangePassword && pathname !== profilePath) return <Navigate to={profilePath} replace />;
  return children ?? <Outlet />;
};
