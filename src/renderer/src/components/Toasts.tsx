import { AlertTriangle, CheckCircle2, Info, Trophy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import type { Toast } from '@shared/types';
import { cn } from '../lib/format';
import { useApp, type Route } from '../lib/store';

const ICON = {
  info: <Info className="size-5 text-info" />,
  success: <CheckCircle2 className="size-5 text-ok" />,
  error: <AlertTriangle className="size-5 text-bad" />,
  achievement: <Trophy className="size-5 text-xp" />,
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useApp((s) => s.dismissToast);
  const navigate = useApp((s) => s.navigate);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 8000 : 5500);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, dismiss]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40 }}
      className={cn(
        'no-drag pointer-events-auto flex w-[360px] items-start gap-3 rounded-2xl border-2 bg-elev p-4 shadow-float',
        toast.kind === 'achievement' ? 'border-xp/50' : toast.kind === 'error' ? 'border-bad/40' : 'border-line',
      )}
    >
      <div className="mt-0.5">{ICON[toast.kind]}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">{toast.title}</div>
        {toast.body && <div className="mt-0.5 text-[13px] font-semibold text-muted">{toast.body}</div>}
        {toast.action && (
          <button
            className="mt-2 text-[13px] font-extrabold text-brand hover:underline"
            onClick={() => {
              const params = toast.action?.params ?? {};
              navigate((params.id ? { name: toast.action?.route, id: params.id } : { name: toast.action?.route }) as Route);
              dismiss(toast.id);
            }}
          >
            {toast.action.label} →
          </button>
        )}
      </div>
      <button onClick={() => dismiss(toast.id)} className="rounded-lg p-1 text-faint hover:bg-hover hover:text-ink" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[70] flex flex-col items-end gap-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
