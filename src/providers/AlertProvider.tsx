import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/ui/button";

type AlertOptions = {
  title?: string;
  message: string;
  okText?: string;
};

type AlertState = {
  open: boolean;
  title: string;
  message: string;
  okText: string;
};

type AlertContextValue = {
  alert(opts: AlertOptions): Promise<void>;
};

const AlertContext = createContext<AlertContextValue | null>(null);

declare global {
  interface Window {
    __warrantyhub_alert__?: (message: string, title?: string) => void;
  }
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>({
    open: false,
    title: "Notice",
    message: "",
    okText: "OK",
  });

  const [resolver, setResolver] = useState<(() => void) | null>(null);

  const alert = useCallback(async (opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setResolver(() => resolve);
      setState({
        open: true,
        title: opts.title ?? "Notice",
        message: opts.message,
        okText: opts.okText ?? "OK",
      });
    });
  }, []);

  useEffect(() => {
    window.__warrantyhub_alert__ = (message: string, title?: string) => {
      void alert({ message, title });
    };
    return () => {
      delete window.__warrantyhub_alert__;
    };
  }, [alert]);

  const onClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    const r = resolver;
    setResolver(null);
    r?.();
  }, [resolver]);

  const value: AlertContextValue = useMemo(() => ({ alert }), [alert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      {state.open
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
              <div className="absolute inset-0 bg-black/50" onClick={onClose} />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border bg-card shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <div className="font-semibold">{state.title}</div>
                  </div>
                  <div className="px-6 py-5 text-sm text-muted-foreground whitespace-pre-wrap">{state.message}</div>
                  <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
                    <Button onClick={onClose}>
                      {state.okText}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within AlertProvider");
  return ctx;
}
