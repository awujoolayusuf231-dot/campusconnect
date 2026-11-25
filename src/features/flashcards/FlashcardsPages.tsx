import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Award, BookOpen, Brain, Check, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, GraduationCap, Layers3, Lightbulb, ListChecks, LockKeyhole,
  Plus, RotateCcw, Sparkles, Target, Trash2, Trophy, Users,
  type LucideIcon,
} from "lucide-react";
import { listCourses } from "@/features/past-questions/api";
import { LoadingState } from "@/app/LoadingState";
import {
  deleteFlashcardCollection,
  getFlashcardCollection,
  listFlashcardCollections,
  listFlashcardProgress,
  recordFlashcardReview,
  saveFlashcardCollection,
  validateFlashcardCollection,
  type FlashcardCollection,
  type FlashcardStatus,
} from "./api";

type FlashcardDraft = { id: number; savedId?: string; prompt: string; answer: string };
type QuizQuestionDraft = {
  id: number;
  type: "multiple_choice" | "true_false" | "short_answer";
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

const sections = [
  { to: "/app/flashcards", label: "Overview", end: true },
  { to: "/app/flashcards/library", label: "Flashcard library" },
  { to: "/app/flashcards/mine", label: "My flashcards" },
  { to: "/app/flashcards/quizzes", label: "Quiz library" },
  { to: "/app/flashcards/my-quizzes", label: "My quizzes" },
  { to: "/app/flashcards/saved", label: "Saved questions" },
  { to: "/app/flashcards/performance", label: "Performance" },
  { to: "/app/flashcards/advanced", label: "Advanced learning" },
  { to: "/app/group-quiz", label: "Group Quiz" },
];

const advancedFeatures: { slug: string; title: string; description: string; icon: LucideIcon; detail: string }[] = [
  { slug: "ai-flashcards", title: "AI-generated flashcards", description: "Turn a topic or course into a draft set of revision cards.", icon: Brain, detail: "Choose a course, add a topic and review generated cards before deciding what to keep." },
  { slug: "ai-practice", title: "AI practice questions", description: "Create focused practice questions with explanations.", icon: Sparkles, detail: "Select a topic, course, difficulty and question count for a guided practice set." },
  { slug: "exam-simulation", title: "Examination simulation", description: "Practise under realistic timed exam conditions.", icon: Clock3, detail: "A focused exam workspace will include instructions, a question navigator and a timer." },
  { slug: "competitions", title: "Quiz competitions", description: "Join scheduled academic challenges and compare results.", icon: Trophy, detail: "Discover upcoming competitions, eligibility details, schedules and final standings." },
  { slug: "group-challenges", title: "Group quiz challenges", description: "Invite classmates to practise together.", icon: Users, detail: "Create a shared challenge, invite classmates and follow group progress." },
  { slug: "lecturer-assessments", title: "Lecturer-created assessments", description: "A future assessment workspace for educators and students.", icon: GraduationCap, detail: "Authorized educators will be able to prepare assessments and review submissions." },
  { slug: "premium-collections", title: "Premium quiz collections", description: "Explore curated collections from academic creators.", icon: Layers3, detail: "Review collection details and access information before deciding whether to purchase." },
  { slug: "achievements", title: "Certificates and achievements", description: "Recognize real learning milestones and completed study goals.", icon: Award, detail: "A learning record will show earned milestones and certificates after achievement support exists." },
];

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-fg sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function ComingSoonBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full border border-[#f0dadd] bg-[#fff4f2] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary"><Clock3 size={12} aria-hidden="true" />Coming soon</span>;
}

function BackendNotice({ children }: { children: ReactNode }) {
  return <div role="note" className="flex items-start gap-3 rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 text-sm leading-6 text-[#6b5555]">
    <LockKeyhole size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
    <p>{children}</p>
  </div>;
}

export function FlashcardsLayout() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-[#f0dadd] bg-gradient-to-br from-[#fff4f2] via-white to-[#fff0ef] p-5 shadow-[0_12px_36px_rgba(35,24,20,0.045)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-primary/10 sm:h-72 sm:w-72" />
        <div className="relative flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm sm:flex"><Brain size={23} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#f0dadd] bg-white/80 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary shadow-sm">Study smarter</p>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-fg sm:text-3xl">Flashcards &amp; Quizzes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">Build a steady study rhythm with focused revision cards and practice questions.</p>
          </div>
        </div>
      </header>
      <nav aria-label="Flashcards and quizzes" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
        {sections.map((section) => <NavLink key={section.to} to={section.to} end={section.end} className={({ isActive }) => `min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:text-sm ${isActive ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-[#fff4f2] hover:text-primary"}`}>{section.label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}

function FeatureCard({ to, title, description, icon: Icon }: { to: string; title: string; description: string; icon: LucideIcon }) {
  return <Link to={to} className="group flex min-h-40 flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:-translate-y-0.5 hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><Icon size={19} aria-hidden="true" /></span>
    <h2 className="mt-4 font-extrabold text-fg group-hover:text-primary">{title}</h2>
    <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-primary">Explore <ArrowRight size={13} aria-hidden="true" /></span>
  </Link>;
}

export function FlashcardsHomePage() {
  const mine = useQuery({ queryKey: ["flashcards", "mine"], queryFn: () => listFlashcardCollections({ mine: true }) });
  const library = useQuery({ queryKey: ["flashcards", "library", "recent"], queryFn: () => listFlashcardCollections() });
  return (
    <div className="space-y-5">
      <BackendNotice>Flashcard collections are live. You can create private decks or publish them to the student library. Quizzes, saved quiz questions and quiz performance still need their own backend and remain previews.</BackendNotice>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FeatureCard to="/app/flashcards/library" title="Flashcard library" description="Discover collections shared by CampusConnect students." icon={Layers3} />
        <FeatureCard to="/app/flashcards/mine" title="My flashcards" description={mine.isLoading ? "Loading your collections…" : `${mine.data?.length ?? 0} collection${mine.data?.length === 1 ? "" : "s"} you created.`} icon={BookOpen} />
        <FeatureCard to="/app/flashcards/create" title="Create flashcards" description="Save a private deck or share it with other students." icon={Plus} />
        <FeatureCard to="/app/flashcards/quizzes" title="Quiz library" description="Find real course quizzes after quiz data is available." icon={CircleHelp} />
      </section>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Your next step</p><h2 className="mt-1 text-lg font-black text-fg">Start with a study draft</h2></div>
            <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-[#fff1ef] text-primary sm:flex"><Lightbulb size={20} aria-hidden="true" /></span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Add terms and explanations, save your collection, then review cards and record whether you know them.</p>
          <Link to="/app/flashcards/create" className="btn-primary mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={16} aria-hidden="true" />Prepare flashcards</Link>
        </div>
        <div className="rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-5 sm:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Learning tools</p>
          <h2 className="mt-1 text-lg font-black text-fg">More ways to practise</h2>
          <p className="mt-2 text-sm leading-6 text-muted">AI assistance, timed exams, competitions and achievements are visual previews only.</p>
          <Link to="/app/flashcards/advanced" className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-bold text-primary hover:underline">View future features <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <FeatureCard to="/app/flashcards/create-quiz" title="Create a quiz draft" description="Compose questions and preview the quiz without saving or submitting it." icon={ListChecks} />
        <FeatureCard to="/app/flashcards/performance" title="Study performance" description="Real scores and learning progress will appear after backend support is added." icon={Target} />
      </section>
      {mine.isError && <p role="alert" className="err">Could not load your flashcard collections: {(mine.error as Error).message}</p>}
      {library.data?.length ? <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-fg">Recently shared</h2><Link to="/app/flashcards/library" className="text-sm font-bold text-primary hover:underline">Browse library</Link></div>
        <ul className="grid gap-3 sm:grid-cols-2">{library.data.slice(0, 4).map((collection) => <li key={collection.id}><FlashcardCollectionCard collection={collection} /></li>)}</ul>
      </section> : null}
    </div>
  );
}

function EmptyLibrary({ title, description }: { title: string; description: string }) {
  return <section className="rounded-2xl border border-dashed border-[#e6cdcf] bg-white px-5 py-10 text-center">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><BookOpen size={22} aria-hidden="true" /></span>
    <h2 className="mt-3 font-extrabold text-fg">{title}</h2>
    <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted">{description}</p>
  </section>;
}

function FlashcardCollectionCard({ collection }: { collection: FlashcardCollection }) {
  const cardCount = collection.cards.length;
  return <Link to={`/app/flashcards/collections/${collection.id}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
    <div className="flex items-start justify-between gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><Layers3 size={18} aria-hidden="true" /></span><span className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-[10px] font-bold text-primary">{collection.is_public ? "Shared" : "Private"}</span></div>
    <h2 className="mt-4 font-extrabold leading-6 text-fg group-hover:text-primary">{collection.title}</h2>
    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{collection.description || "No description added."}</p>
    <p className="mt-3 text-xs font-semibold text-muted">{collection.course ? `${collection.course.code} — ${collection.course.title}` : "No course selected"}</p>
    <span className="mt-auto inline-flex items-center justify-between gap-2 border-t border-line pt-3 text-xs font-extrabold text-primary"><span>{cardCount} card{cardCount === 1 ? "" : "s"}</span>Open collection <ArrowRight size={13} /></span>
  </Link>;
}

export function FlashcardLibraryPage() {
  const [search, setSearch] = useState("");
  const collections = useQuery({ queryKey: ["flashcards", "library", search], queryFn: () => listFlashcardCollections({ search }) });
  return <div className="space-y-5">
    <PageHeading eyebrow="Discover" title="Flashcard library" description="Browse student-published collections and study real course material." action={<Link to="/app/flashcards/create" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={15} />Create collection</Link>} />
    <label className="block rounded-2xl border border-line bg-white p-4"><span className="label">Search collections and courses</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, course code or description" /></label>
    {collections.isLoading ? <LoadingState label="Loading flashcard collections" variant="panel" />
      : collections.isError ? <p role="alert" className="err">Could not load the flashcard library: {(collections.error as Error).message}</p>
        : collections.data?.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{collections.data.map((collection) => <li key={collection.id}><FlashcardCollectionCard collection={collection} /></li>)}</ul>
          : <EmptyLibrary title="No shared collections found" description="Publish a collection or try another search. Private collections are visible only to their owners." />}
  </div>;
}

export function MyFlashcardsPage() {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<FlashcardCollection | null>(null);
  const collections = useQuery({ queryKey: ["flashcards", "mine"], queryFn: () => listFlashcardCollections({ mine: true }) });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFlashcardCollection(id),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
  return <div className="space-y-5">
    <PageHeading eyebrow="Personal study" title="My flashcards" description="Edit, study, publish or delete the collections you created." action={<Link to="/app/flashcards/create" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={15} />Create collection</Link>} />
    {collections.isLoading ? <LoadingState label="Loading your flashcards" variant="panel" />
      : collections.isError ? <p role="alert" className="err">Could not load your collections: {(collections.error as Error).message}</p>
        : collections.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">{collections.data.map((collection) => <li key={collection.id} className="space-y-2">
          <FlashcardCollectionCard collection={collection} />
          <div className="flex flex-wrap gap-2">
            <Link to={`/app/flashcards/create?collectionId=${collection.id}`} className="btn min-h-9 rounded-xl px-3 text-xs font-bold">Edit</Link>
            <button type="button" className="btn min-h-9 rounded-xl px-3 text-xs font-bold text-danger" onClick={() => setDeleting(collection)}>Delete</button>
          </div>
        </li>)}</ul> : <EmptyLibrary title="No collections yet" description="Create your first flashcard collection. It will be private unless you choose to publish it." />}
    {remove.isError && <p role="alert" className="err">Could not delete the collection: {(remove.error as Error).message}</p>}
    {deleting && <div role="alertdialog" aria-modal="true" aria-labelledby="delete-flashcards-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="delete-flashcards-title" className="text-lg font-black text-fg">Delete this collection?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">“{deleting.title}” and its cards will be permanently deleted.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="btn" onClick={() => setDeleting(null)} disabled={remove.isPending}>Cancel</button><button type="button" className="btn-danger" onClick={() => remove.mutate(deleting.id)} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete collection"}</button></div>
      </section>
    </div>}
  </div>;
}

function CoursePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const courses = useQuery({ queryKey: ["flashcards", "academic-courses"], queryFn: () => listCourses() });
  const courseList = courses.data ?? [];
  return <label className="block">
    <span className="label">Course <span className="font-normal text-muted">(optional)</span></span>
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)} disabled={courses.isLoading || courses.isError}>
      <option value="">{courses.isLoading ? "Loading real courses…" : courses.isError ? "Course catalog unavailable" : "Choose a course"}</option>
      {courseList.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}
    </select>
    {courses.isError && <span role="alert" className="mt-1 block text-xs text-danger">Could not load the course catalog. Try again later.</span>}
  </label>;
}

function StudyPreview({ cards, courseName, onClose }: { cards: FlashcardDraft[]; courseName: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  if (!card) return null;
  const move = (delta: number) => {
    setIndex((current) => (current + delta + cards.length) % cards.length);
    setFlipped(false);
  };
  return <section aria-label="Flashcard study preview" className="rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Private preview</p><h2 className="mt-1 font-black text-fg">{courseName || "Flashcard draft"}</h2></div>
      <button type="button" className="btn min-h-9 rounded-xl px-3 text-xs font-bold" onClick={onClose}>Close preview</button>
    </div>
    <p className="mt-4 text-center text-xs font-bold text-muted">Card {index + 1} of {cards.length}</p>
    <button type="button" aria-label={flipped ? "Show prompt" : "Reveal answer"} onClick={() => setFlipped((value) => !value)} className="mt-2 flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border border-[#f0dadd] bg-white p-6 text-center shadow-sm transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{flipped ? "Answer" : "Prompt"} · tap to flip</span>
      <span className="mt-4 whitespace-pre-wrap text-lg font-bold leading-7 text-fg sm:text-xl">{flipped ? card.answer || "Add an answer to preview this card." : card.prompt || "Add a prompt to preview this card."}</span>
    </button>
    <div className="mt-4 flex items-center justify-center gap-3">
      <button type="button" aria-label="Previous card" className="btn flex h-10 w-10 items-center justify-center rounded-xl" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
      <button type="button" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold" onClick={() => setFlipped((value) => !value)}><RotateCcw size={15} />Flip card</button>
      <button type="button" aria-label="Next card" className="btn flex h-10 w-10 items-center justify-center rounded-xl" onClick={() => move(1)}><ChevronRight size={18} /></button>
    </div>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <button type="button" disabled className="btn min-h-9 rounded-xl px-3 text-xs font-bold">I know this</button>
      <button type="button" disabled className="btn min-h-9 rounded-xl px-3 text-xs font-bold">Need more practice</button>
      <button type="button" disabled className="btn min-h-9 rounded-xl px-3 text-xs font-bold">Review again</button>
    </div>
    <p className="mt-3 text-center text-xs text-muted">Study progress is not saved or tracked.</p>
  </section>;
}

export function CreateFlashcardsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const collectionId = searchParams.get("collectionId") ?? undefined;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [cards, setCards] = useState<FlashcardDraft[]>([{ id: 1, prompt: "", answer: "" }]);
  const [preview, setPreview] = useState(false);
  const [nextId, setNextId] = useState(2);
  const collection = useQuery({
    queryKey: ["flashcards", "collection", collectionId],
    queryFn: () => getFlashcardCollection(collectionId!),
    enabled: !!collectionId,
  });
  const selectedCourse = useQuery({ queryKey: ["flashcards", "academic-courses"], queryFn: () => listCourses() });
  const courseName = selectedCourse.data?.find((course) => course.id === courseId);
  const filled = cards.filter((card) => card.prompt.trim() && card.answer.trim()).length;
  const save = useMutation({
    mutationFn: () => saveFlashcardCollection({
      collectionId,
      courseId: courseId || null,
      title,
      description,
      isPublic,
      cards: cards.map(({ prompt, answer, savedId }) => ({ id: savedId, prompt, answer })),
    }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      navigate(`/app/flashcards/collections/${id}`);
    },
  });
  useEffect(() => {
    if (!collection.data) return;
    setTitle(collection.data.title);
    setDescription(collection.data.description);
    setCourseId(collection.data.course_id ?? "");
    setIsPublic(collection.data.is_public);
    const savedCards = collection.data.cards.map((card, index) => ({ id: index + 1, savedId: card.id, prompt: card.prompt, answer: card.answer }));
    setCards(savedCards.length ? savedCards : [{ id: 1, prompt: "", answer: "" }]);
    setNextId(savedCards.length + 1);
  }, [collection.data]);

  const changeCard = (id: number, field: "prompt" | "answer", value: string) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, [field]: value } : card));
  };
  const validation = validateFlashcardCollection({
    collectionId,
    title,
    description,
    courseId: courseId || null,
    isPublic,
    cards: cards.map(({ prompt, answer }) => ({ prompt, answer })),
  });
  if (collectionId && collection.isLoading) return <LoadingState label="Loading your flashcard collection" variant="panel" />;
  if (collectionId && (collection.isError || !collection.data)) {
    return <p role="alert" className="err">Could not load this collection. It may not exist, or you may not be its owner.</p>;
  }

  return <div className="space-y-5">
    <PageHeading eyebrow={collectionId ? "Edit collection" : "Build a collection"} title={collectionId ? "Edit flashcards" : "Create flashcards"} description="Save a private collection or share it in the flashcard library. You can edit or delete your collections later." />
    <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={(event: FormEvent) => { event.preventDefault(); if (!validation) save.mutate(); }}>
      <div className="space-y-4">
        <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
          <h2 className="font-extrabold text-fg">Collection details</h2>
          <label className="block"><span className="label">Collection title</span><input className="input" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Key terms for revision" /></label>
          <CoursePicker value={courseId} onChange={setCourseId} />
          <label className="block"><span className="label">Description <span className="font-normal text-muted">(optional)</span></span><textarea className="input" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are these cards for?" /></label>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 accent-primary" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            <span><span className="block text-sm font-bold text-fg">Share with the flashcard library</span><span className="mt-0.5 block text-xs leading-5 text-muted">Other signed-in students can view and study this collection. You can switch it back to private by editing it.</span></span>
          </label>
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-fg">Cards <span className="text-muted">({cards.length})</span></h2><button type="button" className="btn inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold" onClick={() => { setCards((current) => [...current, { id: nextId, prompt: "", answer: "" }]); setNextId((id) => id + 1); }}><Plus size={14} />Add card</button></div>
          {cards.map((card, index) => <article key={card.id} className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)]">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-fg">Card {index + 1}</h3><button type="button" aria-label={`Remove card ${index + 1}`} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-40" disabled={cards.length === 1} onClick={() => setCards((current) => current.filter((item) => item.id !== card.id))}><Trash2 size={15} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="label">Question or term</span><textarea className="input" rows={3} maxLength={2000} value={card.prompt} onChange={(event) => changeCard(card.id, "prompt", event.target.value)} placeholder="Enter a term or question" /></label>
              <label className="block"><span className="label">Answer or explanation</span><textarea className="input" rows={3} maxLength={4000} value={card.answer} onChange={(event) => changeCard(card.id, "answer", event.target.value)} placeholder="Enter the answer or explanation" /></label>
            </div>
          </article>)}
        </section>
        {preview && <StudyPreview cards={cards} courseName={courseName ? `${courseName.code} — ${courseName.title}` : title} onClose={() => setPreview(false)} />}
      </div>
      <aside className="h-fit space-y-3 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5 xl:sticky xl:top-24">
        <h2 className="font-extrabold text-fg">Collection actions</h2>
        <p className="text-sm leading-5 text-muted">{filled} of {cards.length} cards have both a prompt and an answer.</p>
        <button type="button" className="btn-primary inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 font-bold" disabled={!filled} onClick={() => setPreview(true)}><RotateCcw size={15} />Preview study mode</button>
        <button type="submit" className="btn-primary min-h-10 w-full rounded-xl px-4 font-bold" disabled={save.isPending || !!validation}>{save.isPending ? "Saving…" : collectionId ? "Save changes" : "Save collection"}</button>
        {validation && <p className="text-xs leading-5 text-muted">{validation}</p>}
        {save.isError && <p role="alert" className="err">{(save.error as Error).message}</p>}
        <Link to="/app/flashcards/mine" className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary hover:underline">My flashcards <ArrowRight size={14} /></Link>
      </aside>
    </form>
  </div>;
}

export function FlashcardCollectionPage() {
  const { collectionId = "" } = useParams();
  const queryClient = useQueryClient();
  const [studyMode, setStudyMode] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const collection = useQuery({
    queryKey: ["flashcards", "collection", collectionId],
    queryFn: () => getFlashcardCollection(collectionId),
    enabled: !!collectionId,
  });
  const cards = collection.data?.cards ?? [];
  const progress = useQuery({
    queryKey: ["flashcards", "progress", collectionId],
    queryFn: () => listFlashcardProgress(cards.map((card) => card.id)),
    enabled: studyMode && cards.length > 0,
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FlashcardStatus }) => recordFlashcardReview(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["flashcards", "progress", collectionId] });
      setIndex((current) => Math.min(current + 1, cards.length - 1));
      setFlipped(false);
    },
  });
  const current = cards[index];

  if (collection.isLoading) return <LoadingState label="Loading flashcard collection" variant="panel" />;
  if (collection.isError) return <p role="alert" className="err">Could not load this flashcard collection: {(collection.error as Error).message}</p>;
  if (!collection.data) return <EmptyLibrary title="Collection not found" description="This collection may have been deleted, made private by its owner, or is no longer available." />;

  const progressValues = Object.values(progress.data ?? {});
  const knownCount = progressValues.filter((item) => item.status === "known").length;
  return <div className="space-y-5">
    <Link to="/app/flashcards" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />Flashcards &amp; quizzes</Link>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight text-fg sm:text-3xl">{collection.data.title}</h1><span className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-[10px] font-bold text-primary">{collection.data.is_public ? "Shared" : "Private"}</span></div>
          <p className="mt-2 text-sm leading-6 text-muted">{collection.data.description || "No description added."}</p>
          {collection.data.course && <p className="mt-3 text-xs font-bold text-primary">{collection.data.course.code} — {collection.data.course.title}</p>}
        </div>
        <button type="button" className="btn-primary inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 font-bold" disabled={!cards.length} onClick={() => { setStudyMode((value) => !value); setIndex(0); setFlipped(false); }}>{studyMode ? "Exit study mode" : "Study collection"}</button>
      </div>
    </section>
    {studyMode ? current ? <section aria-label="Flashcard study mode" className="rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Study mode</p><p className="mt-1 text-sm font-bold text-fg">Known {knownCount} of {cards.length}</p></div><p className="text-xs font-bold text-muted">Card {index + 1} of {cards.length}</p></div>
      <button type="button" aria-label={flipped ? "Show prompt" : "Reveal answer"} onClick={() => setFlipped((value) => !value)} className="mt-4 flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border border-[#f0dadd] bg-white p-6 text-center shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{flipped ? "Answer" : "Prompt"} · tap to flip</span>
        <span className="mt-4 whitespace-pre-wrap text-lg font-bold leading-7 text-fg sm:text-xl">{flipped ? current.answer : current.prompt}</span>
      </button>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn min-h-10 rounded-xl px-3 text-xs font-bold" disabled={index === 0} onClick={() => { setIndex((value) => Math.max(0, value - 1)); setFlipped(false); }}><ChevronLeft size={14} className="mr-1 inline" />Previous</button>
        {(["known", "needs_practice", "review_again"] as const).map((status) => <button key={status} type="button" className="btn min-h-10 rounded-xl px-3 text-xs font-bold" disabled={review.isPending} onClick={() => review.mutate({ id: current.id, status })}>{status === "known" ? "I know this" : status === "needs_practice" ? "Need more practice" : "Review again"}</button>)}
        <button type="button" className="btn min-h-10 rounded-xl px-3 text-xs font-bold" disabled={index >= cards.length - 1} onClick={() => { setIndex((value) => Math.min(cards.length - 1, value + 1)); setFlipped(false); }}>Next<ChevronRight size={14} className="ml-1 inline" /></button>
      </div>
      {progress.isError && <p role="alert" className="err">Could not load study progress: {(progress.error as Error).message}</p>}
      {review.isError && <p role="alert" className="err">Could not save your review: {(review.error as Error).message}</p>}
      <p className="mt-3 text-center text-xs text-muted">Your review status is private to your account.</p>
    </section> : <EmptyLibrary title="No cards in this collection" description="The owner has not added any cards yet." /> : cards.length ? <ol className="space-y-2">{cards.map((card, cardIndex) => <li key={card.id} className="rounded-xl border border-line bg-white p-4"><p className="text-xs font-bold text-primary">Card {cardIndex + 1}</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-fg">{card.prompt}</p></li>)}</ol> : <EmptyLibrary title="No cards in this collection" description="The owner has not added any cards yet." />}
  </div>;
}

function EmptyQuizPage({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="space-y-5">
    <PageHeading eyebrow="Practice" title={title} description={description} action={action} />
    <BackendNotice>There are no quiz, attempt, answer-key, or saved-question APIs in the current project. No sample quiz records or results are displayed.</BackendNotice>
    <EmptyLibrary title="No quiz data available" description="This area will show real quiz information after its backend is implemented." />
  </div>;
}

export function QuizLibraryPage() {
  return <div className="space-y-5">
    <PageHeading eyebrow="Discover" title="Quiz library" description="Search course quizzes and practice material once real quiz records are available." action={<Link to="/app/flashcards/create-quiz" className="btn inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={15} />Create draft</Link>} />
    <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-3">
      <label><span className="label">Search quizzes</span><input className="input" disabled placeholder="Quiz title or course" /></label>
      <label><span className="label">Institution</span><select className="input" disabled><option>All institutions</option></select></label>
      <label><span className="label">Department</span><select className="input" disabled><option>All departments</option></select></label>
    </div>
    <EmptyLibrary title="No quizzes available" description="Quiz discovery and starting a real quiz are unavailable until quiz data and submission support exist." />
  </div>;
}

export function MyQuizzesPage() {
  return <EmptyQuizPage title="My quizzes" description="Manage your quiz drafts and published quizzes when the quiz backend supports them." action={<Link to="/app/flashcards/create-quiz" className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 font-bold"><Plus size={15} />Create quiz draft</Link>} />;
}

function newQuizQuestion(id: number): QuizQuestionDraft {
  return { id, type: "multiple_choice", prompt: "", options: ["", "", "", ""], answer: "", explanation: "" };
}

function QuizDraftPreview({ questions, title, onClose }: { questions: QuizQuestionDraft[]; title: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const question = questions[index];
  if (!question) return null;
  return <section aria-label="Quiz preview" className="rounded-2xl border border-[#f0dadd] bg-[#fff9f8] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Preview only</p><h2 className="mt-1 font-black text-fg">{title || "Untitled quiz draft"}</h2></div><button type="button" className="btn min-h-9 rounded-xl px-3 text-xs font-bold" onClick={onClose}>Close preview</button></div>
    <div className="mt-4 flex items-center justify-between text-xs font-bold text-muted"><span>Question {index + 1} of {questions.length}</span><span>{Math.round(((index + 1) / questions.length) * 100)}% viewed</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f3e7e8]"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
    <article className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <p className="font-bold leading-6 text-fg">{question.prompt || "Add a question prompt to preview it."}</p>
      {question.type === "multiple_choice" ? <fieldset className="mt-4 space-y-2"><legend className="sr-only">Choose an answer</legend>{question.options.filter(Boolean).length ? question.options.filter(Boolean).map((option, optionIndex) => <label key={`${question.id}-${optionIndex}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 text-sm text-fg hover:bg-[#fff9f8]"><input type="radio" name={`preview-${question.id}`} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />{option}</label>) : <p className="text-sm text-muted">Add answer options in the draft form.</p>}</fieldset>
        : <label className="mt-4 block"><span className="label">{question.type === "true_false" ? "Select an answer" : "Your answer"}</span>{question.type === "true_false" ? <select className="input" value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}><option value="">Choose</option><option>True</option><option>False</option></select> : <textarea className="input" rows={2} value={answers[question.id] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Type a preview answer" />}</label>}
    </article>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <button type="button" className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 font-bold" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}><ChevronLeft size={15} />Previous</button>
      {index < questions.length - 1
        ? <button type="button" className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 font-bold" onClick={() => setIndex((current) => current + 1)}>Next<ChevronRight size={15} /></button>
        : <button type="button" className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 font-bold" onClick={() => setSubmitted(true)}><Check size={15} />Finish preview</button>}
    </div>
    {submitted && <p role="status" className="mt-3 rounded-xl border border-[#f0dadd] bg-white p-3 text-sm leading-5 text-muted">Preview finished. Answers were not submitted, graded or saved.</p>}
  </section>;
}

export function CreateQuizPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([newQuizQuestion(1)]);
  const [nextId, setNextId] = useState(2);
  const [preview, setPreview] = useState(false);
  const courses = useQuery({ queryKey: ["flashcards", "academic-courses"], queryFn: () => listCourses() });
  const selectedCourse = courses.data?.find((course) => course.id === courseId);
  const updateQuestion = (id: number, patch: Partial<QuizQuestionDraft>) => setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question));
  const valid = title.trim().length >= 3 && questions.every((question) => question.prompt.trim().length > 0 && (question.type !== "multiple_choice" || question.options.filter((option) => option.trim()).length >= 2));
  const addQuestion = () => { setQuestions((current) => [...current, newQuizQuestion(nextId)]); setNextId((id) => id + 1); };
  const updateOption = (question: QuizQuestionDraft, optionIndex: number, value: string) => updateQuestion(question.id, { options: question.options.map((option, index) => index === optionIndex ? value : option) });

  return <div className="space-y-5">
    <PageHeading eyebrow="Draft builder" title="Create a quiz" description="Prepare questions and walk through a local preview. The quiz cannot be saved, published or submitted." />
    <BackendNotice>This flashcard quiz builder is a local draft only; it cannot save or publish quizzes. To publish a live quiz for a group, use <Link className="font-bold text-primary underline" to="/app/group-quiz">Group Quiz</Link>. Correct answers and explanations on this page remain temporary.</BackendNotice>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <article className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
          <h2 className="font-extrabold text-fg">Quiz details</h2>
          <label className="block"><span className="label">Quiz title</span><input className="input" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter a clear title" /></label>
          <CoursePicker value={courseId} onChange={setCourseId} />
          <label className="block"><span className="label">Instructions or description</span><textarea className="input" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what students should know" /></label>
        </article>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold text-fg">Questions <span className="text-muted">({questions.length})</span></h2><button type="button" className="btn inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold" onClick={addQuestion}><Plus size={14} />Add question</button></div>
        {questions.map((question, index) => <article key={question.id} className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-extrabold text-fg">Question {index + 1}</h3><button type="button" aria-label={`Remove question ${index + 1}`} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-40" disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}><Trash2 size={15} /></button></div>
          <label className="block"><span className="label">Question type</span><select className="input" value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value as QuizQuestionDraft["type"], options: event.target.value === "true_false" ? ["True", "False"] : question.options })}><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="short_answer">Short answer</option></select></label>
          <label className="block"><span className="label">Question text</span><textarea className="input" rows={2} maxLength={1500} value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} placeholder="Write the question" /></label>
          {question.type === "multiple_choice" && <div className="grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="block"><span className="label">Option {String.fromCharCode(65 + optionIndex)}</span><input className="input" maxLength={300} value={option} onChange={(event) => updateOption(question, optionIndex, event.target.value)} placeholder={`Answer option ${optionIndex + 1}`} /></label>)}</div>}
          <label className="block"><span className="label">Correct answer <span className="font-normal text-muted">(draft only)</span></span>{question.type === "multiple_choice" ? <select className="input" value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}><option value="">Choose the correct option</option>{question.options.filter(Boolean).map((option, optionIndex) => <option key={optionIndex} value={option}>{option}</option>)}</select> : <input className="input" maxLength={300} value={question.answer} onChange={(event) => updateQuestion(question.id, { answer: event.target.value })} placeholder={question.type === "true_false" ? "True or False" : "Expected answer"} />}</label>
          <label className="block"><span className="label">Explanation <span className="font-normal text-muted">(optional)</span></span><textarea className="input" rows={2} maxLength={1000} value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} placeholder="Explain the answer" /></label>
        </article>)}
        {preview && <QuizDraftPreview questions={questions} title={title} onClose={() => setPreview(false)} />}
      </div>
      <aside className="h-fit space-y-3 rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-5 xl:sticky xl:top-24">
        <h2 className="font-extrabold text-fg">Draft actions</h2>
        <p className="text-sm leading-5 text-muted">{questions.length} question{questions.length === 1 ? "" : "s"} · {selectedCourse ? `${selectedCourse.code} — ${selectedCourse.title}` : "No course selected"}</p>
        <button type="button" className="btn-primary min-h-10 w-full rounded-xl px-4 font-bold" disabled={!valid} onClick={() => setPreview(true)}>Preview quiz</button>
        <button type="button" className="btn min-h-10 w-full cursor-not-allowed rounded-xl px-4 font-bold opacity-50" disabled>Save quiz</button>
        <button type="button" className="btn min-h-10 w-full cursor-not-allowed rounded-xl px-4 font-bold opacity-50" disabled>Publish quiz</button>
        <p className="text-xs leading-5 text-muted">Saving, publishing, attempt records and grading need backend support.</p>
      </aside>
    </section>
  </div>;
}

