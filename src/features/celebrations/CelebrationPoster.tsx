import { Award, Baby, ExternalLink, GraduationCap, Heart, House, PartyPopper, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getCelebrationOccasion, getCelebrationTemplate, type CelebrationLayout } from "./catalog";
import type { CelebrationCategory, CelebrationDetails, CelebrationTheme } from "./api";

type PosterCard = {
  title: string;
  category: CelebrationCategory;
  celebrant_name: string;
  celebration_at: string;
  timezone: string;
  message: string;
  whiteshirt_url?: string | null;
  template_id: string;
  customization: CelebrationTheme;
  details?: CelebrationDetails;
};

const ICONS = {
  party: PartyPopper,
  academic: GraduationCap,
  heart: Heart,
  award: Award,
  home: House,
  baby: Baby,
  culture: Sparkles,
  spark: Sparkles,
};

function countdownFor(value: string, timeZone: string): string {
  const dateParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>;
  const eventDay = dateParts(new Date(value));
  const today = dateParts(new Date());
  const days = Math.round((
    Date.UTC(eventDay.year!, eventDay.month! - 1, eventDay.day!)
    - Date.UTC(today.year!, today.month! - 1, today.day!)
  ) / 86_400_000);
  if (days < 0) return "A day worth remembering";
  if (days === 0) return "Today is the day!";
  return `${days} ${days === 1 ? "day" : "days"} to go`;
}

function PosterMeta({ card, institutionName }: { card: PosterCard; institutionName?: string }) {
  const details = card.details ?? {};
  const lines = Object.entries(details).filter(([, value]) => value.trim()).slice(0, 3);
  const boardLabel = card.whiteshirt_url
    ?.replace(/^https:\/\/(?:www\.)?whiteshirt\.fun/i, "whiteshirt.fun")
    .replace(/\/$/, "");
  return (
    <div className="space-y-2">
      {institutionName && <p className="text-[0.62rem] font-bold uppercase tracking-[0.17em] opacity-80">{institutionName}</p>}
      {lines.length > 0 && <div className="flex flex-wrap gap-1.5">{lines.map(([key, value]) => (
        <span key={key} className="rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-[0.6rem] font-semibold backdrop-blur-sm">{value}</span>
      ))}</div>}
      {boardLabel && <span aria-label="Whiteshirt celebration board" className="inline-flex max-w-full items-center gap-2 rounded-xl border border-current/25 bg-white/10 px-2.5 py-1.5 backdrop-blur-sm">
        <ExternalLink aria-hidden="true" size={12} className="shrink-0" />
        <span className="min-w-0 text-left"><span className="block text-[0.48rem] font-extrabold uppercase tracking-[0.13em] opacity-80">Continue celebrating</span><span className="block truncate text-[0.58rem] font-bold">{boardLabel}</span></span>
      </span>}
    </div>
  );
}

