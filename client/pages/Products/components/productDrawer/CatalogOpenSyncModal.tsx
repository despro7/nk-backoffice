import type { ComponentProps } from 'react';
import { StorefrontPullConfirmModal } from './StorefrontPullConfirmModal';

/** Порівняння локально / WC / Діловод при відкритті картки (auto-open з ProductDrawer). */
export function CatalogOpenSyncModal(props: ComponentProps<typeof StorefrontPullConfirmModal>) {
  return <StorefrontPullConfirmModal {...props} />;
}
