import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { saveLocalProviderLogo } from "../lib/providers/localProviders";
import { getSupabaseClient } from "../lib/supabase/client";
import { alertMissing, confirmProceed, sanitizeLettersOnly, sanitizeWordsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function isAllowedLogoUpload(file: File) {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) return true;
  return false;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const mode = useMemo(() => getAppMode(), []);
  const navigate = useNavigate();

  const providersApi = useMemo(() => getProvidersApi(), []);
  const qc = useQueryClient();

  const showProviderEditor = user?.role === "PROVIDER";
  const hasHydratedProviderProfile = useRef(false);

  const myProviderProfileQuery = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: () => providersApi.getMyProfile(),
    enabled: showProviderEditor,
  });

  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const saveProviderProfileMutation = useMutation({
    mutationFn: async () => {
      return providersApi.updateMyProfile({ displayName, companyName });
    },
    onSuccess: async (next) => {
      setDisplayName(next.displayName ?? "");
      setCompanyName(next.companyName ?? "");
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
    },
  });

  useEffect(() => {
    if (!showProviderEditor) return;
    const p = myProviderProfileQuery.data as ProviderPublic | null | undefined;
    if (!p) return;
    if (hasHydratedProviderProfile.current) return;
    hasHydratedProviderProfile.current = true;
    setDisplayName((p.displayName ?? "").toString());
    setCompanyName((p.companyName ?? "").toString());
  }, [myProviderProfileQuery.data, showProviderEditor]);

  const [file, setFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!showProviderEditor) return;
    const profileLogo = (myProviderProfileQuery.data as any)?.logoUrl as string | undefined;
    if (previewUrl) return;
    if (profileLogo) setPreviewUrl(profileLogo);
  }, [myProviderProfileQuery.data, previewUrl, showProviderEditor]);

  const uploadLogoMutation = useMutation({
    mutationFn: async (input: { file: File }) => {
      if (mode === "local") {
        const profile = await providersApi.getMyProfile();
        const pid = (profile?.id ?? "").trim();
        if (!pid) throw new Error("Not authenticated");
        const logoKeyUrl = await saveLocalProviderLogo({ providerId: pid, file: input.file });
        await providersApi.updateMyProfile({ logoUrl: logoKeyUrl });
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const safeName = sanitizeFilename(input.file.name);
      const uuid = crypto.randomUUID();

      const tryProviderLogosBucket = async () => {
        const objectName = `${userId}/${uuid}-${safeName}`;
        const uploadRes = await supabase.storage.from("provider-logos").upload(objectName, input.file, {
          upsert: true,
          contentType: input.file.type || undefined,
        });
        if (uploadRes.error) throw uploadRes.error;
        return supabase.storage.from("provider-logos").getPublicUrl(objectName).data.publicUrl;
      };

      const tryProductDocumentsBucket = async () => {
        const objectName = `provider-logos/${userId}/${uuid}-${safeName}`;
        const uploadRes = await supabase.storage.from("product-documents").upload(objectName, input.file, {
          upsert: true,
          contentType: input.file.type || undefined,
        });
        if (uploadRes.error) throw uploadRes.error;
        return supabase.storage.from("product-documents").getPublicUrl(objectName).data.publicUrl;
      };

      let publicUrl: string;
      try {
        publicUrl = await tryProviderLogosBucket();
      } catch {
        publicUrl = await tryProductDocumentsBucket();
      }

      await providersApi.updateMyProfile({ logoUrl: publicUrl });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      await providersApi.updateMyProfile({ logoUrl: null });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
      setPreviewUrl(null);
      setFile(null);
      const input = document.getElementById("provider-profile-logo") as HTMLInputElement | null;
      if (input) input.value = "";
    },
  });

  const providerBusy = saveProviderProfileMutation.isPending || uploadLogoMutation.isPending || removeLogoMutation.isPending;

  return (
    <PageShell title="">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {showProviderEditor ? (
              <div className="lg:col-span-8 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/10 via-transparent to-transparent flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold">Provider Profile</div>
                    <div className="text-sm text-muted-foreground mt-1">Manage how your brand appears to dealerships.</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed("Save provider profile?"))) return;
                        saveProviderProfileMutation.mutate();
                      })();
                    }}
                    disabled={providerBusy}
                  >
                    Save
                  </Button>
                </div>

              <div className="p-6 space-y-6">
                {myProviderProfileQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
                {myProviderProfileQuery.isError ? (
                  <div className="text-sm text-destructive">
                    {(() => {
                      const e = myProviderProfileQuery.error as any;
                      const msg = typeof e?.message === "string" ? e.message : "Failed to load provider profile.";
                      return msg;
                    })()}
                  </div>
                ) : null}
                {saveProviderProfileMutation.isError ? (
                  <div className="text-sm text-destructive">
                    {(() => {
                      const e = saveProviderProfileMutation.error as any;
                      const msg = typeof e?.message === "string" ? e.message : "Failed to save provider profile.";
                      return msg;
                    })()}
                  </div>
                ) : null}

                <div className="rounded-2xl border bg-background/70 backdrop-blur-sm p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-semibold">Provider name</div>
                      <div className="text-sm text-muted-foreground mt-1">Shown to dealerships across the marketplace and contracts.</div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Display name</div>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(sanitizeLettersOnly(e.target.value))}
                        placeholder="Example: Jay"
                        disabled={providerBusy}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Company name</div>
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(sanitizeWordsOnly(e.target.value))}
                        placeholder="Example: Bridge Warranty"
                        disabled={providerBusy}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/70 backdrop-blur-sm p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-semibold">Logo</div>
                      <div className="text-sm text-muted-foreground mt-1">Used in the marketplace and on printable contracts.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void (async () => {
                            if (!(await confirmProceed("Remove logo?"))) return;
                            try {
                              await removeLogoMutation.mutateAsync();
                            } catch (e) {
                              const anyE = e as any;
                              const msg = typeof anyE?.message === "string" ? anyE.message : "Failed to remove logo";
                              setLogoError(msg);
                            }
                          })();
                        }}
                        disabled={providerBusy || (!previewUrl && !(myProviderProfileQuery.data as any)?.logoUrl)}
                      >
                        Remove
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          void (async () => {
                            setLogoError(null);
                            if (!file) return alertMissing("Choose a file to upload.");
                            if (!isAllowedLogoUpload(file)) return alertMissing("Only image files are allowed (PNG, JPG, WEBP).");
                            try {
                              await uploadLogoMutation.mutateAsync({ file });
                              setFile(null);
                              const input = document.getElementById("provider-profile-logo") as HTMLInputElement | null;
                              if (input) input.value = "";
                            } catch (e) {
                              const anyE = e as any;
                              const msg = typeof anyE?.message === "string" ? anyE.message : "Failed to upload";
                              const code = typeof anyE?.code === "string" ? anyE.code : null;
                              const status =
                                typeof anyE?.statusCode === "number"
                                  ? anyE.statusCode
                                  : typeof anyE?.status === "number"
                                    ? anyE.status
                                    : null;
                              const parts = [msg, code ? `code=${code}` : null, status !== null ? `status=${status}` : null].filter(Boolean);
                              setLogoError(parts.length > 0 ? parts.join(" | ") : msg);
                            }
                          })();
                        }}
                        disabled={providerBusy}
                      >
                        Upload
                      </Button>
                    </div>
                  </div>

                  {logoError ? <div className="mt-3 text-sm text-destructive">{logoError}</div> : null}

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                    <div className="md:col-span-7 space-y-3">
                      <input
                        id="provider-profile-logo"
                        type="file"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setFile(f);
                          if (!f) return;
                          if (!isAllowedLogoUpload(f)) return;
                          const url = URL.createObjectURL(f);
                          setPreviewUrl(url);
                        }}
                        className="sr-only"
                        accept="image/*"
                        disabled={providerBusy}
                      />

                      <label
                        htmlFor="provider-profile-logo"
                        className={
                          "group flex items-center justify-between gap-3 rounded-xl border bg-background/70 backdrop-blur-sm px-4 py-3 transition-colors " +
                          "hover:bg-muted/30 focus-within:ring-2 focus-within:ring-blue-600/30 " +
                          (providerBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer")
                        }
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Choose a logo file</div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {file?.name ? file.name : "PNG / JPG / WEBP"}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground group-hover:bg-muted/60">
                          Browse
                        </div>
                      </label>

                      <div className="text-xs text-muted-foreground">Recommended: square PNG, transparent background. Max 2–3MB.</div>
                    </div>

                    <div className="md:col-span-5 rounded-2xl border bg-background/70 backdrop-blur-sm p-4">
                      <div className="text-xs text-muted-foreground">Marketplace preview</div>
                      <div className="mt-3 flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl border bg-white overflow-hidden flex items-center justify-center">
                          {previewUrl ? (
                            <img src={previewUrl} alt="Provider logo" className="h-full w-full object-contain" />
                          ) : (
                            <div className="text-xs text-muted-foreground">No logo</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{(companyName || displayName || "Your company").trim()}</div>
                          <div className="text-xs text-muted-foreground mt-1">Your logo appears next to your name in search and product pages.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            <div className={showProviderEditor ? "lg:col-span-4 space-y-6" : "lg:col-span-12 space-y-6"}>
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/10 via-transparent to-transparent flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-sm">👤</div>
                    <div className="font-semibold">Account Details</div>
                  </div>
                </div>

                <div className="p-6 text-sm">
                  <div className="grid grid-cols-2 gap-y-3">
                    <div className="text-muted-foreground">Email</div>
                    <div className="font-medium break-all text-right">{user?.email ?? "—"}</div>

                    <div className="text-muted-foreground">Role</div>
                    <div className="font-medium text-right">{user?.role ?? "—"}</div>

                    <div className="text-muted-foreground">Dealership</div>
                    <div className="font-medium break-words text-right">
                      {user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE" ? user?.companyName ?? user?.dealerId ?? "—" : "—"}
                    </div>

                    <div className="text-muted-foreground">Auth Mode</div>
                    <div className="font-medium text-right">{mode === "supabase" ? "Supabase" : "Local"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/10 via-transparent to-transparent">
                  <div className="font-semibold">Session</div>
                  <div className="text-sm text-muted-foreground mt-1">Sign out of your account</div>
                </div>

                <div className="p-6">
                  <Button
                    onClick={() => {
                      void (async () => {
                        await signOut();
                        navigate("/find-insurance", { replace: true });
                      })();
                    }}
                  >
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
