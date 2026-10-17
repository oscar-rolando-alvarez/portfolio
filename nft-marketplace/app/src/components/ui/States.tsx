import type { ReactNode } from "react";

export function LoadingGrid({ count = 3, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card h-40 animate-pulse bg-surface-muted" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center">
      <div aria-hidden className="grid size-12 place-items-center rounded-full bg-surface-muted text-xl">
        ◌
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-prose text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 py-12 text-center">
      <h3 className="text-lg font-semibold">Could not reach the Solana RPC</h3>
      <p className="max-w-prose text-sm text-muted">
        {error.message || "Unknown error"}. The RPC may be rate limiting or unavailable; try again
        or set <code className="font-mono">NEXT_PUBLIC_RPC_URL</code> to a different endpoint.
      </p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function SkippedNotice({ skipped }: { skipped: number }) {
  if (skipped === 0) return null;
  return (
    <p className="text-sm text-warning">
      {skipped} account{skipped === 1 ? "" : "s"} could not be decoded with the expected layout and
      {skipped === 1 ? " was" : " were"} skipped.
    </p>
  );
}
