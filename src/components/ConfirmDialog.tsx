import { LuTriangleAlert } from "react-icons/lu";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  reduceMotion?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  reduceMotion,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} reduceMotion={reduceMotion}>
      <div className="flex gap-3">
        {danger && (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
            <LuTriangleAlert className="size-5" />
          </span>
        )}
        <p className="text-sm text-muted">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
