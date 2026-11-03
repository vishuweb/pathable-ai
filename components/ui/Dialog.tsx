"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "drawer" slides in from the side, for menus. */
  variant?: "dialog" | "drawer";
  children: React.ReactNode;
}

/** A modal on the native dialog element, which handles focus trapping, Escape and returning focus. */
export function Dialog({ open, onClose, title, variant = "dialog", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${variant}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="x" />
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Asks before something that cannot be undone. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p>{body}</p>
      <p className="modal-actions">
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={danger ? "button-primary button-solid-danger" : "button-primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </p>
    </Dialog>
  );
}
