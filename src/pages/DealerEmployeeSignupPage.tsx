import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { logAuditEvent } from "../lib/auditLog";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";

const SIGNUP_INTENT_KEY = "warrantyhub.signup_intent";
const SIGNUP_INVITE_CODE_KEY = "warrantyhub.signup_invite_code";
const DEALER_INVITES_KEY = "warrantyhub.local.dealer_employee_invites";
const LOCAL_USERS_KEY = "warrantyhub.local.users";
const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";
const LOCAL_DEALER_TEAM_MEMBERS_KEY = "warrantyhub.local.dealer_team_members";

type DealerInvite = {
  dealerId: string;
  code: string;
  dealerName?: string;
  createdAt: string;
};

function normalizeInviteCode(v: string) {
  return v.trim().toUpperCase();
}

function readInvitesByDealer(): Record<string, { code?: string; dealerName?: string; createdAt?: string }> {
  const raw = localStorage.getItem(DEALER_INVITES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { code?: string; dealerName?: string; createdAt?: string }>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function findInviteByCode(code: string): DealerInvite | null {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  const invites = readInvitesByDealer();
  for (const [dealerId, inv] of Object.entries(invites)) {
    const c = normalizeInviteCode(inv?.code ?? "");
    if (c && c === normalized) {
      return {
        dealerId,
        code: c,
        dealerName: (inv?.dealerName ?? "").toString() || undefined,
        createdAt: (inv?.createdAt ?? new Date().toISOString()).toString(),
      };
    }
  }
  return null;
}

function writeLocalUsers(rawUsers: unknown) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(rawUsers));
}

