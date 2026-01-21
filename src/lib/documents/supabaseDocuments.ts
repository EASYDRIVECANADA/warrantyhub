import { getSupabaseClient } from "../supabase/client";

import type { DocumentsApi, ListDocumentsOptions } from "./api";
import type { ProductDocument, UploadDocumentInput } from "./types";

type DocumentsRow = {
  id: string;
  provider_id: string;
  product_id?: string | null;
  title: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path: string;
  created_at: string;
};

function toDocument(r: DocumentsRow): ProductDocument {
  return {
    id: r.id,
    providerId: r.provider_id,
    productId: r.product_id ?? undefined,
    title: r.title,
    fileName: r.file_name,
    mimeType: r.mime_type ?? undefined,
    sizeBytes: r.size_bytes ?? undefined,
    storagePath: r.storage_path,
    createdAt: r.created_at,
  };
}

async function currentUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const id = data.session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const supabaseDocumentsApi: DocumentsApi = {
  async list(options?: ListDocumentsOptions) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const productId = options?.productId;

    let q = supabase.from("product_documents").select("*").order("created_at", { ascending: false });
    if (typeof productId !== "undefined") {
      if (productId === null) q = q.is("product_id", null);
      else q = q.eq("product_id", productId);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data as DocumentsRow[]).map(toDocument);
  },

  async upload(input: UploadDocumentInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerId = await currentUserId();

    const title = input.title.trim();
    if (!title) throw new Error("Title is required");

    const objectName = `${providerId}/${crypto.randomUUID()}-${sanitizeFilename(input.file.name)}`;

    const uploadRes = await supabase.storage.from("product-documents").upload(objectName, input.file, {
      upsert: false,
      contentType: input.file.type || undefined,
    });

    if (uploadRes.error) throw uploadRes.error;

    const insertRow = {
      provider_id: providerId,
      product_id: input.productId ?? null,
      title,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      storage_path: objectName,
    };

    const { data, error } = await supabase.from("product_documents").insert(insertRow).select("*").single();
    if (error) throw error;
    return toDocument(data as DocumentsRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const lookup = await supabase.from("product_documents").select("id, storage_path").eq("id", id).single();
    if (lookup.error) throw lookup.error;

    const storagePath = (lookup.data as { storage_path: string }).storage_path;

    const storageDelete = await supabase.storage.from("product-documents").remove([storagePath]);
    if (storageDelete.error) throw storageDelete.error;

    const del = await supabase.from("product_documents").delete().eq("id", id);
    if (del.error) throw del.error;
  },

  async getDownloadUrl(doc: ProductDocument) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");
    if (!doc.storagePath) throw new Error("Document storage path missing");

    const { data, error } = await supabase.storage.from("product-documents").createSignedUrl(doc.storagePath, 60 * 5);
    if (error) throw error;

    return data.signedUrl;
  },
};
