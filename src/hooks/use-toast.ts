import { useToast as useToastOriginal } from "../providers/ToastProvider";

export function useToast() {
  const { toast: originalToast } = useToastOriginal();

  const toast = (opts: {
    title?: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => {
    originalToast({
      title: opts.title,
      message: opts.description || opts.title || "",
      variant: opts.variant === "destructive" ? "error" : "success",
    });
  };

  return { toast };
}
