export type ProductDocument = {
  id: string;
  providerId: string;
  productId?: string;
  title: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  dataUrl?: string;
  createdAt: string;
};

export type UploadDocumentInput = {
  title: string;
  file: File;
  productId?: string | null;
};
