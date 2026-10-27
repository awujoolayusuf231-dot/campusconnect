import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, FileText, Flag, HeartHandshake, Mail, MessageCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { PublicLayout } from "./PublicLayout";
import { usePublicSettings } from "@/lib/publicSettings";

const Draft = () => (
  <aside role="note" className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:p-5">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 font-bold text-amber-800" aria-hidden="true">!</span>
    <p><strong className="font-extrabold">Draft for review.</strong> This page describes how the platform actually works today. Have it reviewed by a qualified Nigerian lawyer before public launch. It is not legal advice and does not claim compliance with any law.</p>
  </aside>
);

type LegalSectionLink = { id: string; title: string };
function LegalPage({ title, eyebrow, intro, icon: Icon, sections, children }: {
  title: string;
  eyebrow: string;
  intro: string;
  icon: typeof BookOpen;
  sections: LegalSectionLink[];
  children: ReactNode;
}) {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#971b27] via-[#bd2632] to-[#d9444d] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
          <div className="relative flex max-w-4xl items-start gap-4 sm:gap-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 sm:h-14 sm:w-14">
              <Icon size={25} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-white/75">{eyebrow}</p>
              <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl lg:text-5xl">{title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85 sm:text-base sm:leading-7">{intro}</p>
            </div>
          </div>
        </header>

        <Draft />

        <div className="mt-7 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside className="min-w-0 rounded-2xl border border-line bg-[#fffafa] p-4 lg:sticky lg:top-24">
            <p className="px-2 pb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">On this page</p>
            <nav aria-label={`${title} sections`} className="flex min-w-0 gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {sections.map(({ id, title: sectionTitle }) => (
                <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:bg-white hover:text-primary lg:whitespace-normal">
                  {sectionTitle}
                </a>
              ))}
            </nav>
            <div className="mt-4 hidden border-t border-line pt-3 lg:block">
              <p className="px-2 pb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">Related</p>
              <Link to="/community-guidelines" className="block rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white hover:text-primary">Community guidelines</Link>
              <Link to="/privacy" className="block rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white hover:text-primary">Privacy</Link>
              <Link to="/terms" className="block rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white hover:text-primary">Terms</Link>
            </div>
          </aside>
          <article className="min-w-0 rounded-2xl border border-line bg-white px-5 py-2 shadow-card sm:px-8">
            {children}
            <div className="border-t border-line py-6 text-sm text-muted">
              Questions? Visit <Link to="/contact" className="font-semibold text-primary underline underline-offset-2">support</Link>.
            </div>
          </article>
        </div>
      </div>
    </PublicLayout>
  );
}

function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-line py-6 last:border-b-0 sm:py-7">
      <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted sm:text-[15px]">{children}</div>
    </section>
  );
}

const policyListClass = "space-y-2.5 pl-5 marker:text-primary";

