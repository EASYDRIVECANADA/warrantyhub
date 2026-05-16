# Dealer Team Temporary Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let dealer admins create brand-new employee accounts from Team Management without entering a password, then show a generated temporary password once.

**Architecture:** Keep `src/pages/DealerTeamPage.tsx` as the user-facing workflow and keep `supabase/functions/dealer-team-tools/index.ts` as the privileged account-creation boundary. Generate the production temporary password inside the edge function; in local mode, generate a temporary password inside the page so local development still works without Supabase.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, React Query, Supabase Edge Functions, Deno.

---

## File Structure

- Modify `supabase/functions/dealer-team-tools/index.ts`: remove client-supplied passwords from create/update employee actions, generate temporary passwords server-side, and return the password only from `create_employee`.
- Modify `src/pages/DealerTeamPage.tsx`: remove password fields, remove password validation, handle the new `temporaryPassword` response, show a one-time credential dialog, and keep local mode functional.
- Create `src/test/dealerTeamTemporaryPassword.test.tsx`: verify the Add Member form has no password fields and local creation shows a temporary password dialog.

---

### Task 1: Add Failing Frontend Coverage

**Files:**
- Create: `src/test/dealerTeamTemporaryPassword.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/test/dealerTeamTemporaryPassword.test.tsx` with this content:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealerTeamPage } from "../pages/DealerTeamPage";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "dealer-admin-1",
      email: "admin@example.com",
      role: "DEALER_ADMIN",
      dealerId: "dealer-1",
    },
  }),
}));

vi.mock("../lib/runtime", () => ({
  getAppMode: () => "local",
}));

