import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading}
    className={cn('inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
      variant === 'primary' && 'bg-accent text-white hover:bg-accent-strong',
      variant === 'secondary' && 'border border-line bg-surface hover:bg-bg',
      variant === 'danger' && 'bg-danger text-white hover:opacity-90',
      variant === 'ghost' && 'hover:bg-bg', className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));
Button.displayName = 'Button';

export const Badge = ({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok'; children: ReactNode }) => (
  <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
    tone === 'neutral' && 'bg-bg text-muted ring-1 ring-line', tone === 'accent' && 'bg-accent-soft text-accent-strong',
    tone === 'warn' && 'bg-warn-soft text-warn', tone === 'danger' && 'bg-danger-soft text-danger', tone === 'ok' && 'bg-ok-soft text-ok')}>{children}</span>
);

export const AccessBadge = ({ access }: { access: string | null | undefined }) =>
  access === 'owner' ? <Badge tone="accent">Owner</Badge> : access === 'edit' ? <Badge tone="warn">Can edit</Badge> : <Badge>Can read</Badge>;

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded bg-line/60', className)} aria-hidden />;

export const Field = ({ label, error, children, id }: { label: string; error?: string; children: ReactNode; id: string }) => (
  <div><label htmlFor={id} className="label">{label}</label>{children}{error && <p className="err" role="alert">{error}</p>}</div>
);

export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="px-6 py-10 text-center"><p className="font-medium">{title}</p>{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}{action && <div className="mt-4">{action}</div>}</div>
);

export const Pagination = ({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
      <span className="text-muted">Page {page + 1} of {pages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </nav>
  );
};

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="card w-full max-w-md p-5 shadow-overlay">
        <h2 id="dlg-title">{title}</h2>
        <div className="mt-2 text-sm text-muted">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={ref} variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

type Toast = { id: number; kind: 'ok' | 'err'; text: string };
const ToastCtx = createContext<(kind: 'ok' | 'err', text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="card flex items-start gap-2 p-3 text-sm">
            {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-danger" />}
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