export function FeaturesPage() {
  const items: [string, string][] = [
    ["Student feed", "Share updates and up to four photos, like and comment, and follow other students."],
    ["Discover", "Find students by name, institution, department, level or interest, respecting each person’s privacy settings."],
    ["Communities", "Join or start groups around your institution, course, interests and campus activities, each with its own moderators."],
    ["Private messages", "One-to-one chats that only the two people in them can read."],
    ["Opportunities", "Browse internships, scholarships, training and competitions curated by our team, with clear links to the official external pages."],
    ["Campus celebrations", "Add your whiteshirt.fun celebration-board link to your profile. This is a link only; the two services do not share accounts or data."],
    ["Safety tools", "Report, block, control who sees your profile, and request deletion of your account."],
  ];
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">What you can do</h1><ul className="space-y-3">{items.map(([t, d]) => <li key={t} className="card"><h2 className="font-medium">{t}</h2><p className="text-sm text-muted">{d}</p></li>)}</ul><p className="mt-6"><Link to="/register" className="btn-primary">Create your account</Link></p></PublicLayout>;
}
export function AboutPage() {
  const registrationOpen = usePublicSettings().data?.registration_open !== false;
  const benefits = [
    { icon: Users, title: "Meet beyond your lecture hall", text: "Discover students by interests, course, level, or institution—and start finding people with something in common." },
    { icon: MessageCircle, title: "Keep campus conversations going", text: "Share updates, join discussions, and message one-to-one when you want a more direct conversation." },
    { icon: BookOpen, title: "Find a community that feels like yours", text: "Explore or create groups around study, shared interests, and the everyday things that bring students together." },
    { icon: Compass, title: "Explore what could come next", text: "Browse opportunities such as internships, scholarships, training, and competitions in one student-focused place." },
  ];
  const principles = [
    { icon: HeartHandshake, title: "Belonging comes first", text: "Campus life is more than lectures. We make room for the connections, conversations, and interests that happen around them." },
    { icon: ShieldCheck, title: "Your choices matter", text: "Profile visibility settings and tools to report or block help you shape your experience and respond to unwanted interactions." },
    { icon: Sparkles, title: "Built for real student life", text: "CampusConnect is designed around the mix of people, communities, ideas, and opportunities students look for." },
  ];
  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#971b27] via-[#bd2632] to-[#d9444d] px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
          <div className="pointer-events-none absolute -bottom-48 right-1/4 h-72 w-72 rounded-full border-[42px] border-white/[0.06]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> About CampusConnect
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              Campus is more than a place you study.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              It’s the people you meet, the communities you find, the conversations you remember, and the opportunities that help you imagine what’s next. CampusConnect brings those parts of student life closer together.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {registrationOpen && <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-primary transition hover:bg-[#fff1f1]">Join the community <ArrowRight size={17} aria-hidden="true" /></Link>}
              <Link to="/features" className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/15">Explore what you can do</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Why we’re here</p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">Make campus feel a little more connected.</h2>
          </div>
          <div className="space-y-4 text-base leading-7 text-muted">
            <p>Finding your people, keeping up with campus life, and hearing about useful opportunities can happen across many different places. CampusConnect is a student-focused space to bring those everyday connections closer.</p>
            <p>It’s for students in Nigerian universities, polytechnics, and colleges of education who want to share what’s happening, meet people with shared interests, take part in communities, and discover new possibilities.</p>
          </div>
        </section>

        <section className="rounded-[26px] border border-line bg-[#fffafa] px-5 py-9 sm:px-8 sm:py-12">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">A useful place to start</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">What CampusConnect brings together</h2>
            <p className="mt-3 leading-7 text-muted">The best parts of a student network are the ways it helps you connect, participate, and find your next step.</p>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {benefits.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="group rounded-2xl border border-line bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition group-hover:bg-primary group-hover:text-white"><Icon size={20} aria-hidden="true" /></span>
                  <span className="text-xs font-bold tracking-wide text-primary">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-extrabold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">What guides us</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">A student space, shaped with care.</h2>
            <p className="mt-3 leading-7 text-muted">A good campus community should feel useful, welcoming, and honest about what it is.</p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3 sm:gap-4">
            {principles.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><Icon size={20} aria-hidden="true" /></span>
                <h3 className="mt-4 font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[26px] border border-primary/10 bg-gradient-to-br from-[#fff7f7] to-white p-5 sm:p-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-primary">Join thoughtfully</p><h2 className="mt-2 text-xl font-black tracking-tight">A few things worth knowing</h2></div>
            <p className="text-sm leading-6 text-muted">Institution details are chosen by students and are not verified. CampusConnect does not claim to verify student identity or affiliation.</p>
            <p className="text-sm leading-6 text-muted">Use the available privacy controls and safety tools. Read our <Link to="/community-guidelines" className="font-semibold text-primary underline underline-offset-2">community guidelines</Link> before joining in. CampusConnect is independent from whiteshirt.fun; they do not share accounts or databases. You can add a link to your public whiteshirt.fun board if you choose.</p>
          </div>
        </section>

        <section className="relative mt-8 overflow-hidden rounded-[26px] bg-[#a91f2a] px-6 py-9 text-white sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-12 -top-28 h-72 w-72 rounded-full border-[44px] border-white/[0.07]" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/75">Your campus story starts here</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Find your people. Find your place.</h2>
              <p className="mt-2 text-sm leading-6 text-white/80">Come see what a more connected campus experience can look like.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {registrationOpen && <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-primary transition hover:bg-[#fff1f1]">Create account <ArrowRight size={16} aria-hidden="true" /></Link>}
              <Link to="/features" className="inline-flex items-center justify-center rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">See the features</Link>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
export function GuidelinesPage() {
  const sections = [
    { id: "respect", title: "Start with respect" },
    { id: "not-allowed", title: "What’s not allowed" },
    { id: "moderation", title: "How moderation works" },
    { id: "reporting", title: "Reporting and blocking" },
  ];
  return (
    <LegalPage title="Community guidelines" eyebrow="Our shared standards" icon={BookOpen} sections={sections} intro="A welcoming campus community takes care from everyone. These guidelines apply to posts, comments, communities, messages, profiles, and opportunities.">
      <LegalSection id="respect" title="Start with respect">
        <p>Be respectful. Treat other students as people, even when you disagree. Help make CampusConnect a place where students can participate without being targeted or intimidated.</p>
      </LegalSection>
      <LegalSection id="not-allowed" title="What’s not allowed">
        <p>Do not post or use CampusConnect to:</p>
        <ul className={`list-disc ${policyListClass}`}>
          <li>Harass, bully, threaten, or promote hate against others.</li>
          <li>Share sexual content, or any sexual content involving minors.</li>
          <li>Promote violence or encourage self-harm.</li>
          <li>Impersonate another person or institution.</li>
          <li>Post spam, scams, fake opportunities, or misleading links.</li>
          <li>Share someone’s private information without permission.</li>
        </ul>
      </LegalSection>
      <LegalSection id="moderation" title="How moderation works">
        <p>Content can be hidden, accounts warned, restricted or suspended, and communities disabled. Moderators must record a reason for every action. If you disagree with a decision, contact <Link to="/contact" className="font-semibold text-primary underline underline-offset-2">support</Link>.</p>
      </LegalSection>
      <LegalSection id="reporting" title="Reporting and blocking">
        <p>Use Report on any post, comment, profile, community, opportunity, or message. The person you report is not told who reported them. You can block anyone from their profile or a post.</p>
      </LegalSection>
    </LegalPage>
  );
}
export function PrivacyPage() {
  const sections = [
    { id: "information", title: "What we collect" },
    { id: "not-do", title: "What we do not do" },
    { id: "visibility", title: "Who can see what" },
    { id: "external-links", title: "External links" },
    { id: "retention", title: "Keeping and deleting data" },
    { id: "hosting", title: "Hosting" },
    { id: "privacy-contact", title: "Contact" },
  ];
  return (
    <LegalPage title="Privacy policy" eyebrow="Your information, explained" icon={ShieldCheck} sections={sections} intro="This page explains what information CampusConnect handles, how it is used, and the choices available to you.">
      <LegalSection id="information" title="What we collect">
        <ul className={`list-disc ${policyListClass}`}>
          <li><strong className="text-fg">Account:</strong> email address and password (stored only as a secure hash by our authentication provider).</li>
          <li><strong className="text-fg">Profile:</strong> name, username, optional photo, bio, institution, faculty, department, level, graduation year, location, interests, and links you choose to add.</li>
          <li><strong className="text-fg">Content:</strong> posts, images, comments, messages, reports you file, communities you join or run, and opportunities you save.</li>
          <li><strong className="text-fg">Basic technical data:</strong> information needed to run and protect the service, for example sign-in times and abuse-prevention counters.</li>
        </ul>
      </LegalSection>
      <LegalSection id="not-do" title="What we do not do">
        <ul className={`list-disc ${policyListClass}`}>
          <li>We do not sell personal data or private messages.</li>
          <li>We do not collect sensitive data we do not need.</li>
          <li>Staff cannot browse private conversations. If a message is reported, moderators see only that reported message.</li>
        </ul>
      </LegalSection>
      <LegalSection id="visibility" title="Who can see what">
        <p>You choose whether your profile is visible to all students, only your institution, or only you. Your email address is not shown on your profile. Authorised staff can see account emails for moderation and support.</p>
      </LegalSection>
      <LegalSection id="external-links" title="External links">
        <p>Opportunity and profile links lead to external websites we do not control. Your whiteshirt.fun link, if you add one, is only a link.</p>
      </LegalSection>
      <LegalSection id="retention" title="Keeping and deleting data">
        <p>You can request account deletion in Settings. Deleted posts and messages have their text removed. Moderation records, reports, and audit logs may be kept for safety and accountability. Exact retention periods must be confirmed before launch.</p>
      </LegalSection>
      <LegalSection id="hosting" title="Hosting">
        <p>Data is stored with our infrastructure provider (Supabase). Where servers are located and what that means for you must be reviewed before launch.</p>
      </LegalSection>
      <LegalSection id="privacy-contact" title="Contact">
        <p>See the <Link className="font-semibold text-primary underline underline-offset-2" to="/contact">support page</Link>.</p>
      </LegalSection>
    </LegalPage>
  );
}
export function TermsPage() {
  const sections = [
    { id: "using-campusconnect", title: "Using CampusConnect" },
    { id: "your-content", title: "Your content" },
    { id: "terms-moderation", title: "Moderation" },
    { id: "opportunities", title: "External opportunities" },
    { id: "identity", title: "Identity and institutions" },
    { id: "changes", title: "Changes and termination" },
  ];
  return (
    <LegalPage title="Terms of service" eyebrow="Using CampusConnect" icon={FileText} sections={sections} intro="These terms set out the basic expectations for using CampusConnect and taking part in its student community.">
      <LegalSection id="using-campusconnect" title="Using CampusConnect">
        <p>You must provide accurate information, keep your password secure, and follow the <Link to="/community-guidelines" className="font-semibold text-primary underline underline-offset-2">community guidelines</Link>. You are responsible for what you post.</p>
      </LegalSection>
      <LegalSection id="your-content" title="Your content">
        <p>You keep ownership of your content and allow CampusConnect to display it to the audience you choose in order to run the service. Do not post content you have no right to share.</p>
      </LegalSection>
      <LegalSection id="terms-moderation" title="Moderation">
        <p>We may remove content or restrict accounts that break the rules, and will record the reason. Serious or repeated violations can lead to suspension.</p>
      </LegalSection>
      <LegalSection id="opportunities" title="External opportunities">
        <p>Opportunities link to third-party websites. CampusConnect does not run those applications and does not guarantee any opportunity. Never pay money to apply for an opportunity found here without checking it independently.</p>
      </LegalSection>
      <LegalSection id="identity" title="Identity and institutions">
        <p>Institution details are self-reported and not verified.</p>
      </LegalSection>
      <LegalSection id="changes" title="Changes and termination">
        <p>You can delete your account at any time. We may update these terms and will announce material changes.</p>
      </LegalSection>
    </LegalPage>
  );
}
export function ContactPage() {
  const s = usePublicSettings().data;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#971b27] via-[#bd2632] to-[#d9444d] px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14 lg:py-16">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> We’re here to help
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl">Let’s make things right.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              Need a hand with your account, have a question, or want to share feedback? Choose the option that fits and we’ll point you in the right direction.
            </p>
            {s?.support_email && (
              <a href={`mailto:${s.support_email}`} className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-primary transition hover:bg-[#fff1f1]">
                <Mail size={17} aria-hidden="true" /> Email support <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </section>

        <section className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Get the right help</p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">A good place to start.</h2>
            <p className="mt-4 leading-7 text-muted">For privacy, please don’t share your password or other sensitive sign-in details when asking for help.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><Flag size={20} aria-hidden="true" /></span>
              <h3 className="mt-4 font-extrabold">Report something on CampusConnect</h3>
              <p className="mt-2 text-sm leading-6 text-muted">Use the Report option where you see the post, comment, profile, community, opportunity, or message. This gives the team context to review it.</p>
            </article>
            <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><ShieldCheck size={20} aria-hidden="true" /></span>
              <h3 className="mt-4 font-extrabold">Manage your account</h3>
              <p className="mt-2 text-sm leading-6 text-muted">For account deletion, sign in and use Settings → Request account deletion. You can also review our <Link to="/privacy" className="font-semibold text-primary underline underline-offset-2">privacy information</Link>.</p>
            </article>
          </div>
        </section>

        <section className="rounded-[26px] border border-line bg-[#fffafa] p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary"><Mail size={22} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Contact support</p>
              {s?.support_email ? (
                <>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Send us a message</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">Email <a className="font-semibold text-primary underline underline-offset-2" href={`mailto:${s.support_email}`}>{s.support_email}</a>. Please never include your password.</p>
                </>
              ) : (
                <>
                  <h2 className="mt-1 text-xl font-black tracking-tight">Support email coming soon</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">A support contact has not been published yet. For now, use the in-app reporting tools or check our <Link to="/community-guidelines" className="font-semibold text-primary underline underline-offset-2">community guidelines</Link>.</p>
                </>
              )}
            </div>
            {s?.support_email && <a href={`mailto:${s.support_email}`} aria-label={`Email ${s.support_email}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-white px-4 py-3 text-sm font-bold text-primary transition hover:border-primary/40 hover:bg-primary/[0.04]">Write to us <ArrowRight size={16} aria-hidden="true" /></a>}
          </div>
        </section>

        <p className="mt-8 text-center text-sm text-muted">Looking for the basics? Read our <Link to="/community-guidelines" className="font-semibold text-primary underline underline-offset-2">community guidelines</Link> or explore <Link to="/features" className="font-semibold text-primary underline underline-offset-2">CampusConnect features</Link>.</p>
      </div>
    </PublicLayout>
  );
}
