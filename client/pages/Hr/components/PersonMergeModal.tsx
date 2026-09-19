import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
} from '@heroui/react';
import type { HrPersonDto } from '@shared/types/hr';

export type PersonMergeCandidate = Pick<HrPersonDto, 'id' | 'displayName' | 'taxCode' | 'phone'>;

interface PersonMergeModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  variant: 'radio' | 'select';
  sourcePerson?: PersonMergeCandidate | null;
  candidates: PersonMergeCandidate[];
  selectedId: number | null;
  onSelectedIdChange: (id: number | null) => void;
  onClose: () => void;
  onConfirm: () => void;
  currentPersonId?: number | null;
}

export function PersonMergeModal({
  isOpen,
  isLoading = false,
  variant,
  sourcePerson = null,
  candidates,
  selectedId,
  onSelectedIdChange,
  onClose,
  onConfirm,
  currentPersonId = null,
}: PersonMergeModalProps) {
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const canConfirm = selectedId != null && (
    variant === 'select'
      ? candidates.some((item) => item.id === selectedId)
      : candidates.length >= 2
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      classNames={{ wrapper: variant === 'radio' ? '!z-[70]' : undefined }}
    >
      <ModalContent>
        <ModalHeader>Обʼєднати особи</ModalHeader>
        <ModalBody className="gap-4">
          {variant === 'radio' ? (
            <>
              <p className="text-sm text-default-500">
                Оберіть основний запис. Інші особи будуть позначені як дублікати, а привʼязки співробітників перенесуться до обраної особи.
              </p>
              <RadioGroup
                label="Оберіть основний запис для обʼєднання"
                value={selectedId != null ? String(selectedId) : ''}
                onValueChange={(value) => onSelectedIdChange(value ? Number(value) : null)}
                classNames={{
                  base: 'border-1 border-primary-500/20 p-2 px-3 bg-primary-50/50 rounded-md [&_label]:gap-1',
                  label: 'text-sm font-medium text-primary-400',
                }}
              >
                {candidates.map((candidate) => (
                  <Radio key={String(candidate.id)} value={String(candidate.id)}>
                    <div className="text-sm font-medium">{candidate.displayName}</div>
                    <div className="text-xs text-default-500">
                      {candidate.taxCode ? `ІПН ${candidate.taxCode}` : 'Без ІПН'}
                      {candidate.phone ? ` · ${candidate.phone}` : ''}
                      {candidate.id === currentPersonId ? ' · поточний запис' : ''}
                    </div>
                  </Radio>
                ))}
              </RadioGroup>
            </>
          ) : (
            <>
              <p className="text-sm text-default-500">
                Запис «{sourcePerson?.displayName}» буде позначено як дублікат, а привʼязки співробітників перенесуться до обраної особи.
              </p>
              <Select
                label="Оберіть основний запис"
                labelPlacement="outside"
                placeholder="Оберіть особу"
                selectedKeys={selectedId != null ? [String(selectedId)] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0];
                  onSelectedIdChange(selected ? Number(selected) : null);
                }}
              >
                {candidates.map((person) => (
                  <SelectItem key={String(person.id)} textValue={person.displayName}>
                    {person.displayName}
                  </SelectItem>
                ))}
              </Select>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={handleClose} isDisabled={isLoading}>
            Скасувати
          </Button>
          <Button
            color="primary"
            isLoading={isLoading}
            isDisabled={!canConfirm}
            onPress={onConfirm}
          >
            Обʼєднати
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
