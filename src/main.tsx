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
