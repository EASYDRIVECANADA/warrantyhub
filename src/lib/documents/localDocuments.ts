import type { DocumentsApi, ListDocumentsOptions } from "./api";
import type { ProductDocument, UploadDocumentInput } from "./types";

const STORAGE_KEY = "warrantyhub.local.product_documents";
const USERS_KEY = "warrantyhub.local.users";
const PRODUCTS_KEY = "warrantyhub.local.products";
const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";

function readDevBypassUserId(): string | null {
  if (!import.meta.env.DEV) return null;
  const raw = localStorage.getItem(DEV_BYPASS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

function readLocalSessionUserId(): string | null {
  const raw = localStorage.getItem("warrantyhub.local.session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string };
    return typeof parsed.userId === "string" ? parsed.userId : null;
  } catch {
    return null;
  }
}

function currentUserId(): string {
  const bypass = readDevBypassUserId();
  if (bypass) return bypass;

  const session = readLocalSessionUserId();
  if (session) return session;

  throw new Error("Not authenticated");
}

function currentUserRole(): string | null {
  const uid = currentUserId();
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return null;
  try {
    const users = JSON.parse(raw) as { id?: string; role?: string }[];
    const u = users.find((x) => x?.id === uid);
    return typeof u?.role === "string" ? u.role : null;
  } catch {
    return null;
  }
}

function publishedProductIds(): Set<string> {
  const raw = localStorage.getItem(PRODUCTS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { id?: string; published?: boolean }[];
    const ids = parsed
      .filter((p) => Boolean(p?.published) && typeof p?.id === "string" && p.id.trim())
      .map((p) => p.id as string);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function read(): ProductDocument[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProductDocument>[];
    return parsed
      .map((d): ProductDocument => {
        const createdAt = d.createdAt ?? new Date().toISOString();
        const id = d.id ?? crypto.randomUUID();
        const providerId = d.providerId ?? "";
        return {
          id,
          providerId,
          productId: d.productId ?? undefined,
          title: d.title ?? "",
          fileName: d.fileName ?? "",
          mimeType: d.mimeType ?? undefined,
          sizeBytes: typeof d.sizeBytes === "number" ? d.sizeBytes : undefined,
          storagePath: d.storagePath ?? undefined,
          dataUrl: d.dataUrl ?? undefined,
          createdAt,
        };
      })
      .filter((d) => d.providerId.trim() && d.title.trim() && d.fileName.trim());
  } catch {
    return [];
  }
}

function write(items: ProductDocument[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Unexpected file read result"));
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export const localDocumentsApi: DocumentsApi = {
  async list(options?: ListDocumentsOptions) {
    const uid = currentUserId();
    const productId = options?.productId;

    const role = currentUserRole();
    if (role && role !== "PROVIDER") {
      const published = publishedProductIds();
      return read()
        .filter((d) => typeof d.productId === "string" && d.productId.trim())
        .filter((d) => published.has(d.productId as string))
        .filter((d) => {
          if (typeof productId === "undefined") return true;
          if (productId === null) return false;
          return d.productId === productId;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return read()
      .filter((d) => d.providerId === uid)
      .filter((d) => {
        if (typeof productId === "undefined") return true;
        if (productId === null) return typeof d.productId === "undefined";
        return d.productId === productId;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async upload(input: UploadDocumentInput) {
    const uid = currentUserId();
    const now = new Date().toISOString();

    const title = input.title.trim();
    if (!title) throw new Error("Title is required");

    const dataUrl = await fileToDataUrl(input.file);

    const item: ProductDocument = {
      id: crypto.randomUUID(),
      providerId: uid,
      productId: input.productId ?? undefined,
      title,
      fileName: input.file.name,
      mimeType: input.file.type || undefined,
      sizeBytes: input.file.size,
      dataUrl,
      createdAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async remove(id: string) {
    const uid = currentUserId();
    const items = read();
    const current = items.find((d) => d.id === id);
    if (!current) return;
    if (current.providerId !== uid) throw new Error("Not authorized");

    write(items.filter((d) => d.id !== id));
  },

  async getDownloadUrl(doc: ProductDocument) {
    if (!doc.dataUrl) throw new Error("Document data not available");
    return doc.dataUrl;
  },
};
