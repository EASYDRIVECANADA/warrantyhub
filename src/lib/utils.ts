import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeDigitsOnly(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function sanitizeMoney(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const intPart = parts[0] ?? "";
  const decimals = parts.slice(1).join("");
  if (parts.length <= 1) return intPart;
  return `${intPart}.${decimals.slice(0, 2)}`;
}

export function sanitizeLettersOnly(value: string) {
  return value
    .replace(/[^\p{L}\s'\-]/gu, "")
    .replace(/\s+/g, " ");
}

export function sanitizeWordsOnly(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s'\-]/gu, "")
    .replace(/\s+/g, " ");
}

export async function confirmProceed(message: string, title?: string) {
  const handler = window.__warrantyhub_confirm__;
  if (handler) return handler(message, title);
  return window.confirm(message);
}

export function alertMissing(message: string, title?: string) {
  const handler = window.__warrantyhub_alert__;
  if (handler) {
    handler(message, title);
    return;
  }
  window.alert(message);
}