export function SavedQuestionsPage() {
  return <EmptyQuizPage title="Saved questions" description="Review questions you saved for later revision when a compatible saved-question backend exists." />;
}

export function QuizResultsPage() {
  return <EmptyQuizPage title="Quiz results" description="Real attempts and question-by-question results will appear here after quiz submissions are supported." />;
}

export function PerformancePage() {
  return <div className="space-y-5">
    <PageHeading eyebrow="Your learning" title="Performance" description="Track real quiz outcomes and revision progress after learning records are available." />
    <BackendNotice>No quiz attempts or flashcard study sessions are stored. Scores, averages, streaks and course progress are not shown because they are unsupported.</BackendNotice>
    <EmptyLibrary title="No performance data" description="Once the backend supports attempts and study activity, this page can show real progress without inventing statistics." />
  </div>;
}

export function AdvancedLearningPage() {
  return <div className="space-y-5">
    <PageHeading eyebrow="Future learning tools" title="Advanced learning" description="Explore the academic tools planned for a future CampusConnect release." />
    <BackendNotice>These previews are not connected to AI, payments, timed assessments or competition services. All actions remain unavailable.</BackendNotice>
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{advancedFeatures.map((feature) => <li key={feature.slug}>
      <Link to={feature.slug === "group-challenges" ? "/app/group-quiz" : `/app/flashcards/advanced/${feature.slug}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.035)] transition hover:border-[#edc9cd] hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)] sm:p-5">
        <div className="flex items-start justify-between gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1ef] text-primary"><feature.icon size={19} aria-hidden="true" /></span>{feature.slug === "group-challenges" ? <span className="rounded-full bg-[#fff4f2] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">Live</span> : <ComingSoonBadge />}</div>
        <h2 className="mt-4 font-extrabold text-fg group-hover:text-primary">{feature.title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted">{feature.description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-primary">{feature.slug === "group-challenges" ? "Open Group Quiz" : "View preview"} <ArrowRight size={13} /></span>
      </Link>
    </li>)}</ul>
  </div>;
}

export function AdvancedLearningDetailPage() {
  const { featureId = "" } = useParams();
  const feature = advancedFeatures.find((item) => item.slug === featureId);
  if (featureId === "group-challenges") return <Navigate to="/app/group-quiz" replace />;
  if (!feature) return <EmptyLibrary title="Preview unavailable" description="This planned feature has no preview page." />;
  const Icon = feature.icon;
  return <div className="space-y-5">
    <Link to="/app/flashcards/advanced" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted hover:text-primary"><ArrowLeft size={15} />All advanced features</Link>
    <section className="rounded-2xl border border-[#f0dadd] bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.035)] sm:p-7">
      <div className="flex flex-wrap items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1ef] text-primary"><Icon size={22} aria-hidden="true" /></span><ComingSoonBadge /></div>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Coming soon</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-fg sm:text-3xl">{feature.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{feature.detail}</p>
      <div className="mt-6 rounded-xl border border-line bg-[#fbf8f8] p-4">
        <h2 className="font-extrabold text-fg">Planned experience</h2>
        <p className="mt-1 text-sm leading-6 text-muted">This screen is a design preview only. It does not create records, call an AI provider, charge a fee or claim an achievement.</p>
        <button type="button" disabled className="btn mt-4 min-h-10 cursor-not-allowed rounded-xl px-4 font-bold opacity-55">Not available yet</button>
      </div>
    </section>
  </div>;
}
