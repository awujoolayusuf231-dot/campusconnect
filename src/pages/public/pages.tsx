import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Compass,
  Eye,
  Flag,
  HeartHandshake,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MessageCircle,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PublicLayout } from "./PublicLayout";
import { usePublicSettings } from "@/lib/publicSettings";

type Section = { id: string; title: string; content: ReactNode };

function PageHero({ eyebrow, title, description, icon: Icon }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-[26px] bg-[#771820] px-6 py-8 text-white shadow-[0_20px_60px_rgba(80,30,30,0.14)] sm:rounded-[30px] sm:px-10 sm:py-11">
      <div aria-hidden="true" className="absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full border-[48px] border-white/[0.07]" />
      <div aria-hidden="true" className="absolute -bottom-28 right-1/4 -z-10 h-64 w-64 rounded-full bg-[#a53a42]/40 blur-2xl" />
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur sm:text-xs">
          <Icon size={14} aria-hidden="true" /> {eyebrow}
        </span>
        <h1 className="mt-4 text-3xl font-black leading-[1.08] tracking-[-0.045em] sm:text-4xl lg:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-base sm:leading-7">{description}</p>
      </div>
    </header>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black leading-tight tracking-[-0.035em] text-fg sm:text-3xl">{title}</h2>
      {description && <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{description}</p>}
    </div>
  );
}

function DraftNotice() {
  return (
    <aside role="note" className="flex gap-3 rounded-2xl border border-[#f1d59a] bg-[#fff9e9] p-4 text-sm leading-6 text-[#644d1c]">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f7e7bd] font-black" aria-hidden="true">!</span>
      <p><strong>Draft for review.</strong> This page describes how the platform works today. Have it reviewed by a qualified Nigerian lawyer before public launch. It is not legal advice and does not claim compliance with any law.</p>
    </aside>
  );
}

function LegalPage({ eyebrow, title, description, icon, sections, navLabel }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sections: Section[];
  navLabel: string;
}) {
  return (
    <PublicLayout wide>
      <div className="space-y-6 sm:space-y-8">
        <PageHero eyebrow={eyebrow} title={title} description={description} icon={icon} />
        <DraftNotice />
        <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-6">
            <nav aria-label={navLabel} className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(35,24,20,0.04)]">
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">On this page</p>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="block rounded-lg px-2.5 py-2 text-sm font-medium text-fg transition hover:bg-[#f8e9ea] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="rounded-2xl border border-line bg-[#fffafa] p-4">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">Related</p>
              <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-primary">
                <Link to="/community-guidelines" className="hover:underline">Guidelines</Link>
                <Link to="/privacy" className="hover:underline">Privacy</Link>
                <Link to="/terms" className="hover:underline">Terms</Link>
              </div>
            </div>
          </aside>
          <article className="divide-y divide-line rounded-2xl border border-line bg-white px-5 shadow-[0_8px_24px_rgba(35,24,20,0.04)] sm:px-8">
            {sections.map((section) => (
              <section id={section.id} key={section.id} className="scroll-mt-6 py-6 first:pt-6 last:pb-6 sm:py-7">
                <h2 className="text-lg font-extrabold tracking-tight text-fg sm:text-xl">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted sm:text-base">{section.content}</div>
              </section>
            ))}
            <p className="border-t border-line py-5 text-sm text-muted">
              Questions? Visit <Link to="/contact" className="font-bold text-primary underline underline-offset-2">support</Link>.
            </p>
          </article>
        </div>
      </div>
    </PublicLayout>
  );
}

const featureItems = [
  { icon: MessagesSquare, title: "A student feed", text: "Share updates and up to four photos, like and comment, and follow other students." },
  { icon: Compass, title: "Discover your people", text: "Find students by name, institution, department, level, or interest, with respect for each person’s privacy settings." },
  { icon: UsersRound, title: "Communities that feel like yours", text: "Join or start groups around your institution, course, interests, and campus activities, each with its own moderators." },
  { icon: MessageCircle, title: "Private messages", text: "Have one-to-one conversations with the person you’re chatting with." },
  { icon: BriefcaseBusiness, title: "Student opportunities", text: "Browse internships, scholarships, training, and competitions with links to official external pages." },
  { icon: Sparkles, title: "Campus celebrations", text: "Add your public whiteshirt.fun celebration-board link to your profile. The services do not share accounts or data." },
  { icon: ShieldCheck, title: "Tools to shape your experience", text: "Report or block accounts, choose who can see your profile, and request account deletion." },
];

