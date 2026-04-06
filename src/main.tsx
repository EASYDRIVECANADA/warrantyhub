import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { AuthProvider } from "./providers/AuthProvider";
import { ConfirmProvider } from "./providers/ConfirmProvider";
import { AlertProvider } from "./providers/AlertProvider";
import { ToastProvider } from "./providers/ToastProvider";
import { initSentry } from "./lib/sentry";

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const faviconUrl = new URL("../images/Bridge Warranty_Icon Only.png", import.meta.url).href;

const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (existingFavicon) {
  existingFavicon.href = faviconUrl;
} else {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = faviconUrl;
  document.head.appendChild(link);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AlertProvider>
          <ToastProvider>
            <ConfirmProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ConfirmProvider>
          </ToastProvider>
        </AlertProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
