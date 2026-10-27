const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** 1234 -> "1.2K". Used for follower/following/post counts. */
export function formatCount(n: number): string { return n < 10_000 ? String(n) : compact.format(n); }
export function pluralize(n: number, one: string, many = one + "s"): string { return `${formatCount(n)} ${n === 1 ? one : many}`; }