export function CelebrationPoster({
  card,
  photoUrl,
  qrValue,
  square = false,
}: {
  card: PosterCard;
  photoUrl?: string | null;
  qrValue?: string;
  square?: boolean;
}) {
  const occasion = getCelebrationOccasion(card.category);
  const template = getCelebrationTemplate(card.template_id);
  const layout: CelebrationLayout = card.customization.layout ?? template.layout;
  const theme = card.customization;
  const fullBleedPhoto = Boolean(photoUrl && theme.fullBleedPhoto !== false);
  const framedPhoto = Boolean(photoUrl && !fullBleedPhoto);
  const fullPhoto = fullBleedPhoto ? photoUrl! : occasion.image;
  const alignment = theme.align === "left" ? "text-left" : theme.align === "right" ? "text-right" : "text-center";
  const displayName = card.category === "wedding" && card.details?.partner_name
    ? `${card.celebrant_name} & ${card.details.partner_name}`
    : card.celebrant_name;
  const titleSize = theme.titleSize === "small" ? "text-3xl sm:text-4xl" : theme.titleSize === "large" ? "text-5xl sm:text-7xl" : "text-4xl sm:text-6xl";
  const font = theme.font === "serif" ? "font-serif" : theme.font === "display" ? "font-black tracking-tight" : "font-extrabold tracking-tight";
  const Icon = ICONS[occasion.icon];
  const eventDate = new Date(card.celebration_at);
  const dateLabel = Number.isNaN(eventDate.getTime())
    ? "A special day"
    : eventDate.toLocaleDateString(undefined, { dateStyle: "long", timeZone: card.timezone });

  return (
    <article
      data-celebration-poster
      className={`relative isolate w-full overflow-hidden border border-white/15 shadow-[0_22px_60px_rgba(30,18,18,0.22)] ${square ? "aspect-square" : "aspect-[3/4]"} ${alignment}`}
      style={{ color: theme.text, backgroundColor: theme.background }}
    >
      <img src={fullPhoto} alt="" aria-hidden="true" crossOrigin="anonymous" className={`absolute inset-0 h-full w-full object-cover ${fullBleedPhoto ? "opacity-100" : "opacity-50"}`} style={{ objectPosition: `${theme.photoX}% ${theme.photoY}%`, transform: `scale(${theme.photoScale})` }} />
      <div aria-hidden="true" className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${theme.background}45 0%, ${theme.background}14 35%, ${theme.background}e8 100%)` }} />
      {theme.showDecorations !== false && (
        <>
          <div aria-hidden="true" className="absolute -right-[17%] -top-[10%] h-[42%] w-[56%] rounded-full border border-white/30" />
          <div aria-hidden="true" className="absolute -bottom-[14%] -left-[20%] h-[44%] w-[68%] rounded-full border border-white/25" />
          <div aria-hidden="true" className="absolute inset-[3%] border border-white/35" />
          <Icon aria-hidden="true" className="absolute right-[8%] top-[8%] h-8 w-8 opacity-80" strokeWidth={1.4} />
        </>
      )}
      {layout === "portrait" && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex min-h-[48%] flex-col justify-end px-[8%] pb-[8%] pt-[18%] text-left" style={{ background: `linear-gradient(0deg, ${theme.background} 0%, ${theme.background}f2 63%, transparent 100%)` }}>
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.accent }}>{occasion.eyebrow}</p>
          {framedPhoto && <div className="mb-4 mt-2 h-20 w-20 overflow-hidden rounded-full border-[3px] border-white/80 shadow-xl"><img src={photoUrl!} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${theme.photoX}% ${theme.photoY}%` }} /></div>}
          <h1 className={`mt-3 break-words leading-[0.92] ${titleSize} ${font}`}>{displayName}</h1>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.13em] opacity-90">{card.title}</p>
          <p className="mt-3 line-clamp-3 max-w-[34rem] whitespace-pre-wrap text-sm leading-6 opacity-95">{card.message || occasion.emotionalLine}</p>
          <footer className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/25 pt-4">
            <div className="space-y-1 text-left"><PosterMeta card={card} institutionName={theme.institutionName} /><p className="text-xs font-bold">{dateLabel}</p></div>
            {theme.showCountdown && <p className="text-right text-lg font-black" style={{ color: theme.accent }}>{countdownFor(card.celebration_at, card.timezone)}</p>}
            {qrValue && <QRCodeSVG value={qrValue} size={58} bgColor="#ffffff" fgColor="#231f20" includeMargin />}
          </footer>
        </div>
      )}
      {layout === "editorial" && (
        <div className={`relative z-10 flex h-full flex-col justify-between p-[8%] ${alignment}`}>
          <header className="flex items-start justify-between gap-3 border-b border-white/45 pb-3 text-left">
            <div><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.22em]" style={{ color: theme.accent }}>{occasion.eyebrow}</p><p className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.15em]">{theme.institutionName || dateLabel}</p></div>
            {qrValue && <QRCodeSVG value={qrValue} size={54} bgColor="#ffffff" fgColor="#231f20" includeMargin />}
          </header>
          <div className="my-auto py-[8%]">
          {framedPhoto && <div className="mb-4 h-20 w-full overflow-hidden rounded-xl border border-white/50"><img src={photoUrl!} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${theme.photoX}% ${theme.photoY}%` }} /></div>}
            {theme.showCountdown && <p className="mb-3 text-xs font-black uppercase tracking-[0.17em]" style={{ color: theme.accent }}>{countdownFor(card.celebration_at, card.timezone)}</p>}
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em]">{card.title}</p>
            <h1 className={`mt-4 break-words leading-[0.86] ${titleSize} ${font}`}>{displayName}</h1>
            <div className="mt-4 h-1 w-16" style={{ backgroundColor: theme.accent }} />
            <p className="mt-5 max-w-xl whitespace-pre-wrap text-sm leading-6">{card.message || occasion.emotionalLine}</p>
            {theme.extraText && <p className="mt-3 text-xs font-semibold italic">{theme.extraText}</p>}
          </div>
          <footer className="flex items-end justify-between gap-3 border-t border-white/45 pt-3 text-left">
            <div className="min-w-0"><PosterMeta card={card} /><p className="mt-2 text-[0.62rem] font-bold uppercase tracking-[0.15em]">{dateLabel}</p></div>
            <span className="shrink-0 text-[0.58rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.accent }}>CampusConnect</span>
          </footer>
        </div>
      )}
      {layout === "luxury" && (
        <div className="relative z-10 flex h-full flex-col items-center justify-between p-[8%]">
          <div aria-hidden="true" className="absolute inset-[6%] border" style={{ borderColor: `${theme.accent}aa` }} />
          <header className="mt-[7%] flex flex-col items-center">
            <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.25em]" style={{ color: theme.accent }}>{occasion.eyebrow}</p>
            <span className="mt-4 h-px w-20" style={{ backgroundColor: theme.accent }} />
          </header>
          <div className="z-10 flex flex-col items-center px-[4%] py-[4%]">
            {framedPhoto && <div className="mb-5 h-24 w-24 overflow-hidden rounded-full border-[3px] p-1" style={{ borderColor: theme.accent }}><img src={photoUrl!} alt="" className="h-full w-full rounded-full object-cover" style={{ objectPosition: `${theme.photoX}% ${theme.photoY}%` }} /></div>}
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em]">{card.title}</p>
            <h1 className={`mt-3 break-words leading-tight ${titleSize} ${font}`}>{displayName}</h1>
            <p className="mt-4 max-w-xl whitespace-pre-wrap text-sm leading-6 opacity-90">{card.message || occasion.emotionalLine}</p>
            {theme.showCountdown && <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>{countdownFor(card.celebration_at, card.timezone)}</p>}
            {theme.extraText && <p className="mt-3 text-xs italic">{theme.extraText}</p>}
          </div>
          <footer className="mb-[5%] flex w-full items-end justify-between gap-2 text-left">
            <div><PosterMeta card={card} institutionName={theme.institutionName} /><p className="mt-2 text-xs font-bold">{dateLabel}</p></div>
            {qrValue && <QRCodeSVG value={qrValue} size={58} bgColor="#ffffff" fgColor="#231f20" includeMargin />}
          </footer>
        </div>
      )}
      {layout === "celebration" && (
        <div className="relative z-10 flex h-full flex-col justify-between p-[8%]">
          <header className="flex items-center justify-between gap-3">
            <span className="rounded-full px-3 py-1.5 text-[0.58rem] font-black uppercase tracking-[0.14em]" style={{ color: theme.background, backgroundColor: theme.accent }}>{occasion.label}</span>
            {theme.showCountdown && <span className="rounded-full border border-white/45 bg-black/20 px-3 py-1.5 text-[0.62rem] font-bold">{countdownFor(card.celebration_at, card.timezone)}</span>}
          </header>
          <div className="my-auto">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.2em]" style={{ color: theme.accent }}>{occasion.eyebrow}</p>
            <h1 className={`mt-3 break-words leading-[0.9] ${titleSize} ${font}`}>{displayName}</h1>
            {framedPhoto && <div className="mt-5 h-24 w-full overflow-hidden rounded-2xl border-2 border-white/80 shadow-xl"><img src={photoUrl!} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${theme.photoX}% ${theme.photoY}%` }} /></div>}
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{card.title}</p>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6">{card.message || occasion.emotionalLine}</p>
          </div>
          <footer className="flex items-end justify-between gap-3 border-t border-white/35 pt-3">
            <div className="min-w-0"><PosterMeta card={card} institutionName={theme.institutionName} /><p className="mt-2 text-xs font-bold">{dateLabel}</p></div>
            {qrValue && <QRCodeSVG value={qrValue} size={58} bgColor="#ffffff" fgColor="#231f20" includeMargin />}
          </footer>
        </div>
      )}
      {fullBleedPhoto && theme.showDecorations !== false && <div className="pointer-events-none absolute inset-0 z-[1] border-[10px] border-white/15" />}
    </article>
  );
}