function readLocalDealerMemberships(): any[] {
  const raw = localStorage.getItem(LOCAL_DEALER_MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalDealerMemberships(items: any[]) {
  localStorage.setItem(LOCAL_DEALER_MEMBERSHIPS_KEY, JSON.stringify(items));
}

function readLocalDealerTeamMembers(): any[] {
  const raw = localStorage.getItem(LOCAL_DEALER_TEAM_MEMBERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDealerTeamMembers(items: any[]) {
  localStorage.setItem(LOCAL_DEALER_TEAM_MEMBERS_KEY, JSON.stringify(items));
}

function roleToDashboardPath(role: Role) {
  if (role === "UNASSIGNED") return "/request-access";
  if (role === "SUPER_ADMIN") return "/platform";
  if (role === "ADMIN") return "/company-dashboard";
  if (role === "PROVIDER") return "/provider-dashboard";
  if (role === "DEALER_ADMIN") return "/dealer-admin";
  if (role === "DEALER_EMPLOYEE") return "/dealer-dashboard";
  return "/dealer-dashboard";
}

export function DealerEmployeeSignupPage() {
  const { signUp, isLoading, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suppressRedirect, setSuppressRedirect] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("code") ?? "";
    if (!fromQuery.trim()) return;
    setInviteCode((prev) => prev || fromQuery);
  }, [searchParams]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuppressRedirect(true);
    try {
      const mode = getAppMode();
      if (mode !== "local") {
        throw new Error("Invite-only employee signup is not enabled in Supabase mode yet");
      }

      const normalizedCode = normalizeInviteCode(inviteCode);
      const invite = findInviteByCode(normalizedCode);
      if (!invite) {
        throw new Error("Invalid invite code");
      }

      try {
        localStorage.setItem(SIGNUP_INTENT_KEY, "DEALER_EMPLOYEE");
        localStorage.setItem(SIGNUP_INVITE_CODE_KEY, normalizedCode);
      } catch {
      }
      await signUp(email, password);

      const targetEmail = email.trim().toLowerCase();
      const rawUsers = localStorage.getItem(LOCAL_USERS_KEY);
      let users: any[] = [];
      if (rawUsers) {
        try {
          const parsed = JSON.parse(rawUsers) as unknown;
          users = Array.isArray(parsed) ? (parsed as any[]) : [];
        } catch {
          users = [];
        }
      }
      if (Array.isArray(users) && targetEmail) {
        const idx = users.findIndex((u) => (u?.email ?? "").toString().trim().toLowerCase() === targetEmail);
        if (idx >= 0) {
          const next = [...users];
          next[idx] = {
            ...next[idx],
            role: "DEALER_EMPLOYEE",
            isActive: true,
            companyName: invite.dealerName ?? (next[idx]?.companyName ?? undefined),
            dealerId: invite.dealerId,
          };
          writeLocalUsers(next);

          const joinedUserId = (next[idx]?.id ?? "").toString();
          if (joinedUserId) {
            logAuditEvent({
              kind: "DEALER_EMPLOYEE_JOINED",
              actorUserId: joinedUserId,
              actorEmail: targetEmail,
              actorRole: "DEALER_EMPLOYEE",
              dealerId: invite.dealerId,
              entityType: "dealer_membership",
              entityId: joinedUserId,
              message: `Joined dealership ${invite.dealerId}`,
            });
          }

          const createdAt = new Date().toISOString();
          const memberships = readLocalDealerMemberships();
          const userId = joinedUserId;
          if (userId) {
            const exists = memberships.some((m) => m?.dealerId === invite.dealerId && m?.userId === userId);
            if (!exists) {
              writeLocalDealerMemberships([
                { id: crypto.randomUUID(), dealerId: invite.dealerId, userId, role: "DEALER_EMPLOYEE", status: "ACTIVE", createdAt },
                ...memberships,
              ]);
            }
          }

          if (userId) {
            const team = readLocalDealerTeamMembers();
            const teamEmail = targetEmail;
            const existingTeamIdx = team.findIndex((m) => (m?.dealerId ?? "") === invite.dealerId && (m?.email ?? "").toString().trim().toLowerCase() === teamEmail);
            const item = {
              id: existingTeamIdx >= 0 ? (team[existingTeamIdx]?.id ?? crypto.randomUUID()) : crypto.randomUUID(),
              dealerId: invite.dealerId,
              email: teamEmail,
              role: "DEALER_EMPLOYEE",
              status: "ACTIVE",
              createdAt: existingTeamIdx >= 0 ? (team[existingTeamIdx]?.createdAt ?? createdAt) : createdAt,
            };
            const nextTeam = [...team];
            if (existingTeamIdx >= 0) nextTeam[existingTeamIdx] = item;
            else nextTeam.unshift(item);
            writeLocalDealerTeamMembers(nextTeam);
          }
        }
      }

      const refreshed = await refreshUser();
      navigate(roleToDashboardPath(refreshed?.role ?? "DEALER_EMPLOYEE"), { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      if (typeof err === "string") {
        setError(err);
        return;
      }
      try {
        setError(JSON.stringify(err));
      } catch {
        setError("Sign up failed");
      }
    } finally {
      setSuppressRedirect(false);
    }
  };

  useEffect(() => {
    if (suppressRedirect) return;
    if (!user) return;
    navigate(roleToDashboardPath(user.role), { replace: true });
  }, [navigate, suppressRedirect, user]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6">
              <h1 className="text-2xl font-semibold leading-none tracking-tight font-display">Dealer Employee Signup</h1>
              <p className="text-sm text-muted-foreground">Create an account to join your dealership team before launch.</p>
            </div>

            <div className="p-6 pt-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="inviteCode">
                    Invite code
                  </label>
                  <Input
                    id="inviteCode"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="ABCD-1234"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@dealership.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                  />
                </div>

                {error ? <div className="text-sm text-destructive">{error}</div> : null}

                <Button type="submit" className="w-full bg-yellow-300 text-slate-900 hover:bg-yellow-200" disabled={isLoading}>
                  Create Account
                </Button>

                <div className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/sign-in" className="text-primary underline underline-offset-4">
                    Sign In
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
