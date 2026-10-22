import { Button, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import { PERMISSIONS } from '@shared/constants/permissions';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import type { ProductMovementsFilterState } from '../types';
import { buildRebatchWizardHref, type RebatchWizardLaunchParams } from '../rebatchWizard';

interface ProductMovementsRebatchButtonProps {
  filters: ProductMovementsFilterState;
  /** Після переходу (наприклад закрити drawer). */
  onAfterNavigate?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

function launchParamsFromFilters(filters: ProductMovementsFilterState): RebatchWizardLaunchParams | null {
  const sku = String(filters.sku ?? '').trim();
  if (!sku) return null;

  return {
    sku,
    dilovodGoodId: filters.dilovodGoodId,
    productName: filters.productName,
    storageId: filters.storageId,
    firmId: filters.firmId,
    goodPartId: filters.goodPartId,
    autoFillBatches: true,
  };
}

export default function ProductMovementsRebatchButton({
  filters,
  onAfterNavigate,
  size = 'md',
  className,
}: ProductMovementsRebatchButtonProps) {
  const navigate = useNavigate();
  const { hasPermission } = useRoleAccess();
  const canRebatch = hasPermission(PERMISSIONS.PAGE_WAREHOUSE_RELEASES);

  if (!canRebatch) {
    return null;
  }

  const params = launchParamsFromFilters(filters);
  const disabled = !params;

  const handlePress = () => {
    if (!params) {
      ToastService.show({
        title: 'Оберіть товар',
        description: 'Для Rebatch потрібен SKU у фільтрах рухів.',
        color: 'warning',
      });
      return;
    }
    onAfterNavigate?.();
    navigate(buildRebatchWizardHref(params));
  };

  return (
    <Tooltip
      content="Коригування партійного обліку (wizard комплектування)"
      isDisabled={disabled}
    >
      <span className={className}>
        <Button
          size={size}
          variant="flat"
          color="primary"
          isDisabled={disabled}
          startContent={<DynamicIcon name="package-open" size={16} />}
          onPress={handlePress}
        >
          Rebatch
        </Button>
      </span>
    </Tooltip>
  );
}
