import { Link } from "react-router-dom";
import { PublicLayout } from "./PublicLayout";
import { usePublicSettings } from "@/lib/publicSettings";

const Draft = () => <p role="note" className="mb-6 rounded-lg border border-line bg-bg p-3 text-sm text-muted">Draft for review: this page describes how the platform actually works today. Have it reviewed by a qualified Nigerian lawyer before public launch. It is not legal advice and does not claim compliance with any law.</p>;
const H = ({ children }: { children: string }) => <h2 className="mb-2 mt-6 text-lg font-semibold">{children}</h2>;

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
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">About CampusConnect</h1>
    <p className="mb-3">CampusConnect is a social network built for students in Nigerian universities, polytechnics and colleges of education.</p>
    <p className="mb-3">The institution on a profile is chosen by the student and is <strong>not verified</strong>. We only mark information as verified if a real verification process exists.</p>
    <p>CampusConnect is independent from whiteshirt.fun. They do not share accounts or databases; CampusConnect can link to a student’s public whiteshirt.fun board if the student adds the link.</p></PublicLayout>;
}
export function GuidelinesPage() {
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">Community guidelines</h1><Draft />
    <p>Be respectful. These rules apply to posts, comments, communities, messages, profiles and opportunities.</p>
    <H>Not allowed</H><ul className="list-disc space-y-1 pl-6"><li>Harassment, bullying, threats or hate speech.</li><li>Sexual content, or any sexual content involving minors.</li><li>Violence, or encouraging self-harm.</li><li>Impersonating another person or institution.</li><li>Spam, scams, fake opportunities or misleading links.</li><li>Sharing someone’s private information without permission.</li></ul>
    <H>What happens when rules are broken</H><p>Content can be hidden, accounts warned, restricted or suspended, and communities disabled. Moderators must record a reason for every action. If you disagree with a decision, contact support.</p>
    <H>Reporting and blocking</H><p>Use Report on any post, comment, profile, community, opportunity or message. The person you report is not told who reported them. You can block anyone from their profile or a post.</p></PublicLayout>;
}
export function PrivacyPage() {
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">Privacy policy</h1><Draft />
    <H>What we collect</H><ul className="list-disc space-y-1 pl-6"><li>Account: email address and password (stored only as a secure hash by our authentication provider).</li><li>Profile: name, username, optional photo, bio, institution, faculty, department, level, graduation year, location, interests and links you choose to add.</li><li>Content: posts, images, comments, messages, reports you file, communities you join or run, opportunities you save.</li><li>Basic technical data needed to run and protect the service (for example sign-in times and abuse-prevention counters).</li></ul>
    <H>What we do not do</H><ul className="list-disc space-y-1 pl-6"><li>We do not sell personal data or private messages.</li><li>We do not collect sensitive data we do not need.</li><li>Staff cannot browse private conversations. If a message is reported, moderators see only that reported message.</li></ul>
    <H>Who can see what</H><p>You choose whether your profile is visible to all students, only your institution, or only you. Your email address is not shown on your profile. Authorised staff can see account emails for moderation and support.</p>
    <H>External links</H><p>Opportunity and profile links lead to external websites we do not control. Your whiteshirt.fun link, if you add one, is only a link.</p>
    <H>Keeping and deleting data</H><p>You can request account deletion in Settings. Deleted posts and messages have their text removed. Moderation records, reports and audit logs may be kept for safety and accountability. Exact retention periods must be confirmed before launch.</p>
    <H>Hosting</H><p>Data is stored with our infrastructure provider (Supabase). Where servers are located and what that means for you must be reviewed before launch.</p>
    <H>Contact</H><p>See the <Link className="underline" to="/contact">support page</Link>.</p></PublicLayout>;
}
export function TermsPage() {
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">Terms of service</h1><Draft />
    <H>Using CampusConnect</H><p>You must provide accurate information, keep your password secure and follow the community guidelines. You are responsible for what you post.</p>
    <H>Your content</H><p>You keep ownership of your content and allow CampusConnect to display it to the audience you choose in order to run the service. Do not post content you have no right to share.</p>
    <H>Moderation</H><p>We may remove content or restrict accounts that break the rules, and will record the reason. Serious or repeated violations can lead to suspension.</p>
    <H>External opportunities</H><p>Opportunities link to third-party websites. CampusConnect does not run those applications and does not guarantee any opportunity. Never pay money to apply for an opportunity found here without checking it independently.</p>
    <H>No guarantee of identity</H><p>Institution details are self-reported and not verified.</p>
    <H>Changes and termination</H><p>You can delete your account at any time. We may update these terms and will announce material changes.</p></PublicLayout>;
}
export function ContactPage() {
  const s = usePublicSettings().data;
  return <PublicLayout><h1 className="mb-4 text-3xl font-semibold">Support</h1>
    {s?.support_email ? <p>Email us at <a className="underline" href={`mailto:${s.support_email}`}>{s.support_email}</a>. Please never send your password.</p> : <p className="card text-muted">A support contact has not been published yet. Please check back soon.</p>}
    <H>Faster options</H><p>To report content or a person, use the Report button where you see it. To remove your account, use Settings → Request account deletion.</p></PublicLayout>;
}
