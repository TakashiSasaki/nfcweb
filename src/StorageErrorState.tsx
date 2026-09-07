import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface StorageErrorStateProps {
  error?: string | null;
  onRetry: () => void | Promise<unknown>;
}

export function StorageErrorState({ error, onRetry }: StorageErrorStateProps) {
  return (
    <div
      data-testid="storage-error-state"
      className="flex h-full flex-col items-center justify-center px-6 py-16 text-center text-slate-400"
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-950/40">
        <AlertTriangle className="h-7 w-7 text-amber-300" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-100">Could not load local tag data</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
        {error || 'The local IndexedDB registry could not be read.'}
      </p>
      <button
        type="button"
        data-testid="storage-retry-button"
        onClick={() => void onRetry()}
        className="mt-4 flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Retry</span>
      </button>
    </div>
  );
}
