import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function RequireAuth() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div role="status" aria-busy="true" className="p-8">Loading…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

// Frontend convenience only. Every admin action is re-checked by RLS/RPCs in the database.
export function RequireStaff() {
  const { session, role, loading } = useAuth();
  if (loading) return <div role="status" aria-busy="true" className="p-8">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (role === "student") return <Navigate to="/" replace />;
  return <Outlet />;
}
