import type { CelebrationCategory, CelebrationTheme } from "./api";

export type CelebrationLayout = "portrait" | "editorial" | "luxury" | "celebration";
export type CelebrationField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "url" | "number";
};
export type CelebrationOccasion = {
  id: CelebrationCategory;
  label: string;
  eyebrow: string;
  primaryName: string;
  titlePlaceholder: string;
  messagePlaceholder: string;
  fields: CelebrationField[];
  palette: readonly [string, string, string, string];
  accent: string;
  text: string;
  image: string;
  icon: "party" | "academic" | "heart" | "award" | "home" | "baby" | "culture" | "spark";
  emotionalLine: string;
  is_active?: boolean;
};
export type StudioTemplate = {
  id: string;
  occasion_id: CelebrationCategory;
  name: string;
  description: string;
  layout: CelebrationLayout;
  background: string;
  accent: string;
  text: string;
  font: CelebrationTheme["font"];
  is_active?: boolean;
  is_featured?: boolean;
  preview_image_url?: string | null;
};

const occasionRows: CelebrationOccasion[] = [
  {
    id: "birthday", label: "Birthday", eyebrow: "Another year, celebrated", primaryName: "Birthday celebrant", titlePlaceholder: "A new year to shine",
    messagePlaceholder: "Write a birthday wish or share what makes this year special.",
    fields: [{ key: "age", label: "Age (optional)", type: "number", placeholder: "e.g. 21" }],
    palette: ["#172c3c", "#8d2536", "#192f36", "#f0d7b4"], accent: "#f4c769", text: "#fffaf2", image: "/celebrations/birthday.jpg", icon: "party", emotionalLine: "A brighter year begins here.",
  },
  {
    id: "induction", label: "Induction", eyebrow: "A new chapter begins", primaryName: "Inductee's name", titlePlaceholder: "Welcome to the profession",
    messagePlaceholder: "Celebrate the dedication and new responsibilities of this milestone.",
    fields: [{ key: "institution", label: "Institution", placeholder: "University or professional body" }, { key: "faculty", label: "Faculty", placeholder: "Faculty or school" }, { key: "department", label: "Department", placeholder: "Department" }, { key: "session", label: "Academic session", placeholder: "2025 / 2026" }],
    palette: ["#142b41", "#16493e", "#6a3b2c", "#e7e0ce"], accent: "#d8b260", text: "#fffaf0", image: "/celebrations/achievement.jpg", icon: "academic", emotionalLine: "Earned with purpose. Carried with pride.",
  },
  {
    id: "convocation", label: "Convocation", eyebrow: "The next chapter starts", primaryName: "Graduate's name", titlePlaceholder: "A day years in the making",
    messagePlaceholder: "Honor the hard work, late nights, and people behind this achievement.",
    fields: [{ key: "institution", label: "Institution", placeholder: "University or college" }, { key: "degree", label: "Degree or qualification", placeholder: "B.Sc. Computer Science" }, { key: "faculty", label: "Faculty", placeholder: "Faculty" }, { key: "department", label: "Department", placeholder: "Department" }, { key: "honour", label: "Class or distinction (optional)", placeholder: "First Class Honours" }],
    palette: ["#142c4d", "#552637", "#254944", "#efe4d2"], accent: "#dfbd74", text: "#fffaf3", image: "/celebrations/graduation.jpg", icon: "academic", emotionalLine: "A degree earned. A future opened.",
  },
  {
    id: "sign_out", label: "Sign-out", eyebrow: "The memories stay", primaryName: "Graduate's name", titlePlaceholder: "One last walk across campus",
    messagePlaceholder: "Share a note about the friendships, lessons, and memories made.",
    fields: [{ key: "institution", label: "Institution", placeholder: "University or college" }, { key: "department", label: "Department", placeholder: "Department" }, { key: "journey", label: "A line from your journey", placeholder: "From first lecture to final sign-out…" }, { key: "session", label: "Graduating session", placeholder: "2025 / 2026" }],
    palette: ["#412631", "#243d4a", "#623a2b", "#f2dfc9"], accent: "#e5aa73", text: "#fff9f0", image: "/celebrations/graduation.jpg", icon: "academic", emotionalLine: "Every ending carries a beginning.",
  },
  {
    id: "wedding", label: "Wedding", eyebrow: "Together, always", primaryName: "Couple's names", titlePlaceholder: "A celebration of love",
    messagePlaceholder: "Invite loved ones to share a beautiful beginning.",
    fields: [{ key: "partner_name", label: "Partner's name", placeholder: "Name" }, { key: "venue", label: "Venue", placeholder: "Ceremony venue" }, { key: "personal_link", label: "Invitation link (optional)", type: "url", placeholder: "https://…" }],
    palette: ["#583242", "#7d3e48", "#394338", "#f0e2d3"], accent: "#e7c39a", text: "#fff9f2", image: "/celebrations/wedding.jpg", icon: "heart", emotionalLine: "Two stories, one beautiful future.",
  },
  {
    id: "engagement", label: "Engagement", eyebrow: "A promise worth celebrating", primaryName: "Your names", titlePlaceholder: "The beginning of forever",
    messagePlaceholder: "Share the joy of a promise made and a future imagined.",
    fields: [{ key: "partner_name", label: "Fiancé(e)'s name", placeholder: "Name" }, { key: "venue", label: "Celebration venue (optional)", placeholder: "Venue" }, { key: "personal_link", label: "Personal link (optional)", type: "url", placeholder: "https://…" }],
    palette: ["#483448", "#3c4b42", "#75404b", "#f0ded0"], accent: "#e4bd8e", text: "#fffaf4", image: "/celebrations/wedding.jpg", icon: "heart", emotionalLine: "A joyful yes. A lifetime ahead.",
  },
  {
    id: "naming_ceremony", label: "Naming ceremony", eyebrow: "A precious new name", primaryName: "Baby's name", titlePlaceholder: "Welcome to the world",
    messagePlaceholder: "Send a warm welcome to the newest member of the family.",
    fields: [{ key: "parents", label: "Parents (optional)", placeholder: "Names" }, { key: "venue", label: "Ceremony venue (optional)", placeholder: "Venue" }],
    palette: ["#b98272", "#748b87", "#836b83", "#efe0d0"], accent: "#f5d6a6", text: "#fffaf4", image: "/celebrations/birthday.jpg", icon: "baby", emotionalLine: "A little life. A world of possibility.",
  },
  {
    id: "graduation", label: "Graduation", eyebrow: "The cap. The gown. The moment.", primaryName: "Graduate's name", titlePlaceholder: "A milestone made meaningful",
    messagePlaceholder: "Celebrate a hard-earned milestone and what comes next.",
    fields: [{ key: "institution", label: "Institution", placeholder: "University or college" }, { key: "degree", label: "Degree or qualification", placeholder: "Qualification" }, { key: "faculty", label: "Faculty", placeholder: "Faculty" }, { key: "department", label: "Department", placeholder: "Department" }, { key: "honour", label: "Class or distinction (optional)", placeholder: "Achievement" }],
    palette: ["#182c49", "#713343", "#2e4c47", "#eee1cf"], accent: "#dfbd74", text: "#fffaf4", image: "/celebrations/graduation.jpg", icon: "academic", emotionalLine: "The work was yours. The moment is yours.",
  },
  {
    id: "anniversary", label: "Anniversary", eyebrow: "Still choosing each other", primaryName: "Names to celebrate", titlePlaceholder: "Another year, side by side",
    messagePlaceholder: "Celebrate the moments and memories shared along the way.",
    fields: [{ key: "years", label: "Years together (optional)", type: "number", placeholder: "e.g. 5" }, { key: "partner_name", label: "Partner's name", placeholder: "Name" }, { key: "venue", label: "Venue (optional)", placeholder: "Venue" }],
    palette: ["#362940", "#77404b", "#374741", "#eee0cf"], accent: "#dfbd83", text: "#fff9f2", image: "/celebrations/wedding.jpg", icon: "heart", emotionalLine: "A love story, still unfolding.",
  },
  {
    id: "promotion_achievement", label: "Promotion & achievement", eyebrow: "Progress worth celebrating", primaryName: "Achiever's name", titlePlaceholder: "A well-earned next step",
    messagePlaceholder: "Recognize the effort, growth, and courage behind this achievement.",
    fields: [{ key: "achievement", label: "Achievement or new role", placeholder: "New position, milestone, or accomplishment" }, { key: "institution", label: "Organization (optional)", placeholder: "Organization" }],
    palette: ["#3b2c28", "#16433e", "#283c5a", "#f0dec6"], accent: "#e9bd67", text: "#fffaf2", image: "/celebrations/achievement.jpg", icon: "award", emotionalLine: "The next level looks good on you.",
  },
  {
    id: "award_recognition", label: "Award & recognition", eyebrow: "Excellence seen and celebrated", primaryName: "Honoree's name", titlePlaceholder: "Recognition well deserved",
    messagePlaceholder: "Celebrate the contribution and excellence being recognized.",
    fields: [{ key: "award", label: "Award or recognition", placeholder: "Award title" }, { key: "organization", label: "Awarding organization", placeholder: "Organization" }, { key: "category", label: "Award category (optional)", placeholder: "Category" }],
    palette: ["#1d3046", "#532c42", "#4a3b23", "#eee2cf"], accent: "#e5c16e", text: "#fffaf2", image: "/celebrations/achievement.jpg", icon: "award", emotionalLine: "A moment of excellence. A legacy in motion.",
  },
  {
    id: "housewarming", label: "Housewarming", eyebrow: "A place to call your own", primaryName: "Host's name", titlePlaceholder: "A new home, a warm welcome",
    messagePlaceholder: "Invite friends and family to celebrate your new place.",
    fields: [{ key: "venue", label: "New home address or venue", placeholder: "Address or directions" }, { key: "personal_link", label: "Map or invitation link (optional)", type: "url", placeholder: "https://…" }],
    palette: ["#54634c", "#9a593b", "#374f62", "#efe0c9"], accent: "#e8c27d", text: "#fffaf1", image: "/celebrations/achievement.jpg", icon: "home", emotionalLine: "Come in. Stay awhile.",
  },
  {
    id: "baby_shower", label: "Baby shower", eyebrow: "A little one on the way", primaryName: "Parent-to-be", titlePlaceholder: "A little wonder is on the way",
    messagePlaceholder: "Share the excitement as family and friends get ready to welcome a new arrival.",
    fields: [{ key: "parents", label: "Parents-to-be (optional)", placeholder: "Names" }, { key: "venue", label: "Shower venue (optional)", placeholder: "Venue" }, { key: "personal_link", label: "Registry link (optional)", type: "url", placeholder: "https://…" }],
    palette: ["#a6818c", "#778a82", "#9a775e", "#f4e3d4"], accent: "#f1d29a", text: "#fffaf4", image: "/celebrations/birthday.jpg", icon: "baby", emotionalLine: "The sweetest adventure is almost here.",
  },
  {
    id: "retirement", label: "Retirement", eyebrow: "A career well lived", primaryName: "Honoree's name", titlePlaceholder: "Thank you for the years",
    messagePlaceholder: "Honor a career, a mentor, and all the lives made better along the way.",
    fields: [{ key: "organization", label: "Organization", placeholder: "Organization or institution" }, { key: "years", label: "Years of service (optional)", type: "number", placeholder: "e.g. 30" }, { key: "role", label: "Role or title", placeholder: "Position" }],
    palette: ["#34464b", "#624344", "#465338", "#eee1d0"], accent: "#dfbd78", text: "#fffaf2", image: "/celebrations/achievement.jpg", icon: "award", emotionalLine: "The work may pause. The impact never will.",
  },
  {
    id: "cultural_celebration", label: "Cultural celebration", eyebrow: "Tradition, joy, togetherness", primaryName: "Name or community", titlePlaceholder: "Celebrating our culture",
    messagePlaceholder: "Share the meaning, traditions, and joy of this cultural occasion.",
    fields: [{ key: "occasion_detail", label: "Celebration or tradition", placeholder: "Name of the occasion" }, { key: "community", label: "Community (optional)", placeholder: "Community or cultural group" }, { key: "venue", label: "Venue (optional)", placeholder: "Venue" }],
    palette: ["#49394a", "#314a3e", "#7a4538", "#ebddc6"], accent: "#e9bd69", text: "#fff9f0", image: "/celebrations/achievement.jpg", icon: "culture", emotionalLine: "Our stories make us who we are.",
  },
  {
    id: "other", label: "Other celebration", eyebrow: "Your moment, your way", primaryName: "Name to celebrate", titlePlaceholder: "A moment worth remembering",
    messagePlaceholder: "Tell the story behind this special occasion.",
    fields: [{ key: "occasion_detail", label: "What are you celebrating?", placeholder: "Describe the occasion" }, { key: "venue", label: "Venue (optional)", placeholder: "Venue" }, { key: "personal_link", label: "Personal link (optional)", type: "url", placeholder: "https://…" }],
    palette: ["#392d42", "#31474b", "#6f413c", "#edddc9"], accent: "#e8bc72", text: "#fffaf2", image: "/celebrations/achievement.jpg", icon: "spark", emotionalLine: "Every good moment deserves its own page.",
  },
];

