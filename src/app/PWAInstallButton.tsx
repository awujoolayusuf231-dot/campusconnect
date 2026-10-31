import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PWAInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installError, setInstallError] = useState("");
  const ios = typeof navigator !== "undefined" && isIOSDevice();

  useEffect(() => {
    const standalone = (window.matchMedia?.("(display-mode: standalone)").matches ?? false)
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (ios) {
      setShowIOSHelp(true);
      return;
    }
    if (!installPrompt) return;
    setInstallError("");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      console.error("CampusConnect installation could not be started.", error);
      setInstallError("Installation could not be started. Please try your browser's install option.");
    }
  }

  if (installed || (!ios && !installPrompt)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-bold text-fg shadow-lg transition hover:border-primary/30 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:left-5 lg:bottom-5"
      >
        <Download size={17} aria-hidden="true" />
        <span>Install app</span>
      </button>
      {installError && <p role="alert" className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-3 z-30 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-white p-3 text-xs text-danger shadow-lg sm:left-5 lg:bottom-[4.5rem]">{installError}</p>}

      {showIOSHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowIOSHelp(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="ios-install-title" className="text-lg font-extrabold text-fg">Install CampusConnect</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Open this page in Safari to add CampusConnect to your iPhone or iPad home screen:</p>
              </div>
              <button type="button" className="rounded-lg p-2 text-muted hover:bg-bg" aria-label="Close install instructions" onClick={() => setShowIOSHelp(false)}><X size={18} /></button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-fg">
              <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f8e9ea] text-primary"><Share size={16} aria-hidden="true" /></span>Tap the Share button in Safari.</li>
              <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f8e9ea] font-bold text-primary">+</span>Choose <strong>Add to Home Screen</strong>.</li>
              <li className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f8e9ea] text-primary"><Download size={16} aria-hidden="true" /></span>Tap <strong>Add</strong> to finish.</li>
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
