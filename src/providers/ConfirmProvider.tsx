import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/ui/button";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  resolve: ((v: boolean) => void) | null;
};

type ConfirmContextValue = {
  confirm(opts: ConfirmOptions): Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

declare global {
  interface Window {
    __warrantyhub_confirm__?: (message: string, title?: string) => Promise<boolean>;
  }
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "Confirm",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    resolve: null,
  });

  const confirm = useCallback(async (opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        open: true,
        title: opts.title ?? "Confirm",
        message: opts.message,
        confirmText: opts.confirmText ?? "Confirm",
        cancelText: opts.cancelText ?? "Cancel",
        resolve,
      });
    });
  }, []);

  useEffect(() => {
    window.__warrantyhub_confirm__ = (message: string, title?: string) => confirm({ message, title });
    return () => {
      delete window.__warrantyhub_confirm__;
    };
  }, [confirm]);

  const onClose = useCallback((result: boolean) => {
    const resolver = state.resolve;
    setState((s) => ({ ...s, open: false, resolve: null }));
    resolver?.(result);
  }, [state.resolve]);

  const value: ConfirmContextValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state.open
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
              <div className="absolute inset-0 bg-black/50" onClick={() => onClose(false)} />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="w-full max-w-md rounded-2xl border bg-card shadow-card overflow-hidden"
                >
                  <div className="px-6 py-4 border-b">
                    <div className="font-semibold">{state.title}</div>
                  </div>
                  <div className="px-6 py-5 text-sm text-muted-foreground whitespace-pre-wrap">{state.message}</div>
                  <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => onClose(false)}>
                      {state.cancelText}
                    </Button>
                    <Button onClick={() => onClose(true)}>
                      {state.confirmText}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
