import { BookOpen, Eye } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMyPermissions } from "@/features/admin/useMyPermissions";

const sections = [
  { to: "/app/past-questions", label: "Overview", end: true },
  { to: "/app/past-questions/institutions", label: "Institutions" },
  { to: "/app/past-questions/courses", label: "Courses" },
  { to: "/app/past-questions/upload", label: "Upload" },
  { to: "/app/past-questions/my-resources", label: "My resources" },
];

export function PastQuestionsLayout() {
  const permissions = useMyPermissions();
  const visibleSections = [
    ...sections,
    ...(permissions.data?.includes("past_questions.review")
      ? [{ to: "/app/past-questions/manage", label: "Management" }]
      : []),
    ...(permissions.data?.includes("past_questions.manage")
      ? [{ to: "/app/past-questions/catalog", label: "Catalog" }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-primary/10 sm:h-72 sm:w-72" />
        <div className="relative flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm sm:flex"><BookOpen size={23} aria-hidden="true" /></span>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#efd9db] bg-white/80 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary shadow-sm">
              Academic resources
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-fg sm:text-3xl">Past Questions Library</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Explore an academic resource centre designed to help students find and share examination materials.</p>
          </div>
        </div>
      </header>

      <nav aria-label="Past Questions" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        {visibleSections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            end={section.end}
            className={({ isActive }) => `min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm ${isActive ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-[#fff4f2] hover:text-primary"}`}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>

      <div role="note" aria-label="Past Questions security notice" className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <Eye size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p><strong>Protected library.</strong> Only approved resources appear in browsing. Your submissions stay private until reviewed, and PDF access uses short-lived secure links.</p>
      </div>

      <Outlet />
    </div>
  );
}
