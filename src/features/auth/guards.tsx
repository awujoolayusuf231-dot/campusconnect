import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingState } from "@/app/LoadingState";

export function RequireAuth() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingState label="Checking your account" variant="page" />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

// Frontend convenience only. Every admin action is re-checked by RLS/RPCs in the database.
export function RequireStaff() {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingState label="Checking your access" variant="page" />;
  if (!session) return <Navigate to="/login" replace />;
  if (role === "student") return <Navigate to="/" replace />;
  return <Outlet />;
}
