import type { ProductDocument, UploadDocumentInput } from "./types";

export type ListDocumentsOptions = {
  productId?: string | null;
};

export interface DocumentsApi {
  list(options?: ListDocumentsOptions): Promise<ProductDocument[]>;
  upload(input: UploadDocumentInput): Promise<ProductDocument>;
  remove(id: string): Promise<void>;
  getDownloadUrl(doc: ProductDocument): Promise<string>;
}
