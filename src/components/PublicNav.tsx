import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePublicSettings } from "@/lib/publicSettings";
import { useMobile } from "@/lib/useMobile";

export function PublicNav() {
  const s = usePublicSettings().data;
  const { session } = useAuth();
  const isMobile = useMobile();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm ${isActive ? "font-semibold text-fg" : "text-muted hover:text-fg"}`;

  const authActions = session ? (
    <Link to="/app" className="btn-primary w-full justify-center sm:w-auto">
      Open app
    </Link>
  ) : (
    <>
      <Link to="/login" className="btn w-full justify-center sm:w-auto">
        Log in
      </Link>
      {s?.registration_open !== false && (
        <Link
          to="/register"
          className="btn-primary w-full justify-center sm:w-auto"
        >
          Join
        </Link>
      )}
    </>
  );

  if (!isMobile) {
    return (
      <nav
        aria-label="Site"
        className="flex flex-wrap items-center justify-end gap-y-1"
      >
        <NavLink to="/features" className={link}>
          Features
        </NavLink>
        <NavLink to="/about" className={link}>
          About
        </NavLink>
        <NavLink to="/contact" className={link}>
          Contact
        </NavLink>
        <div className="ml-2 flex items-center gap-2">{authActions}</div>
      </nav>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn inline-flex h-10 w-10 items-center justify-center p-0"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="public-mobile-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <Menu size={20} aria-hidden="true" />
        )}
      </button>

      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="public-mobile-nav"
            aria-label="Site"
            className="absolute right-0 top-0 flex h-full w-full max-w-xs flex-col border-l border-line bg-surface p-4 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg">
                CampusConnect
              </span>
              <button
                type="button"
                className="btn inline-flex h-10 w-10 items-center justify-center p-0"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <NavLink to="/features" className={link}>
                Features
              </NavLink>
              <NavLink to="/about" className={link}>
                About
              </NavLink>
              <NavLink to="/contact" className={link}>
                Contact
              </NavLink>
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {authActions}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
