import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { confirmProceed } from "../lib/utils";

export function ProviderTermsPage() {
  const providersApi = useMemo(() => getProvidersApi(), []);

  const hasHydratedProfile = useRef(false);

  const myProfileQuery = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: () => providersApi.getMyProfile(),
  });

  const [termsConditionsText, setTermsConditionsText] = useState("");
  const [claimsRepairsText, setClaimsRepairsText] = useState("");
  const [providerResponsibilityText, setProviderResponsibilityText] = useState("");
  const [limitationLiabilityText, setLimitationLiabilityText] = useState("");
  const [customerAcknowledgementText, setCustomerAcknowledgementText] = useState("");

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      return providersApi.updateMyProfile({
        termsConditionsText,
        claimsRepairsText,
        providerResponsibilityText,
        limitationLiabilityText,
        customerAcknowledgementText,
      });
    },
    onSuccess: async (next) => {
      setTermsConditionsText(next.termsConditionsText ?? "");
      setClaimsRepairsText(next.claimsRepairsText ?? "");
      setProviderResponsibilityText(next.providerResponsibilityText ?? "");
      setLimitationLiabilityText(next.limitationLiabilityText ?? "");
      setCustomerAcknowledgementText(next.customerAcknowledgementText ?? "");
    },
  });

  useEffect(() => {
    const p = myProfileQuery.data as ProviderPublic | null | undefined;
    if (!p) return;
    if (hasHydratedProfile.current) return;
    hasHydratedProfile.current = true;

    setTermsConditionsText((p.termsConditionsText ?? "").toString());
    setClaimsRepairsText((p.claimsRepairsText ?? "").toString());
    setProviderResponsibilityText((p.providerResponsibilityText ?? "").toString());
    setLimitationLiabilityText((p.limitationLiabilityText ?? "").toString());
    setCustomerAcknowledgementText((p.customerAcknowledgementText ?? "").toString());
  }, [myProfileQuery.data]);

  const busy = saveProfileMutation.isPending;

  return (
    <PageShell title="">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-600/10">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 to-transparent flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Warranty Terms</div>
              <div className="text-sm text-muted-foreground mt-1">These terms appear on the customer printable contract.</div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                void (async () => {
                  const msg = "Save warranty terms?";
                  if (!(await confirmProceed(msg))) return;
                  saveProfileMutation.mutate();
                })();
              }}
              disabled={busy}
            >
              Save
            </Button>
          </div>

          <div className="p-6">
            {myProfileQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
            {myProfileQuery.isError ? (
              <div className="text-sm text-destructive">
                {(() => {
                  const e = myProfileQuery.error as any;
                  const msg = typeof e?.message === "string" ? e.message : "Failed to load provider profile.";
                  return msg;
                })()}
              </div>
            ) : null}

            {saveProfileMutation.isError ? (
              <div className="text-sm text-destructive">
                {(() => {
                  const e = saveProfileMutation.error as any;
                  const msg = typeof e?.message === "string" ? e.message : "Failed to save provider terms.";
                  return msg;
                })()}
              </div>
            ) : null}

            <div className="rounded-xl border bg-background/40 p-4">
              <div className="text-sm font-medium text-foreground">Warranty Terms Sections</div>
              <div className="text-xs text-muted-foreground mt-1">Tokens are supported.</div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Terms & Conditions</div>
                  <textarea
                    value={termsConditionsText}
                    onChange={(e) => setTermsConditionsText(e.target.value)}
                    placeholder="Enter Terms & Conditions..."
                    className="mt-2 w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">Claims / Repairs</div>
                  <textarea
                    value={claimsRepairsText}
                    onChange={(e) => setClaimsRepairsText(e.target.value)}
                    placeholder="Enter Claims / Repairs instructions..."
                    className="mt-2 w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">Provider Responsibility</div>
                  <textarea
                    value={providerResponsibilityText}
                    onChange={(e) => setProviderResponsibilityText(e.target.value)}
                    placeholder="Enter Provider Responsibility..."
                    className="mt-2 w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">Limitation of Liability</div>
                  <textarea
                    value={limitationLiabilityText}
                    onChange={(e) => setLimitationLiabilityText(e.target.value)}
                    placeholder="Enter Limitation of Liability..."
                    className="mt-2 w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground">Customer Acknowledgement</div>
                  <textarea
                    value={customerAcknowledgementText}
                    onChange={(e) => setCustomerAcknowledgementText(e.target.value)}
                    placeholder="Enter Customer Acknowledgement..."
                    className="mt-2 w-full min-h-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