export const CELEBRATION_OCCASIONS = occasionRows;
export const CELEBRATION_LAYOUTS: readonly { id: CelebrationLayout; name: string; description: string; font: CelebrationTheme["font"] }[] = [
  { id: "portrait", name: "Portrait", description: "Photo-forward with a dramatic full-height image.", font: "sans" },
  { id: "editorial", name: "Editorial", description: "Magazine-inspired typography and structured details.", font: "display" },
  { id: "luxury", name: "Luxe", description: "Quietly elegant, framed and beautifully balanced.", font: "serif" },
  { id: "celebration", name: "Joyful", description: "Expressive shapes and a bright celebratory finish.", font: "display" },
];

const namedTemplateVariants: Record<CelebrationLayout, string> = {
  portrait: "The Portrait",
  editorial: "The Editorial",
  luxury: "The Signature",
  celebration: "The Celebration",
};

export const CELEBRATION_TEMPLATES: StudioTemplate[] = occasionRows.flatMap((occasion) =>
  CELEBRATION_LAYOUTS.map((layout, index) => ({
    id: `${occasion.id}-${layout.id}`,
    occasion_id: occasion.id,
    name: namedTemplateVariants[layout.id],
    description: layout.description,
    layout: layout.id,
    background: occasion.palette[index]!,
    accent: occasion.accent,
    text: index === 3 ? "#211f1d" : occasion.text,
    font: layout.font,
  })),
);

