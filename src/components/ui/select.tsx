import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { ChevronDown } from "lucide-react";

interface SelectContextValue {
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}
const SelectContext = React.createContext<SelectContextValue>({
  value: "", onValueChange: () => {}, open: false, setOpen: () => {}, triggerRef: { current: null },
});

function Select({
  children, value, defaultValue, onValueChange,
}: {
  children: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const current = value ?? internal;
  const change = React.useCallback(
    (v: string) => { setInternal(v); onValueChange?.(v); setOpen(false); },
    [onValueChange],
  );
  return (
    <SelectContext.Provider value={{ value: current, onValueChange: change, open, setOpen, triggerRef }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);
    return (
      <button
        ref={(node) => {
          ctx.triggerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        onClick={() => ctx.setOpen(!ctx.open)}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

function SelectValue({
  placeholder,
  labels,
}: {
  placeholder?: string;
  labels?: Record<string, React.ReactNode>;
}) {
  const ctx = React.useContext(SelectContext);
  return (
    <span className={ctx.value ? "" : "text-muted-foreground"}>
      {ctx.value ? (labels?.[ctx.value] ?? ctx.value) : (placeholder || "")}
    </span>
  );
}

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(SelectContext);
    const { open, setOpen } = ctx;
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });

    React.useLayoutEffect(() => {
      if (!open) return;
      const updatePosition = () => {
        const trigger = ctx.triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      };

      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }, [ctx.triggerRef, open]);

    React.useEffect(() => {
      if (!open) return;
      const handle = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node) &&
          ctx.triggerRef.current &&
          !ctx.triggerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, [ctx.triggerRef, open, setOpen]);

    if (!open) return null;
    return createPortal(
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          minWidth: position.width,
        }}
        className={cn(
          "z-50 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  }
);
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext);
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={ctx.value === value}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm px-2.5 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        ctx.value === value && "bg-accent text-accent-foreground",
        className
      )}
      onClick={() => {
        ctx.onValueChange(value);
      }}
      {...props}
    >
      {children}
    </div>
  );
});
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
