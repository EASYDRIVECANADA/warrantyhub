import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Shield } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { logAuditEvent } from "../lib/auditLog";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { useAuth } from "../providers/AuthProvider";

const SIGNUP_INTENT_KEY = "warrantyhub.signup_intent";
const SIGNUP_INVITE_CODE_KEY = "warrantyhub.signup_invite_code";
const DEALER_INVITES_KEY = "warrantyhub.local.dealer_employee_invites";
const LOCAL_USERS_KEY = "warrantyhub.local.users";
const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";
const LOCAL_DEALER_TEAM_MEMBERS_KEY = "warrantyhub.local.dealer_team_members";

const whiteLogoUrl = new URL("../../images/warrantyhubwhite.png", import.meta.url).href;

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

  const isEmailConfirmationNotice = Boolean(error && error.toLowerCase().includes("confirm your email"));

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
      const normalizedCode = normalizeInviteCode(inviteCode);

      if (mode === "supabase") {
        localStorage.setItem(SIGNUP_INTENT_KEY, "DEALER_EMPLOYEE");
        localStorage.setItem(SIGNUP_INVITE_CODE_KEY, normalizedCode);

        await signUp(email, password);

        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw new Error(sessionError.message);
        if (!sessionData.session) {
          throw new Error("Account created. Please confirm your email, then sign in.");
        }

        const { error: joinError } = await supabase.rpc("join_dealer_by_invite", { invite_code: normalizedCode });
        if (joinError) throw new Error(joinError.message);

        const refreshed = await refreshUser();
        navigate(roleToDashboardPath(refreshed?.role ?? "DEALER_EMPLOYEE"), { replace: true });
        return;
      }

      if (mode !== "local") {
        throw new Error("Supabase is not configured");
      }

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
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden lg:flex bg-primary text-white">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/15" />

          <div className="relative z-10 w-full p-12 flex flex-col">
            <div className="flex items-center gap-3">
              <Link to="/find-insurance" className="inline-flex">
                <img src={whiteLogoUrl} alt="Bridge Warranty" className="h-16 w-auto object-contain" />
              </Link>
            </div>

            <div className="mt-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">
                <Shield className="w-4 h-4 text-yellow-300" />
                Invited to Join a Dealership?
              </span>
            </div>

            <h1 className="mt-8 font-display text-4xl font-bold leading-tight">
              Join Your Team
              <span className="block text-yellow-300">In Seconds</span>
            </h1>

            <p className="mt-4 text-white/85 max-w-md text-sm">
              Use your invite code to create your employee account and get access to your dealership workspace.
            </p>

            <div className="mt-8 space-y-3 text-sm">
              {["Enter your invite code", "Create your login", "Access your dealership dashboard"].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-yellow-300/20 border border-yellow-300/30 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-yellow-300" />
                  </div>
                  <div className="text-white/90">{t}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto text-xs text-white/70 pt-10">Need an invite? Ask your dealership admin.</div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 lg:py-0 bg-slate-50">
          <div className="w-full max-w-lg">
            <div className="flex flex-col space-y-1.5">
              <h1 className="text-3xl font-semibold leading-none tracking-tight font-display">Dealer Employee Signup</h1>
              <p className="text-sm text-muted-foreground">Create an account to join your dealership team before launch.</p>
            </div>

            <div className="mt-8">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="rounded-xl border bg-white p-6 shadow-card">
                  <div className="space-y-4">
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

                    {error ? (
                      isEmailConfirmationNotice ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{error}</div>
                      ) : (
                        <div className="text-sm text-destructive">{error}</div>
                      )
                    ) : null}

                    <Button
                      type="submit"
                      className="w-full bg-yellow-300 text-slate-900 hover:bg-yellow-200"
                      disabled={isLoading}
                    >
                      Create Account
                    </Button>

                    <div className="text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <Link to="/sign-in" className="text-primary underline underline-offset-4">
                        Sign In
                      </Link>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
