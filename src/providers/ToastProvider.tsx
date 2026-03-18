import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "info";

type ToastOptions = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  withCheckAnimation?: boolean;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
  variant: ToastVariant;
  withCheckAnimation: boolean;
};

type ToastContextValue = {
  toast(opts: ToastOptions): void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function uid() {
  return crypto.randomUUID();
}

function CheckAnimation() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="wh-toast-check"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" className="wh-toast-check__ring" />
      <path d="M7.5 12.5l3 3L16.5 9.5" className="wh-toast-check__tick" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const handle = timeoutsRef.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = uid();
      const item: ToastItem = {
        id,
        title: (opts.title ?? "Notice").trim() || "Notice",
        message: opts.message,
        variant: opts.variant ?? "info",
        withCheckAnimation: Boolean(opts.withCheckAnimation),
      };

      setToasts((t) => [item, ...t].slice(0, 3));

      const duration = typeof opts.durationMs === "number" ? opts.durationMs : 4200;
      const handle = window.setTimeout(() => {
        remove(id);
      }, Math.max(1200, duration));
      timeoutsRef.current.set(id, handle);
    },
    [remove],
  );

  useEffect(() => {
    return () => {
      for (const handle of timeoutsRef.current.values()) {
        window.clearTimeout(handle);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const value: ToastContextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length
        ? createPortal(
            <div className="fixed right-4 top-4 z-[120] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
              {toasts.map((t) => {
                const border =
                  t.variant === "success"
                    ? "border-emerald-200"
                    : t.variant === "error"
                      ? "border-red-200"
                      : "border-slate-200";

                const bg =
                  t.variant === "success"
                    ? "bg-emerald-50"
                    : t.variant === "error"
                      ? "bg-red-50"
                      : "bg-white";

                return (
                  <div
                    key={t.id}
                    role="status"
                    className={
                      "wh-toast-enter rounded-2xl border shadow-card overflow-hidden " +
                      border +
                      " " +
                      bg
                    }
                  >
                    <div className="flex items-start gap-3 p-4">
                      <div className="mt-0.5">
                        {t.withCheckAnimation && t.variant === "success" ? <CheckAnimation /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">{t.title}</div>
                        <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{t.message}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="text-slate-500 hover:text-slate-900 text-sm leading-none px-2"
                        aria-label="Dismiss notification"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
