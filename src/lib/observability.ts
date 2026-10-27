// Minimal, privacy-preserving error reporting. No third-party service is wired in: add one with addErrorSink().
// NEVER pass message bodies, emails or tokens in `context`; scrub() is a safety net, not permission.
export interface ReportedError { name: string; message: string; stack: string; context: Record<string, string>; path: string; at: string }
type Sink = (e: ReportedError) => void;
const sinks: Sink[] = [];
export const addErrorSink = (s: Sink) => { sinks.push(s); };

export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[token]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(apikey|authorization|password|secret)\b\s*[:=]\s*\S+/gi, "$1 [redacted]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[long-string]");
}

export function reportError(error: unknown, context: Record<string, string> = {}): void {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const safeContext: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) safeContext[k] = scrub(String(v)).slice(0, 200);
  const report: ReportedError = {
    name: err.name, message: scrub(err.message).slice(0, 500), stack: scrub((err.stack ?? "").split("\n").slice(0, 8).join("\n")),
    context: safeContext, path: typeof location !== "undefined" ? location.pathname : "", at: new Date().toISOString(),
  };
  if (typeof console !== "undefined") console.error("[campusconnect]", report.name, report.message, report.context);
  for (const s of sinks) { try { s(report); } catch { /* a failing sink must never break the app */ } }
}

export function installGlobalHandlers(): void {
  window.addEventListener("error", (e) => reportError(e.error ?? e.message, { source: "window.error" }));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { source: "unhandledrejection" }));
}
