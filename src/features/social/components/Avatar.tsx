import { avatarUrl } from "../api";

export function Avatar({ name, path, size = 40 }: { name: string; path: string | null; size?: number }) {
  const url = avatarUrl(path);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return url
    ? <img src={url} alt="" loading="lazy" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <div aria-hidden="true" className="flex items-center justify-center rounded-full bg-primary text-primary-fg" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</div>;
}
