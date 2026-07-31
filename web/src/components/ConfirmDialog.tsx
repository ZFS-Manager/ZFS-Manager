import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button (destructive), primary = accent confirm button */
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Unified confirmation dialog — replaces all native window.confirm() calls.
 * Visually matches the shared Modal design used across the app.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';
  const accentColor = isDanger ? 'var(--danger)' : 'var(--accent)';
  const accentBg = isDanger ? 'rgba(239,68,68,0.1)' : 'var(--accent-dim)';
  const accentBorder = isDanger ? 'rgba(239,68,68,0.2)' : 'var(--accent-mid)';

  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 14, padding: '14px 16px', background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 8 }}>
          <AlertTriangle size={18} style={{ color: accentColor, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', margin: 0, lineHeight: 1.5 }}>
            {message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel} autoFocus={isDanger}>
            {cancelLabel}
          </button>
          <button
            className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={onConfirm}
            autoFocus={!isDanger}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
