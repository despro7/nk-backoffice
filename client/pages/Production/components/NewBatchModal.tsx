import { useEffect, useState } from 'react';
import { Textarea } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { BaseModal } from '@/components/modals/BaseModal';
import { NumberInputFromNumber } from '@/components/NumberInput';
import { ToastService } from '@/services/ToastService';
import { useProductionBatchActions } from '../useProductionBatches';
import { todayIso } from './batchUi';
import { BatchDatePicker } from './BatchDatePicker';

interface NewBatchModalProps {
  isOpen: boolean;
  goodId: string;
  goodName: string;
  /** План порцій за замовчуванням – «Порцій на варку» техкарти */
  defaultPortions: number;
  techCardVersion: number | null;
  overlayZ?: string;
  onClose: () => void;
}

/** «Нова варка» з чинної версії техкарти: план порцій, плановий день, коментар. */
export function NewBatchModal({
  isOpen,
  goodId,
  goodName,
  defaultPortions,
  techCardVersion,
  overlayZ,
  onClose,
}: NewBatchModalProps) {
  const navigate = useNavigate();
  const actions = useProductionBatchActions();
  const [portions, setPortions] = useState(defaultPortions);
  const [date, setDate] = useState(todayIso());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPortions(defaultPortions);
    setDate(todayIso());
    setComment('');
  }, [isOpen, defaultPortions]);

  const create = async () => {
    if (!(portions >= 1)) {
      ToastService.show({ title: 'Вкажіть план порцій', color: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const batch = await actions.create({ goodId, plannedPortions: portions, plannedDate: date, comment });
      ToastService.show({ title: `Варку ${batch.number} створено`, color: 'success' });
      onClose();
      navigate(`/production/batches/${batch.id}`);
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося створити варку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      title="Нова варка"
      message={
        <div className="flex flex-col gap-3">
          <p className="text-sm text-default-600">
            {goodName}
            {techCardVersion != null && <span className="text-default-400"> · техкарта v{techCardVersion}</span>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberInputFromNumber
              label="План порцій"
              value={portions}
              min={1}
              decimalPlaces={0}
              onChange={setPortions}
            />
            <BatchDatePicker label="Плановий день" value={date} onChange={setDate} isRequired />
          </div>
          <Textarea label="Коментар" minRows={2} value={comment} onValueChange={setComment} />
        </div>
      }
      confirmText="Створити"
      cancelText="Скасувати"
      confirmLoading={busy}
      overlayZClassName={overlayZ}
      onConfirm={() => void create()}
      onCancel={onClose}
    />
  );
}