vi.mock("../lib/auditLog", () => ({
  logAuditEvent: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <DealerTeamPage />
    </QueryClientProvider>,
  );
}

describe("DealerTeamPage temporary password flow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not ask dealer admins to enter employee passwords", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add first member/i }));

    expect(screen.getByText("Add New Team Member")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter password")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Confirm password")).not.toBeInTheDocument();
    expect(screen.queryByText("Password Requirements:")).not.toBeInTheDocument();
  });

  it("shows a one-time temporary password after creating a local employee", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add first member/i }));
    await user.type(screen.getByPlaceholderText("John"), "John");
    await user.type(screen.getByPlaceholderText("Doe"), "Doe");
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "555-123-4567");
    await user.type(screen.getByPlaceholderText("john.doe@company.com"), "employee@example.com");
    await user.click(screen.getByRole("button", { name: /^add member$/i }));

    await waitFor(() => {
      expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    });

    expect(screen.getByText("employee@example.com")).toBeInTheDocument();
    expect(screen.getByText("This password is shown once. Share it securely with the employee.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy password/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/test/dealerTeamTemporaryPassword.test.tsx
```

Expected: FAIL. The first test fails because the current Add Member form still renders `Enter password`, `Confirm password`, and `Password Requirements:`. The second test fails because no temporary-password dialog exists.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add src/test/dealerTeamTemporaryPassword.test.tsx
git commit -m "test: cover dealer team temporary password flow"
```

---

### Task 2: Generate Temporary Passwords In The Edge Function

**Files:**
- Modify: `supabase/functions/dealer-team-tools/index.ts`

- [ ] **Step 1: Add server-side password generation helpers**

In `supabase/functions/dealer-team-tools/index.ts`, insert these helpers after `normalizeRole`:

```ts
const TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_SYMBOLS = "!@#$%^&*";
const TEMP_PASSWORD_ALL = `${TEMP_PASSWORD_UPPER}${TEMP_PASSWORD_LOWER}${TEMP_PASSWORD_DIGITS}${TEMP_PASSWORD_SYMBOLS}`;

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function pickChar(chars: string) {
  return chars[randomIndex(chars.length)]!;
}

function shuffleChars(chars: string[]) {
  const next = [...chars];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

function generateTemporaryPassword() {
  const chars = [
    pickChar(TEMP_PASSWORD_UPPER),
    pickChar(TEMP_PASSWORD_LOWER),
    pickChar(TEMP_PASSWORD_DIGITS),
    pickChar(TEMP_PASSWORD_SYMBOLS),
  ];

  while (chars.length < 16) {
    chars.push(pickChar(TEMP_PASSWORD_ALL));
  }

  return shuffleChars(chars).join("");
}
```

- [ ] **Step 2: Remove password from the request body type**

In the `Body` type, replace the `create_employee` employee shape:

```ts
employee: {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  password: string;
  role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
};
```

with:

```ts
employee: {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
};
```

Then replace the `update_employee` employee shape:

```ts
employee: {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  password: string;
  role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
};
```

with:

```ts
employee: {
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
  role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
};
```

- [ ] **Step 3: Update `create_employee` to generate and return the temporary password**

Inside the `if (action === "create_employee")` block, replace:

```ts
const password = safeTrim(e.password);
```

with:

```ts
const temporaryPassword = generateTemporaryPassword();
```

Remove this validation block:

```ts
if (!password) return json(400, { error: "password is required" });
```

Replace the `createUser` call:

```ts
const created = await svc.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
} as any);

if (created.error) return json(400, { error: created.error.message });
```

with:

```ts
const created = await svc.auth.admin.createUser({
  email,
  password: temporaryPassword,
  email_confirm: true,
} as any);

if (created.error) {
  const rawMessage = created.error.message || "Could not create employee account";
  const message = rawMessage.toLowerCase().includes("already")
    ? "An account with this email already exists."
    : rawMessage;
  return json(400, { error: message });
}
```

Replace the successful response:

```ts
return json(200, { dealerMemberId: (memberUpsert.data as any)?.id ?? null, userId: newUserId });
```

with:

```ts
return json(200, {
  dealerMemberId: (memberUpsert.data as any)?.id ?? null,
  userId: newUserId,
  temporaryPassword,
});
```

- [ ] **Step 4: Update `update_employee` to leave passwords unchanged**

Inside the `if (action === "update_employee")` block, remove:

```ts
const password = safeTrim(e.password);
```

Remove this validation block:

```ts
if (!password) return json(400, { error: "password is required" });
```

Replace:

```ts
const updUser = await svc.auth.admin.updateUserById(targetUserId, {
  email,
  password,
} as any);
```

with:

```ts
const updUser = await svc.auth.admin.updateUserById(targetUserId, {
  email,
} as any);
```

- [ ] **Step 5: Inspect the edge function for removed password references**

Run:

```bash
rg -n "password is required|e\\.password|password," supabase/functions/dealer-team-tools/index.ts
```

Expected: no output for `password is required` or `e.password`. The only remaining password reference in `create_employee` should be `password: temporaryPassword`.

- [ ] **Step 6: Commit the edge function change**

Run:

```bash
git add supabase/functions/dealer-team-tools/index.ts
git commit -m "feat: generate dealer employee temporary passwords server-side"
```

---

### Task 3: Update Dealer Team UI And Local Mode

**Files:**
- Modify: `src/pages/DealerTeamPage.tsx`

- [ ] **Step 1: Update imports**

In `src/pages/DealerTeamPage.tsx`, replace the lucide import:

```ts
import { Users, UserPlus, Shield, UserCheck, UserX, Mail, Phone, Lock, User, Plus, Pencil, Loader2 } from "lucide-react";
```

with:

```ts
import { Check, Copy, Users, UserPlus, Shield, UserCheck, UserX, Mail, Phone, User, Plus, Pencil, Loader2 } from "lucide-react";
```

Add this dialog import below the existing UI imports:

```ts
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
```

- [ ] **Step 2: Change the draft and response types**

Replace:

```ts
type DealerTeamEmployeeDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  password2: string;
  role: DealerTeamRole;
};
```

with:

```ts
type DealerTeamEmployeeDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: DealerTeamRole;
};

type CreatedEmployeeCredentials = {
  email: string;
  temporaryPassword: string;
};

type CreateEmployeeResponse = {
  dealerMemberId: string | null;
  userId: string;
  temporaryPassword: string;
};
```

- [ ] **Step 3: Replace password validation with a local temporary password helper**

Remove the entire `validatePassword` function.

Insert this function where `validatePassword` was:

```ts
function generateLocalTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = `${upper}${lower}${digits}${symbols}`;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!;
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  while (chars.length < 16) {
    chars.push(pick(all));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }

  return chars.join("");
}
```

- [ ] **Step 4: Update component state**

Replace the `draft` state initializer:

```ts
const [draft, setDraft] = useState<DealerTeamEmployeeDraft>({
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  password: "",
  password2: "",
  role: "DEALER_EMPLOYEE",
});
```

with:

```ts
const [draft, setDraft] = useState<DealerTeamEmployeeDraft>({
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  role: "DEALER_EMPLOYEE",
});
const [createdCredentials, setCreatedCredentials] = useState<CreatedEmployeeCredentials | null>(null);
const [passwordCopied, setPasswordCopied] = useState(false);
```

- [ ] **Step 5: Change create mutation validation and return value**

Inside `createEmployeeMutation`, remove:

```ts
const password = draft.password;
```

Remove these validation lines:

```ts
if (!password) throw new Error("Password is required");
const pwValidation = validatePassword(password);
if (!pwValidation.valid) throw new Error(`Password requirements not met: ${pwValidation.errors.join(", ")}`);
if (password !== draft.password2) throw new Error("Passwords do not match");
```

In the local branch, insert:

```ts
const temporaryPassword = generateLocalTemporaryPassword();
```

before `const items = read();`.

In the local `writeLocalUsersRaw` call, replace:

```ts
password,
```

with:

```ts
password: temporaryPassword,
```

At the end of the local branch, replace:

```ts
return;
```

with:

```ts
return { email, temporaryPassword };
```

In the Supabase branch, replace:

```ts
await invokeEdgeFunction<{ dealerMemberId: string | null; userId: string }>("dealer-team-tools", {
  action: "create_employee",
  employee: {
    firstName,
    lastName,
    phone: phone || undefined,
    email,
    password,
    role: draft.role,
  },
});
```

with:

```ts
const response = await invokeEdgeFunction<CreateEmployeeResponse>("dealer-team-tools", {
  action: "create_employee",
  employee: {
    firstName,
    lastName,
    phone: phone || undefined,
    email,
    role: draft.role,
  },
});
```

After the audit log call in the Supabase branch, add:

```ts
return { email, temporaryPassword: response.temporaryPassword };
```

- [ ] **Step 6: Show credentials after create success**

Replace the `createEmployeeMutation` `onSuccess` block:

```ts
onSuccess: async () => {
  setEditingDealerMemberId(null);
  setShowAddForm(false);
  
  setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
  await qc.invalidateQueries({ queryKey: ["dealer-team"] });
},
```

with:

```ts
onSuccess: async (result) => {
  setEditingDealerMemberId(null);
  setShowAddForm(false);
  setDraft({ firstName: "", lastName: "", phone: "", email: "", role: "DEALER_EMPLOYEE" });
  setPasswordCopied(false);
  if (result?.temporaryPassword) {
    setCreatedCredentials({ email: result.email, temporaryPassword: result.temporaryPassword });
  }
  await qc.invalidateQueries({ queryKey: ["dealer-team"] });
},
```

- [ ] **Step 7: Remove password from update mutation**

Inside `updateEmployeeMutation`, remove:

```ts
const password = draft.password;
```

Remove these validation lines:

```ts
if (!password) throw new Error("Password is required");
const pwValidation = validatePassword(password);
if (!pwValidation.valid) throw new Error(`Password requirements not met: ${pwValidation.errors.join(", ")}`);
if (password !== draft.password2) throw new Error("Passwords do not match");
```

Replace the Supabase update request:

```ts
await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", {
  action: "update_employee",
  dealerMemberId,
  employee: {
    firstName,
    lastName,
    phone: phone || undefined,
    email,
    password,
    role: draft.role,
  },
});
```

with:

```ts
await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", {
  action: "update_employee",
  dealerMemberId,
  employee: {
    firstName,
    lastName,
    phone: phone || undefined,
    email,
    role: draft.role,
  },
});
```

Replace the `updateEmployeeMutation` `onSuccess` draft reset:

```ts
setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
```

with:

```ts
setDraft({ firstName: "", lastName: "", phone: "", email: "", role: "DEALER_EMPLOYEE" });
```

- [ ] **Step 8: Update cancel and edit draft handling**

In `handleCancel`, replace:

```ts
setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
```

with:

```ts
setDraft({ firstName: "", lastName: "", phone: "", email: "", role: "DEALER_EMPLOYEE" });
```

In `handleEdit`, replace:

```ts
setDraft({
  firstName: m.firstName ?? "",
  lastName: m.lastName ?? "",
  phone: m.phone ?? "",
  email: m.email,
  password: "",
  password2: "",
  role: m.role,
});
```

with:

```ts
setDraft({
  firstName: m.firstName ?? "",
  lastName: m.lastName ?? "",
  phone: m.phone ?? "",
  email: m.email,
  role: m.role,
});
```

- [ ] **Step 9: Remove password fields from JSX**

Find the second form grid that currently includes email, password, and confirm fields:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
  <div className="space-y-1.5 sm:col-span-2">
    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
      <Mail className="w-3.5 h-3.5" />
      Email
    </div>
    <Input
      type="email"
      value={draft.email}
      onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
      placeholder="john.doe@company.com"
      className="bg-background/70"
    />
  </div>
  <div className="space-y-1.5">
    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
      <Lock className="w-3.5 h-3.5" />
      Password
    </div>
    <Input
      type="password"
      value={draft.password}
      onChange={(e) => setDraft((p) => ({ ...p, password: e.target.value }))}
      placeholder="Enter password"
      className="bg-background/70"
    />
  </div>
  <div className="space-y-1.5">
    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
      <Lock className="w-3.5 h-3.5" />
      Confirm
    </div>
    <Input
      type="password"
      value={draft.password2}
      onChange={(e) => setDraft((p) => ({ ...p, password2: e.target.value }))}
      placeholder="Confirm password"
      className="bg-background/70"
    />
  </div>
</div>
```

Replace it with:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
  <div className="space-y-1.5 sm:col-span-2">
    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
      <Mail className="w-3.5 h-3.5" />
      Email
    </div>
    <Input
      type="email"
      value={draft.email}
      onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
      placeholder="john.doe@company.com"
      className="bg-background/70"
    />
  </div>
  <div className="sm:col-span-2 rounded-lg border bg-background/60 px-4 py-3 text-xs text-muted-foreground">
    A temporary password will be generated after the employee is created.
  </div>
</div>
```

Remove the entire password requirements block that starts with:

```tsx
{draft.password && (
```

and ends with its matching `)}`.

- [ ] **Step 10: Add the temporary password dialog**

Inside the `PageShell` children, immediately before the existing `{error && (` block, add:

```tsx
<Dialog
  open={Boolean(createdCredentials)}
  onOpenChange={(open) => {
    if (!open) {
      setCreatedCredentials(null);
      setPasswordCopied(false);
    }
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Temporary password created</DialogTitle>
      <DialogDescription>
        This password is shown once. Share it securely with the employee.
      </DialogDescription>
    </DialogHeader>

    {createdCredentials && (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="text-xs font-medium text-muted-foreground">Employee</div>
          <div className="mt-1 text-sm font-medium">{createdCredentials.email}</div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="text-xs font-medium text-muted-foreground">Temporary password</div>
          <div className="mt-2 flex items-center gap-2">
            <Input readOnly value={createdCredentials.temporaryPassword} className="font-mono" />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                void navigator.clipboard.writeText(createdCredentials.temporaryPassword).then(() => {
                  setPasswordCopied(true);
                });
              }}
            >
              {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {passwordCopied ? "Copied" : "Copy password"}
            </Button>
          </div>
        </div>
      </div>
    )}
  </DialogContent>
</Dialog>
```

- [ ] **Step 11: Inspect for removed draft password references**

Run:

```bash
rg -n "draft\\.password|password2|validatePassword|Password Requirements|Enter password|Confirm password|Lock" src/pages/DealerTeamPage.tsx
```

Expected: no output.

- [ ] **Step 12: Run the focused test**

Run:

```bash
npm test -- src/test/dealerTeamTemporaryPassword.test.tsx
```

Expected: PASS.

- [ ] **Step 13: Commit the frontend change**

Run:

```bash
git add src/pages/DealerTeamPage.tsx
git commit -m "feat: show dealer employee temporary passwords"
```

---

### Task 4: Final Verification

**Files:**
- Verify: `src/test/dealerTeamTemporaryPassword.test.tsx`
- Verify: `src/pages/DealerTeamPage.tsx`
- Verify: `supabase/functions/dealer-team-tools/index.ts`

- [ ] **Step 1: Run the full Vitest suite**

Run:

```bash
npm test
```

Expected: PASS for all Vitest files.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript build succeeds and Vite emits the production bundle.

- [ ] **Step 3: Check the working tree**

Run:

```bash
git status --short
```

Expected: no uncommitted changes from the implementation tasks. The pre-existing unrelated modification to `src/pages/dealership/settings/ConfigurationPage.tsx` may still appear and must not be reverted.

- [ ] **Step 4: Record verification in the final response**

Report the exact test commands and their results:

```text
npm test
npm run build
```

Also mention that `src/pages/dealership/settings/ConfigurationPage.tsx` was pre-existing worktree state and was not touched.

---

## Self-Review

- Spec coverage: Task 2 implements server-side temporary password generation and removes password updates. Task 3 removes password fields, shows the one-time dialog, preserves local mode, and keeps create/edit scoped to the existing page. Task 4 covers verification.
- Placeholder scan: The plan contains exact file paths, code snippets, commands, expected command results, and commit commands.
- Type consistency: `CreateEmployeeResponse.temporaryPassword` is returned by the edge function and consumed by `DealerTeamPage`; `CreatedEmployeeCredentials` is local UI state only.
