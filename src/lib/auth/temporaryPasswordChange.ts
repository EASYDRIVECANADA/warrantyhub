const TEMP_PASSWORD_EMAILS_KEY = "warrantyhub.auth.must_change_password_emails";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readMarkedEmails(): string[] {
  try {
    const raw = localStorage.getItem(TEMP_PASSWORD_EMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((email) => normalizeEmail(String(email))).filter(Boolean);
  } catch {
    return [];
  }
}

function writeMarkedEmails(emails: string[]) {
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (unique.length === 0) {
    localStorage.removeItem(TEMP_PASSWORD_EMAILS_KEY);
    return;
  }
  localStorage.setItem(TEMP_PASSWORD_EMAILS_KEY, JSON.stringify(unique));
}

export function markTemporaryPasswordEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  writeMarkedEmails([...readMarkedEmails(), normalized]);
}

export function clearTemporaryPasswordEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  writeMarkedEmails(readMarkedEmails().filter((item) => item !== normalized));
}

export function isTemporaryPasswordEmailMarked(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return readMarkedEmails().includes(normalized);
}
