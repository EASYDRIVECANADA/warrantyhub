import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Bell, Clock, Mail, ShieldCheck } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { confirmProceed, sanitizeLettersOnly, sanitizeWordsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type RequestType = "DEALER" | "PROVIDER";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type MyAccessRequest = {
  status: AccessRequestStatus;
  createdAt: string;
  requestType: RequestType;
  company: string;
  name: string;
  rejectionMessage?: string;
};

const SIGNUP_INTENT_KEY = "warrantyhub.signup_intent";
const SIGNUP_INVITE_CODE_KEY = "warrantyhub.signup_invite_code";
const SIGNUP_DEALERSHIP_NAME_KEY = "warrantyhub.signup_dealership_name";
const SIGNUP_DEALERSHIP_PHONE_KEY = "warrantyhub.signup_dealership_phone";
const SIGNUP_DEALERSHIP_PROVINCE_KEY = "warrantyhub.signup_dealership_province";
const SIGNUP_DEALERSHIP_BUSINESS_LICENSE_KEY = "warrantyhub.signup_dealership_business_license";
const SIGNUP_DEALERSHIP_OMVIC_CERTIFICATE_KEY = "warrantyhub.signup_dealership_omvic_certificate";
const SIGNUP_DEALERSHIP_HST_NUMBER_KEY = "warrantyhub.signup_dealership_hst_number";

export function RequestAccessPage() {
  const navigate = useNavigate();
  const mode = useMemo(() => getAppMode(), []);
  const { user, refreshUser } = useAuth();

  const [signupIntent, setSignupIntent] = useState<string | null>(null);
  const [autoRequested, setAutoRequested] = useState(false);
  const [autoJoined, setAutoJoined] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [autoJoinError, setAutoJoinError] = useState<string | null>(null);

  const [requestType, setRequestType] = useState<RequestType>("DEALER");
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [myRequest, setMyRequest] = useState<MyAccessRequest | null>(null);
  const [loadingMyRequest, setLoadingMyRequest] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail((user?.email ?? "").trim());
  }, [user?.email]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIGNUP_INTENT_KEY);
      setSignupIntent((prev) => prev ?? v);
      if (v === "DEALERSHIP") {
        setRequestType("DEALER");
        const name = (localStorage.getItem(SIGNUP_DEALERSHIP_NAME_KEY) ?? "").trim();
        const phone = (localStorage.getItem(SIGNUP_DEALERSHIP_PHONE_KEY) ?? "").trim();
        const province = (localStorage.getItem(SIGNUP_DEALERSHIP_PROVINCE_KEY) ?? "").trim();
        const businessLicense = (localStorage.getItem(SIGNUP_DEALERSHIP_BUSINESS_LICENSE_KEY) ?? "").trim();
        const omvicCertificate = (localStorage.getItem(SIGNUP_DEALERSHIP_OMVIC_CERTIFICATE_KEY) ?? "").trim();
        const hstNumber = (localStorage.getItem(SIGNUP_DEALERSHIP_HST_NUMBER_KEY) ?? "").trim();
        if (name) setCompany((prev) => prev || name);
        setName((prev) => prev || "Dealership Admin");
        setMessage((prev) =>
          prev ||
          [
            "Dealership signup (Primary Account)",
            name ? `Dealership: ${name}` : null,
            phone ? `Phone: ${phone}` : null,
            province ? `Province: ${province}` : null,
            businessLicense ? `Ontario Business License: ${businessLicense}` : null,
            omvicCertificate ? `OMVIC Dealer Certificate: ${omvicCertificate}` : null,
            hstNumber ? `Tax Number (HST): ${hstNumber}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      if (v === "DEALER_EMPLOYEE") {
        setRequestType("DEALER");
        const code = (localStorage.getItem(SIGNUP_INVITE_CODE_KEY) ?? "").trim().toUpperCase();
        setMessage((prev) =>
          prev ||
          [
            "Dealer employee signup (Secondary Account)",
            code ? `Invite Code: ${code}` : null,
            "Please approve access and link this user to the correct dealership.",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (mode !== "supabase") return;
    if (signupIntent !== "DEALER_EMPLOYEE") return;
    if (autoJoinError) return;
    if (autoJoined || autoJoining) return;

    const code = (localStorage.getItem(SIGNUP_INVITE_CODE_KEY) ?? "").trim().toUpperCase();
    if (!code) return;
    if (user.role !== "UNASSIGNED") {
      setAutoJoined(true);
      try {
        localStorage.removeItem(SIGNUP_INTENT_KEY);
        localStorage.removeItem(SIGNUP_INVITE_CODE_KEY);
      } catch {
      }
      return;
    }

    setAutoJoining(true);
    setError(null);
    setAutoJoinError(null);

    void (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { error: joinError } = await supabase.rpc("join_dealer_by_invite", { invite_code: code });
        if (joinError) throw new Error(joinError.message);

        try {
          localStorage.removeItem(SIGNUP_INTENT_KEY);
          localStorage.removeItem(SIGNUP_INVITE_CODE_KEY);
        } catch {
        }

        setAutoJoined(true);
        await refreshUser();
      } catch (err) {
        setAutoJoinError(err instanceof Error ? err.message : "Failed to join dealership");
      } finally {
        setAutoJoining(false);
      }
    })();
  }, [autoJoinError, autoJoined, autoJoining, mode, refreshUser, signupIntent, user]);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "DEALER_EMPLOYEE") return;
    navigate("/dealer-dashboard", { replace: true });
  }, [navigate, user]);

  const submitRequest = async ({ auto }: { auto: boolean }) => {
    const fixedDealership = signupIntent === "DEALERSHIP";
    const rt: RequestType = fixedDealership ? "DEALER" : requestType;

    const c = company.trim();
    const n = (name.trim() || (fixedDealership ? "Dealership Admin" : "")).trim();
    const em = (user?.email ?? email).trim();
    const msg = message.trim();

    if (!c) {
      throw new Error(rt === "PROVIDER" ? "Provider Company Name is required." : "Company is required.");
    }
    if (!n) throw new Error("Name is required.");
    if (!em) throw new Error("Email is required.");

    if (!auto) {
      if (!(await confirmProceed("Submit access request?"))) return;
    }

    setStatus("submitting");
    setError(null);

    try {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");
        if (!user) throw new Error("You must be signed in to request access");

        const { error: insertError } = await supabase.from("access_requests").insert({
          request_type: rt,
          company: c,
          name: n,
          email: em,
          requester_id: user.id,
          message: msg || null,
        });

        if (insertError) throw insertError;
      } else {
        const key = "warrantyhub.local.access_requests";
        const raw = localStorage.getItem(key);
        const existing = raw ? (JSON.parse(raw) as unknown[]) : [];
        const next = [
          {
            id: crypto.randomUUID(),
            requesterId: user?.id,
            requestType: rt,
            company,
            name: n,
            email: em,
            message: msg || undefined,
            status: "PENDING",
            createdAt: new Date().toISOString(),
          },
          ...existing,
        ];
        localStorage.setItem(key, JSON.stringify(next));
      }

      setStatus("success");
      setMyRequest({
        status: "PENDING",
        createdAt: new Date().toISOString(),
        requestType: rt,
        company,
        name: n,
      });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Request failed");
      throw err;
    }
  };

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    setLoadingMyRequest(true);
    setError(null);

    void (async () => {
      try {
        if (mode === "supabase") {
          const supabase = getSupabaseClient();
          if (!supabase) throw new Error("Supabase is not configured");

          const { data, error: selectError } = await supabase
            .from("access_requests")
            .select("status, created_at, request_type, company, name, rejection_message")
            .eq("requester_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (selectError) throw selectError;
          if (!mounted) return;

          if (!data) {
            setMyRequest(null);
            return;
          }

          setMyRequest({
            status: (data.status ?? "PENDING") as AccessRequestStatus,
            createdAt: data.created_at as string,
            requestType: (data.request_type ?? "DEALER") as RequestType,
            company: (data.company ?? "").toString(),
            name: (data.name ?? "").toString(),
            rejectionMessage: (data as any).rejection_message ?? undefined,
          });
          return;
        }

        const key = "warrantyhub.local.access_requests";
        const raw = localStorage.getItem(key);
        const existing = raw ? (JSON.parse(raw) as any[]) : [];

        const candidates = existing
          .map((r) => ({
            requesterId: r.requesterId ?? undefined,
            email: (r.email ?? "").toString(),
            status: (r.status ?? "PENDING") as AccessRequestStatus,
            createdAt: (r.createdAt ?? "").toString(),
            requestType: (r.requestType ?? "DEALER") as RequestType,
            company: (r.company ?? "").toString(),
            name: (r.name ?? "").toString(),
            rejectionMessage: (r.rejectionMessage ?? "").toString(),
          }))
          .filter((r) => {
            if (r.requesterId && r.requesterId === user.id) return true;
            const em = (user.email ?? "").trim().toLowerCase();
            return Boolean(em) && r.email.trim().toLowerCase() === em;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (!mounted) return;
        const latest = candidates[0];
        setMyRequest(
          latest
            ? {
                status: latest.status,
                createdAt: latest.createdAt,
                requestType: latest.requestType,
                company: latest.company,
                name: latest.name,
                rejectionMessage: latest.rejectionMessage || undefined,
              }
            : null,
        );
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load request status");
      } finally {
        if (!mounted) return;
        setLoadingMyRequest(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mode, user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitRequest({ auto: false });
    } catch {
    }
  };

  useEffect(() => {
    if (!user) return;
    if (signupIntent !== "DEALERSHIP") return;
    if (loadingMyRequest) return;
    if (myRequest) return;
    if (autoRequested) return;

    setAutoRequested(true);
    void (async () => {
      try {
        await submitRequest({ auto: true });
        try {
          localStorage.removeItem(SIGNUP_INTENT_KEY);
        } catch {
        }
      } catch {
        setAutoRequested(false);
      }
    })();
  }, [autoRequested, loadingMyRequest, myRequest, signupIntent, user]);

  const isPendingView = myRequest?.status === "PENDING" || loadingMyRequest;
  const isApprovedView = !loadingMyRequest && myRequest?.status === "APPROVED";
  const isRejectedView = !loadingMyRequest && myRequest?.status === "REJECTED";

  const submittedAtLabel = myRequest?.createdAt ? new Date(myRequest.createdAt).toLocaleString() : loadingMyRequest ? "Loading…" : "";
  const requestTypeLabel = myRequest?.requestType === "PROVIDER" ? "Provider" : loadingMyRequest ? "Loading…" : "Dealer";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isPendingView ? null : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">Request Access</h1>
              <p className="text-muted-foreground mt-2">Your account is created, but access must be approved by an admin.</p>
            </>
          )}

        {autoJoining ? (
          <div className="mt-6 rounded-lg border bg-card p-4 text-sm">Joining your dealership…</div>
        ) : null}

        {autoJoinError ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Could not join dealership</div>
            <div className="mt-1">{autoJoinError}</div>
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAutoJoinError(null);
                  setAutoJoined(false);
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}

          {loadingMyRequest && !isPendingView ? (
            <div className="mt-6 rounded-lg border bg-card p-4 text-sm">Loading request status…</div>
          ) : null}

          {isPendingView ? (
            <div className="mt-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/40 bg-yellow-100 px-4 py-1 text-[11px] font-semibold tracking-wide text-slate-900">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  PENDING ADMIN APPROVAL
                </div>

                <div className="mt-5 flex items-center justify-center">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border bg-white shadow-sm flex items-center justify-center">
                      <Clock className="h-8 w-8 text-slate-900" />
                    </div>
                    <div className="absolute -right-1 -bottom-1 h-7 w-7 rounded-full bg-yellow-300 border border-yellow-200 flex items-center justify-center">
                      <span className="text-[11px] font-bold text-slate-900">✓</span>
                    </div>
                  </div>
                </div>

                <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 font-display">
                  You&apos;re on the list, there!
                </h1>
                <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
                  Your dealership registration has been received. Our admin team will review and activate your account shortly.
                </p>
              </div>

              <div className="mt-8 flex items-center justify-center">
                <div className="w-full max-w-2xl">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <div className="text-center">
                      <div className="mx-auto h-10 w-10 rounded-full bg-yellow-300 text-slate-900 flex items-center justify-center shadow-sm">
                        <span className="text-xs font-bold">1</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-yellow-600">Application</div>
                      <div className="text-[11px] font-semibold text-yellow-600">Submitted</div>
                    </div>

                    <div className="text-center relative">
                      <div className="absolute left-0 right-0 top-5 h-px bg-slate-200" />
                      <div className="relative mx-auto h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
                        <span className="text-xs font-bold">2</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-slate-900">Admin Review</div>
                    </div>

                    <div className="text-center">
                      <div className="mx-auto h-10 w-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                        <span className="text-xs font-bold">3</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold text-slate-500">Account</div>
                      <div className="text-[11px] font-semibold text-slate-500">Activated</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <div className="w-full max-w-2xl rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <ShieldCheck className="h-4 w-4 text-slate-900" />
                    </div>
                    <div className="text-sm font-semibold text-slate-900">Application Details</div>
                  </div>

                  <div className="px-5 py-4 text-sm">
                    <div className="flex items-center justify-between gap-3 py-2 border-b">
                      <div className="text-muted-foreground">Company</div>
                      <div className="font-medium text-right break-words text-slate-900">{myRequest?.company ?? (loadingMyRequest ? "Loading…" : "")}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 border-b">
                      <div className="text-muted-foreground">Request type</div>
                      <div className="font-medium text-slate-900">{requestTypeLabel}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 border-b">
                      <div className="text-muted-foreground">Submitted</div>
                      <div className="font-medium text-slate-900">{submittedAtLabel}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <div className="text-muted-foreground">Status</div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/40 bg-yellow-100 px-3 py-1 text-xs font-semibold text-slate-900">
                        <span className="h-2 w-2 rounded-full bg-yellow-400" />
                        Pending Review
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <div className="w-full max-w-2xl rounded-xl border bg-white shadow-sm p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">We’ll email you when you’re approved</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Once our admin approves your account, you’ll receive an email with your login details and next steps.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                    <div className="mx-auto h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">Quick Review</div>
                    <div className="mt-1 text-xs text-muted-foreground">Most accounts are reviewed within 1–2 business days</div>
                  </div>
                  <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                    <div className="mx-auto h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">Instant Alert</div>
                    <div className="mt-1 text-xs text-muted-foreground">You’ll be notified immediately upon approval</div>
                  </div>
                  <div className="rounded-xl border bg-white shadow-sm p-4 text-center">
                    <div className="mx-auto h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">Secure Access</div>
                    <div className="mt-1 text-xs text-muted-foreground">Your data is protected throughout the process</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isApprovedView ? (
          <div className="mt-6 rounded-lg border bg-card p-4 text-sm">
            <div className="font-medium">Access approved</div>
            <div className="text-muted-foreground mt-1">Your access was approved. Your portal will update automatically.</div>
            {user?.role === "UNASSIGNED" ? (
              <div className="mt-4">
                <Button
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      await refreshUser();
                    })();
                  }}
                >
                  Refresh access
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

          {isRejectedView ? (
          <div className="mt-6 rounded-lg border bg-card p-4 text-sm">
            <div className="font-medium">Your request was not approved</div>
            <div className="text-muted-foreground mt-1">You can submit a new request below.</div>
            {myRequest.rejectionMessage ? (
              <div className="mt-3 rounded-lg border bg-background p-3">
                <div className="text-xs text-muted-foreground">Message from admin</div>
                <div className="mt-1 whitespace-pre-wrap break-words">{myRequest.rejectionMessage}</div>
              </div>
            ) : null}
          </div>
        ) : null}

          {status === "error" ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error ?? "Request failed"}
          </div>
          ) : null}

          {signupIntent === "DEALERSHIP" || autoJoining ? null : (isPendingView ? null : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium">I am a…</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
            >
              <option value="DEALER">Dealership</option>
              <option value="PROVIDER">Warranty Provider</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {requestType === "PROVIDER" ? "Provider Company Name" : "Company"}
            </label>
            <Input
              value={company}
              onChange={(e) => setCompany(sanitizeWordsOnly(e.target.value))}
              placeholder={requestType === "PROVIDER" ? "Provider Company Name" : "Company name"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Your name</label>
            <Input value={name} onChange={(e) => setName(sanitizeLettersOnly(e.target.value))} placeholder="Full name" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input value={email} disabled placeholder="you@company.com" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message (optional)</label>
            <textarea
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you want the admin to know…"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={status === "submitting"}
          >
            Submit request
          </Button>

          {mode === "supabase" ? (
            <p className="text-xs text-muted-foreground">
              Supabase mode: this submits to the `access_requests` table.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Local mode: requests are stored in your browser for now.
            </p>
          )}
          </form>
          ))}
        </div>
      </div>
    </div>
  );
}
