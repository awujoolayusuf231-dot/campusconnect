import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { App } from "@/app/App";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";
import { installGlobalHandlers, reportError } from "@/lib/observability";
import { PWAInstallButton } from "@/app/PWAInstallButton";
import "./index.css";

installGlobalHandlers();
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("CampusConnect offline support could not be started.", error);
    });
  });
}
const queryClient = new QueryClient({ queryCache: new QueryCache({ onError: (e, q) => reportError(e, { source: "query", key: String(q.queryKey[0] ?? "") }) }), defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
   <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <PWAInstallButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
   </AppErrorBoundary>
  </StrictMode>,
);
