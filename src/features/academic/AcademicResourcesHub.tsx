import { Brain, BookOpen, CalendarDays, Library, MessagesSquare, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

const hubCard = "group rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:-translate-y-0.5 hover:border-primary/25";

export function LearnHub() {
  const resources = [
    { to: "/app/study-notes", title: "Study Notes", description: "Browse and save course notes shared by the community.", icon: BookOpen },
    { to: "/app/past-questions", title: "Past Questions", description: "Find approved past questions by institution and course.", icon: Library },
    { to: "/app/assignment-discussions", title: "Assignments", description: "Join assignment discussions and collaborate in study rooms.", icon: MessagesSquare },
    { to: "/app/timetable", title: "Timetable", description: "Organize lectures, deadlines, and important academic events.", icon: CalendarDays },
    { to: "/app/flashcards", title: "Flashcards", description: "Create, browse, and practice focused revision cards.", icon: Brain },
    { to: "/app/group-quiz", title: "Quiz", description: "Join group quizzes or create a quiz for classmates.", icon: Trophy },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff0ef] p-5 sm:p-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Learn</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Your academic toolkit</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Notes, past questions, assignments, timetable, flashcards, and quizzes—all in one place.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className={hubCard}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff1f2] text-primary"><Icon size={20} aria-hidden="true" /></span>
            <h2 className="mt-4 font-extrabold text-fg group-hover:text-primary">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

export function CollaborateHub() {
  const resources = [
    { to: "/app/voice-spaces", title: "Voice Spaces", description: "Host or join live campus conversations.", icon: MessagesSquare },
    { to: "/app/projects", title: "Project Board", description: "Plan work and collaborate on student projects.", icon: BookOpen },
    { to: "/app/group-quiz", title: "Group Quiz", description: "Create shared quizzes and practise together.", icon: Trophy },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-[26px] border border-[#e8dfe6] bg-gradient-to-br from-[#f7f3fb] via-white to-[#fff7f7] p-5 sm:p-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Collaborate</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Build and connect together</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Meet classmates in live spaces, manage projects, and learn through group quizzes.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className={hubCard}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff1f2] text-primary"><Icon size={20} aria-hidden="true" /></span>
            <h2 className="mt-4 font-extrabold text-fg group-hover:text-primary">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

export function DiscoverHub() {
  const resources = [
    { to: "/app/opportunities", title: "Opportunities", description: "Explore internships, scholarships, training, and other opportunities.", icon: Trophy },
    { to: "/app/competitions", title: "Competitions", description: "Discover academic, creative, and interuniversity challenges.", icon: Trophy },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff7f6] via-white to-[#fff4ef] p-5 sm:p-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Discover</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Find your next opportunity</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Explore useful opportunities and competitions that help you grow.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        {resources.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className={hubCard}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff1f2] text-primary"><Icon size={20} aria-hidden="true" /></span>
            <h2 className="mt-4 font-extrabold text-fg group-hover:text-primary">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

export function AcademicResourcesHub() {
  return <LearnHub />;
}
