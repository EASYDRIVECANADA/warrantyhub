export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm(): void;
  onCancel(): void;
};

export function ConfirmDialog(_props: ConfirmDialogProps) {
  return null;
}
