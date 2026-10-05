import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/format';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Portal to <body>: an animated (transformed) ancestor would otherwise trap the fixed overlay.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="no-drag fixed inset-0 z-[60] flex items-center justify-center bg-[#0b0b1a]/45 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn('flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[28px] border-2 border-line bg-elev shadow-float', className)}
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
                <div>
                  {title && <h2 className="text-xl font-black">{title}</h2>}
                  {subtitle && <p className="mt-1 text-sm font-semibold text-muted">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="rounded-xl p-2 text-faint hover:bg-hover hover:text-ink" aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-3 border-t-2 border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <button className="rounded-2xl px-4 py-2.5 text-sm font-extrabold text-muted hover:bg-hover" onClick={onClose}>
            Cancel
          </button>
          <button
            className={cn(
              'press rounded-2xl px-5 py-2.5 text-sm font-extrabold text-white',
              danger ? 'bg-bad shadow-[0_4px_0_var(--bad-deep)]' : 'bg-brand shadow-[0_4px_0_var(--brand-deep)]',
            )}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[15px] font-semibold text-muted">{body}</div>
    </Modal>
  );
}