export function FeaturesPage() {
  return (
    <PublicLayout wide>
      <div className="space-y-12 py-2 sm:space-y-16 sm:py-5">
        <PageHero
          eyebrow="Made for student life"
          title="More than a feed. Your campus, connected."
          description="Find your people, join conversations, and discover opportunities in one welcoming space designed around student life."
          icon={Sparkles}
        />
        <section className="mx-auto max-w-4xl text-center">
          <SectionHeading eyebrow="Find your place" title="The parts of campus life that bring us closer." description="Whether you’re meeting new people, sharing what’s happening, or looking for what’s next, CampusConnect gives you room to take part." />
          <div className="mt-7 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            {featureItems.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(35,24,20,0.08)]">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Icon size={20} aria-hidden="true" /></span>
                  <span className="text-xs font-extrabold tracking-[0.12em] text-[#c8b7b7]">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h2 className="mt-5 font-extrabold text-fg">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-5 rounded-[26px] border border-[#f0d7d9] bg-[#fff7f7] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Your people are out there</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-fg">Come find your corner of campus.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Create an account to join the conversations and communities that make campus feel like yours.</p>
          </div>
          <Link to="/register" className="btn-primary min-h-11 shrink-0 gap-2">Create your account <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>
    </PublicLayout>
  );
}

export function AboutPage() {
  const pillars = [
    { icon: UsersRound, title: "Meet beyond your lecture hall", text: "Discover students by interests, course, level, or institution—and start finding people with something in common." },
    { icon: MessageCircle, title: "Keep campus conversations going", text: "Share updates, join discussions, and message one-to-one when you want a more direct conversation." },
    { icon: BookOpen, title: "Find a community that feels like yours", text: "Explore or create groups around study, shared interests, and the everyday things that bring students together." },
    { icon: BriefcaseBusiness, title: "Explore what could come next", text: "Browse opportunities such as internships, scholarships, training, and competitions in one student-focused place." },
  ];
  const values = [
    { icon: HeartHandshake, title: "Belonging comes first", text: "Campus life is more than lectures. We make room for the connections, conversations, and interests that happen around them." },
    { icon: Eye, title: "Your choices matter", text: "Profile visibility settings and tools to report or block help you shape your experience and respond to unwanted interactions." },
    { icon: Compass, title: "Built for real student life", text: "CampusConnect is designed around the mix of people, communities, ideas, and opportunities students look for." },
  ];

  return (
    <PublicLayout wide>
      <div className="space-y-12 py-2 sm:space-y-16 sm:py-5">
        <PageHero
          eyebrow="About CampusConnect"
          title="Campus is more than a place you study."
          description="It’s the people you meet, the communities you find, the conversations you remember, and the opportunities that help you imagine what’s next. CampusConnect brings those parts of student life closer together."
          icon={UsersRound}
        />
        <section className="grid gap-6 rounded-[26px] border border-line bg-white p-6 shadow-[0_8px_24px_rgba(35,24,20,0.04)] sm:grid-cols-[0.8fr_1.2fr] sm:p-9">
          <SectionHeading eyebrow="Why we’re here" title="Make campus feel a little more connected." />
          <div className="space-y-4 text-sm leading-7 text-muted sm:text-base">
            <p>Finding your people, keeping up with campus life, and hearing about useful opportunities can happen across many different places. CampusConnect is a student-focused space to bring those everyday connections closer.</p>
            <p>It’s for students in Nigerian universities, polytechnics, and colleges of education who want to share what’s happening, meet people with shared interests, take part in communities, and discover new possibilities.</p>
          </div>
        </section>
        <section>
          <SectionHeading eyebrow="A useful place to start" title="What CampusConnect brings together" description="The best parts of a student network are the ways it helps you connect, participate, and find your next step." />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_24px_rgba(35,24,20,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Icon size={19} aria-hidden="true" /></span>
                  <span className="text-xs font-extrabold tracking-[0.12em] text-[#c8b7b7]">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-4 font-extrabold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-[26px] bg-[#fff7f7] p-6 sm:p-9">
          <SectionHeading eyebrow="What guides us" title="A student space, shaped with care." description="A good campus community should feel useful, welcoming, and honest about what it is." />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {values.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[#f0dfe0] bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Icon size={19} aria-hidden="true" /></span>
                <h3 className="mt-4 font-extrabold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="grid gap-4 rounded-[26px] border border-line bg-white p-6 sm:grid-cols-[0.7fr_1.3fr] sm:p-8">
          <SectionHeading eyebrow="Join thoughtfully" title="A few things worth knowing" />
          <div className="space-y-3 text-sm leading-7 text-muted sm:text-base">
            <p>Institution details are chosen by students and are not verified. CampusConnect does not claim to verify student identity or affiliation.</p>
            <p>Use the available privacy controls and safety tools. Read our <Link to="/community-guidelines" className="font-bold text-primary underline underline-offset-2">community guidelines</Link> before joining in. CampusConnect is independent from whiteshirt.fun; they do not share accounts or databases. You can add a link to your public whiteshirt.fun board if you choose.</p>
          </div>
        </section>
        <section className="flex flex-col gap-5 rounded-[26px] bg-[#771820] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.17em] text-white/70">Your campus story starts here</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Find your people. Find your place.</h2><p className="mt-2 text-sm leading-6 text-white/75">Come see what a more connected campus experience can look like.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-[#771820]">Create account <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link to="/features" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">See the features</Link>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}

export function GuidelinesPage() {
  return (
    <LegalPage
      eyebrow="Our shared standards"
      title="Community guidelines"
      description="A welcoming campus community takes care from everyone. These guidelines apply to posts, comments, communities, messages, profiles, and opportunities."
      icon={HeartHandshake}
      navLabel="Community guidelines sections"
      sections={[
        { id: "respect", title: "Start with respect", content: <p>Be respectful. Treat other students as people, even when you disagree. Help make CampusConnect a place where students can participate without being targeted or intimidated.</p> },
        { id: "not-allowed", title: "What’s not allowed", content: <><p>Do not post or use CampusConnect to:</p><ul className="list-disc space-y-2 pl-5"><li>Harass, bully, threaten, or promote hate against others.</li><li>Share sexual content, or any sexual content involving minors.</li><li>Promote violence or encourage self-harm.</li><li>Impersonate another person or institution.</li><li>Post spam, scams, fake opportunities, or misleading links.</li><li>Share someone’s private information without permission.</li></ul></> },
        { id: "moderation", title: "How moderation works", content: <p>Content can be hidden, accounts warned, restricted or suspended, and communities disabled. Moderators must record a reason for every action. If you disagree with a decision, contact <Link to="/contact" className="font-bold text-primary underline underline-offset-2">support</Link>.</p> },
        { id: "reporting", title: "Reporting and blocking", content: <p>Use Report on any post, comment, profile, community, opportunity, or message. The person you report is not told who reported them. You can block anyone from their profile or a post.</p> },
      ]}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Your information, explained"
      title="Privacy policy"
      description="This page explains what information CampusConnect handles, how it is used, and the choices available to you."
      icon={LockKeyhole}
      navLabel="Privacy policy sections"
      sections={[
        { id: "information", title: "What we collect", content: <ul className="list-disc space-y-2 pl-5"><li><strong className="text-fg">Account:</strong> email address and password (stored only as a secure hash by our authentication provider).</li><li><strong className="text-fg">Profile:</strong> name, username, optional photo, bio, institution, faculty, department, level, graduation year, location, interests, and links you choose to add.</li><li><strong className="text-fg">Content:</strong> posts, images, comments, messages, reports you file, communities you join or run, and opportunities you save.</li><li><strong className="text-fg">Basic technical data:</strong> information needed to run and protect the service, for example sign-in times and abuse-prevention counters.</li></ul> },
        { id: "not-do", title: "What we do not do", content: <ul className="list-disc space-y-2 pl-5"><li>We do not sell personal data or private messages.</li><li>We do not collect sensitive data we do not need.</li><li>Staff cannot browse private conversations. If a message is reported, moderators see only that reported message.</li></ul> },
        { id: "visibility", title: "Who can see what", content: <p>You choose whether your profile is visible to all students, only your institution, or only you. Your email address is not shown on your profile. Authorised staff can see account emails for moderation and support.</p> },
        { id: "external-links", title: "External links", content: <p>Opportunity and profile links lead to external websites we do not control. Your whiteshirt.fun link, if you add one, is only a link.</p> },
        { id: "retention", title: "Keeping and deleting data", content: <p>You can request account deletion in Settings. Deleted posts and messages have their text removed. Moderation records, reports, and audit logs may be kept for safety and accountability. Exact retention periods must be confirmed before launch.</p> },
        { id: "hosting", title: "Hosting", content: <p>Data is stored with our infrastructure provider (Supabase). Where servers are located and what that means for you must be reviewed before launch.</p> },
        { id: "privacy-contact", title: "Contact", content: <p>See the <Link to="/contact" className="font-bold text-primary underline underline-offset-2">support page</Link>.</p> },
      ]}
    />
  );
}

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using CampusConnect"
      title="Terms of service"
      description="These terms set out the basic expectations for using CampusConnect and taking part in its student community."
      icon={BookOpen}
      navLabel="Terms of service sections"
      sections={[
        { id: "using-campusconnect", title: "Using CampusConnect", content: <p>You must provide accurate information, keep your password secure, and follow the <Link to="/community-guidelines" className="font-bold text-primary underline underline-offset-2">community guidelines</Link>. You are responsible for what you post.</p> },
        { id: "your-content", title: "Your content", content: <p>You keep ownership of your content and allow CampusConnect to display it to the audience you choose in order to run the service. Do not post content you have no right to share.</p> },
        { id: "terms-moderation", title: "Moderation", content: <p>We may remove content or restrict accounts that break the rules, and will record the reason. Serious or repeated violations can lead to suspension.</p> },
        { id: "opportunities", title: "External opportunities", content: <p>Opportunities link to third-party websites. CampusConnect does not run those applications and does not guarantee any opportunity. Never pay money to apply for an opportunity found here without checking it independently.</p> },
        { id: "identity", title: "Identity and institutions", content: <p>Institution details are self-reported and not verified.</p> },
        { id: "changes", title: "Changes and termination", content: <p>You can delete your account at any time. We may update these terms and will announce material changes.</p> },
      ]}
    />
  );
}

export function ContactPage() {
  const supportEmail = usePublicSettings().data?.support_email;

  return (
    <PublicLayout wide>
      <div className="space-y-7 py-2 sm:space-y-9 sm:py-5">
        <PageHero
          eyebrow="We’re here to help"
          title="Let’s make things right."
          description="Need a hand with your account, have a question, or want to share feedback? Choose the option that fits and we’ll point you in the right direction."
          icon={LifeBuoy}
        />
        <section className="rounded-[26px] border border-line bg-white p-6 shadow-[0_8px_24px_rgba(35,24,20,0.04)] sm:p-8">
          <SectionHeading eyebrow="Get the right help" title="A good place to start." description="For privacy, please don’t share your password or other sensitive sign-in details when asking for help." />
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-line bg-[#fffafa] p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><Flag size={20} aria-hidden="true" /></span>
              <h2 className="mt-4 font-extrabold text-fg">Report something on CampusConnect</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Use the Report option where you see the post, comment, profile, community, opportunity, or message. This gives the team context to review it.</p>
              <Link to="/community-guidelines" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">Read the guidelines <ArrowRight size={15} aria-hidden="true" /></Link>
            </article>
            <article className="rounded-2xl border border-line bg-[#fffafa] p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f8e9ea] text-primary"><ShieldAlert size={20} aria-hidden="true" /></span>
              <h2 className="mt-4 font-extrabold text-fg">Manage your account</h2>
              <p className="mt-2 text-sm leading-6 text-muted">For account deletion, sign in and use Settings → Request account deletion. You can also review our <Link to="/privacy" className="font-bold text-primary underline underline-offset-2">privacy information</Link>.</p>
            </article>
          </div>
        </section>
        <section className="flex flex-col gap-4 rounded-[26px] border border-[#f0d7d9] bg-[#fff7f7] p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm"><Mail size={21} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-primary">Contact support</p>
            <h2 className="mt-1 text-xl font-black text-fg">{supportEmail ? "We’d be glad to hear from you." : "Support email coming soon"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{supportEmail ? <>Email us at <a className="font-bold text-primary underline underline-offset-2" href={`mailto:${supportEmail}`}>{supportEmail}</a>. Please never send your password.</> : <>A support contact has not been published yet. For now, use the in-app reporting tools or check our <Link to="/community-guidelines" className="font-bold text-primary underline underline-offset-2">community guidelines</Link>.</>}</p>
          </div>
        </section>
        <p className="text-sm leading-6 text-muted">Looking for the basics? Read our <Link to="/community-guidelines" className="font-bold text-primary underline underline-offset-2">community guidelines</Link> or explore <Link to="/features" className="font-bold text-primary underline underline-offset-2">CampusConnect features</Link>.</p>
      </div>
    </PublicLayout>
  );
}
