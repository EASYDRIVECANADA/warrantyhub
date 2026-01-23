import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { AuthProvider } from "./providers/AuthProvider";
import { ConfirmProvider } from "./providers/ConfirmProvider";
import { AlertProvider } from "./providers/AlertProvider";

const queryClient = new QueryClient();

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
          <ConfirmProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConfirmProvider>
        </AlertProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