export const LEGACY_TEMPLATE_MAP: Record<string, CelebrationLayout> = {
  "birthday-balloons": "celebration",
  "birthday-editorial": "editorial",
  "birthday-confetti": "luxury",
  "convocation-classic": "luxury",
  "graduation-honors": "editorial",
  "graduation-modern": "portrait",
  "induction-professional": "editorial",
  "signout-campus": "celebration",
  "naming-soft": "portrait",
  "wedding-romance": "luxury",
  "anniversary-elegant": "luxury",
  "achievement-bold": "editorial",
  "other-celebration": "celebration",
};

export function getCelebrationOccasion(category: string): CelebrationOccasion {
  const resolvedCategory = category === "achievement" ? "promotion_achievement" : category;
  return occasionRows.find((occasion) => occasion.id === resolvedCategory) ?? occasionRows[0]!;
}

export function getCelebrationTemplate(templateId: string): StudioTemplate {
  const resolvedId = templateId === "achievement-bold" ? "promotion_achievement-editorial" : templateId;
  return CELEBRATION_TEMPLATES.find((template) => template.id === resolvedId)
    ?? CELEBRATION_TEMPLATES.find((template) => template.id === `birthday-${LEGACY_TEMPLATE_MAP[templateId] ?? "celebration"}`)!;
}

export function templatesForOccasion(category: CelebrationCategory): StudioTemplate[] {
  return CELEBRATION_TEMPLATES.filter((template) => template.occasion_id === category);
}