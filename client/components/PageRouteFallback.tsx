import React from 'react';

/** Fallback під час lazy-load сторінки (React.Suspense). */
export function PageRouteFallback(): React.ReactElement {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-default-200 border-t-default-500"
          aria-hidden
        />
        <p className="text-sm text-default-500">Завантаження сторінки...</p>
      </div>
    </div>
  );
}
