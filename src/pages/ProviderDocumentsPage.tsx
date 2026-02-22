import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getProvidersApi } from "../lib/providers/providers";
import { alertMissing } from "../lib/utils";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { saveLocalProviderLogo } from "../lib/providers/localProviders";

function isAllowedLogoUpload(file: File) {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) return true;
  return false;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ProviderDocumentsPage() {
  const providersApi = useMemo(() => getProvidersApi(), []);
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const myProfileQuery = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: () => providersApi.getMyProfile(),
  });

  const uploadMutation = useMutation({
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

      const objectName = `provider-logos/${userId}/${crypto.randomUUID()}-${sanitizeFilename(input.file.name)}`;
      const uploadRes = await supabase.storage.from("product-documents").upload(objectName, input.file, {
        upsert: true,
        contentType: input.file.type || undefined,
      });
      if (uploadRes.error) throw new Error(uploadRes.error.message);

      const publicUrl = supabase.storage.from("product-documents").getPublicUrl(objectName).data.publicUrl;
      await providersApi.updateMyProfile({ logoUrl: publicUrl });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
    },
  });

  const busy = uploadMutation.isPending;

  useEffect(() => {
    const profileLogo = (myProfileQuery.data as any)?.logoUrl as string | undefined;
    if (previewUrl) return;
    if (profileLogo) setPreviewUrl(profileLogo);
  }, [myProfileQuery.data, previewUrl]);

  const onUpload = async () => {
    setError(null);
    if (!file) return alertMissing("Choose a file to upload.");
    if (!isAllowedLogoUpload(file)) return alertMissing("Only image files are allowed (PNG, JPG, WEBP).");

    try {
      await uploadMutation.mutateAsync({ file });
      setFile(null);
      const input = document.getElementById("provider-doc-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload");
    }
  };

  const onRemove = async () => {
    setError(null);
    try {
      await providersApi.updateMyProfile({ logoUrl: null });
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
      setPreviewUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove logo");
    }
  };

  return (
    <PageShell
      badge="Provider Portal"
      title="Logo"
      subtitle="Upload your company logo. Dealers will see it when browsing your products."
      actions={
        <Button variant="outline" asChild>
          <Link to="/provider-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Upload Logo</div>
            <div className="text-sm text-muted-foreground mt-1">Recommended: square image, PNG with transparent background.</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void onRemove()} disabled={busy || (!previewUrl && !(myProfileQuery.data as any)?.logoUrl)}>
              Remove
            </Button>
            <Button onClick={() => void onUpload()} disabled={busy}>
              Upload
            </Button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <Input value={(myProfileQuery.data as any)?.companyName ?? ""} disabled placeholder="Company name" />
            <input
              id="provider-doc-file"
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (!f) return;
                if (!isAllowedLogoUpload(f)) return;
                const url = URL.createObjectURL(f);
                setPreviewUrl(url);
              }}
              className="block w-full text-sm text-muted-foreground"
              accept="image/*"
              disabled={busy}
            />
            <div className="text-xs text-muted-foreground">Max 2–3MB recommended.</div>
          </div>

          <div className="lg:col-span-7 rounded-xl border p-4">
            <div className="font-semibold">Preview</div>
            <div className="mt-3 flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl border bg-white overflow-hidden flex items-center justify-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Provider logo" className="h-full w-full object-contain" />
                ) : (
                  <div className="text-xs text-muted-foreground">No logo</div>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                Your logo will appear in the dealer marketplace next to your provider name.
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
