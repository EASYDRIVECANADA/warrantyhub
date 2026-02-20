import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { LogOut, X } from "lucide-react";

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

  const isSignOut = state.title === "Sign Out";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state.open
        ? createPortal(
            <div className="fixed inset-0 z-[100]">
              <div className="absolute inset-0 bg-black/50" onClick={() => onClose(false)} />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {isSignOut ? (
                  <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border bg-card shadow-card overflow-hidden">
                    <div className="relative bg-primary text-white px-6 pt-6 pb-5">
                      <button
                        type="button"
                        className="absolute right-3 top-3 rounded-md p-2 text-white/80 hover:text-white hover:bg-white/10"
                        onClick={() => onClose(false)}
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>

                      <div className="flex items-center justify-center">
                        <div className="h-14 w-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                          <div className="h-10 w-10 rounded-full bg-yellow-300/15 border border-yellow-300/30 flex items-center justify-center">
                            <LogOut className="h-5 w-5 text-yellow-300" />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 text-center">
                        <div className="text-lg font-semibold">Sign Out</div>
                        <div className="mt-2 text-xs text-white/85 whitespace-pre-wrap">
                          Are you sure you want to sign out of <span className="text-yellow-300 font-semibold">Bridge Warranty</span>?
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-4">
                      <div className="space-y-3">
                        <Button className="w-full bg-red-500 text-white hover:bg-red-600" onClick={() => onClose(true)}>
                          <LogOut className="mr-2 h-4 w-4" />
                          Yes, Sign Me Out
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => onClose(false)}>
                          Stay on Page
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
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
                      <Button onClick={() => onClose(true)}>{state.confirmText}</Button>
                    </div>
                  </div>
                )}
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
