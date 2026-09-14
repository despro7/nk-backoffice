import React from 'react';

/** Fallback під час lazy-load сторінки (React.Suspense). */
export function PageRouteFallback(): React.ReactElement {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-border-subtle border-t-text-secondary"
          aria-hidden
        />
        <p className="text-sm text-text-secondary">Завантаження сторінки...</p>
      </div>
    </div>
  );
}
