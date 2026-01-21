import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getDocumentsApi } from "../lib/documents/documents";
import type { ProductDocument } from "../lib/documents/types";
import { getProductsApi } from "../lib/products/products";
import type { Product } from "../lib/products/types";
import { alertMissing } from "../lib/utils";

function isAllowedUpload(file: File) {
  if (file.type === "application/pdf") return true;
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return true;
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) return true;
  return false;
}

function fileTypeLabel(doc: ProductDocument) {
  const mime = doc.mimeType?.toLowerCase();
  if (mime === "application/pdf") return "PDF";
  if (mime?.startsWith("image/")) return (mime.split("/")[1] ?? "Image").toUpperCase();

  const name = doc.fileName.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : undefined;
  if (!ext) return "—";
  return ext.toUpperCase();
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function ProviderDocumentsPage() {
  const api = useMemo(() => getDocumentsApi(), []);
  const productsApi = useMemo(() => getProductsApi(), []);
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => productsApi.list(),
  });

  const documentsQuery = useQuery({
    queryKey: ["provider-documents"],
    queryFn: () => api.list(),
  });

  const uploadMutation = useMutation({
    mutationFn: (input: { title: string; productId?: string | null; file: File }) =>
      api.upload({ title: input.title, productId: input.productId, file: input.file }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-documents"] });
    },
  });

  const products = (productsQuery.data ?? []) as Product[];
  const documents = (documentsQuery.data ?? []) as ProductDocument[];

  const busy = uploadMutation.isPending;

  const onUpload = async () => {
    setError(null);
    const t = title.trim();
    if (!t) return alertMissing("Title is required.");
    if (!file) return alertMissing("Choose a file to upload.");
    if (!isAllowedUpload(file)) return alertMissing("Only PDF and image files are allowed.");

    try {
      await uploadMutation.mutateAsync({
        title: t,
        productId: productId.trim() ? productId : null,
        file,
      });
      setTitle("");
      setProductId("");
      setFile(null);
      const input = document.getElementById("provider-doc-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload");
    }
  };

  const onDownload = async (doc: ProductDocument) => {
    setError(null);
    try {
      const url = await api.getDownloadUrl(doc);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get download link");
    }
  };

  return (
    <PageShell
      badge="Provider Portal"
      title="Documents"
      subtitle="Upload brochures, disclosures, and product PDFs."
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
            <div className="font-semibold">Upload Document</div>
            <div className="text-sm text-muted-foreground mt-1">Optionally link documents to a product.</div>
          </div>
          <Button onClick={() => void onUpload()} disabled={busy}>
            Upload
          </Button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title (e.g. Platinum Coverage Brochure)"
              disabled={busy}
            />

              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                disabled={busy}
              >
                <option value="">Not linked to a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <input
                id="provider-doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground"
                accept="application/pdf,image/*"
                disabled={busy}
              />
            </div>

            <div className="lg:col-span-7 rounded-xl border p-4">
              <div className="font-semibold">Tips</div>
              <div className="text-sm text-muted-foreground mt-1">Recommended compliance documents:</div>
              <div className="mt-3 text-sm text-muted-foreground space-y-1">
                <div>- Brochure / coverage summary (PDF)</div>
                <div>- Exclusions & limitations (PDF)</div>
                <div>- Claims instructions (PDF)</div>
                <div>- Any required disclosures for your region (PDF)</div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Dealers will see documents that are linked to your products.
              </div>
            </div>
          </div>
        </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Your Documents</div>
              <div className="text-sm text-muted-foreground mt-1">Uploads and linked product files.</div>
            </div>
            <div className="text-sm text-muted-foreground">{documents.length} total</div>
          </div>

          <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
            <div className="col-span-4">Title</div>
            <div className="col-span-3">Product</div>
            <div className="col-span-2">File type</div>
            <div className="col-span-2">Upload date</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          <div className="divide-y">
            {documents.map((d) => (
              <div key={d.id} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-4">
                    <div className="text-sm font-medium text-foreground">{d.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{d.fileName}</div>
                  </div>
                  <div className="md:col-span-3 text-sm text-muted-foreground">
                    {d.productId ? products.find((p) => p.id === d.productId)?.name ?? "Linked product" : "—"}
                  </div>
                  <div className="md:col-span-2 text-sm text-muted-foreground">{fileTypeLabel(d)}</div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">{formatDate(d.createdAt)}</div>
                  <div className="md:col-span-1 flex md:justify-end">
                    <Button size="sm" variant="outline" onClick={() => void onDownload(d)} disabled={busy}>
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {documentsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {documentsQuery.isError ? (
              <div className="px-6 py-6 text-sm text-destructive">Failed to load documents.</div>
            ) : null}
            {!documentsQuery.isLoading && !documentsQuery.isError && documents.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">
                No documents yet. Upload your first brochure or disclosure above.
              </div>
            ) : null}
          </div>
        </div>
    </PageShell>
  );
}
