import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogDictItemDto } from '../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
} from '../ProductsTypes';
import type { CatalogItemLabel } from '../ProductsUtils';
import type { DrawerObjectKind } from './productDrawer/productDrawerTypes';
import { OBJECT_KIND_TABS } from './productDrawer/productDrawerTypes';
import { CatalogConfirmItemsList } from './CatalogConfirmItemsList';

const CHANGEABLE_KINDS = OBJECT_KIND_TABS.filter((t) => t.key !== 'group');

interface ChangeObjectTypeModalProps {
  isOpen: boolean;
  items: CatalogItemLabel[];
  accPolicies: CatalogDictItemDto[];
  loading?: boolean;
  onConfirm: (accPolicyId: string) => void;
  onClose: () => void;
}

export function ChangeObjectTypeModal({
  isOpen,
  items,
  accPolicies,
  loading,
  onConfirm,
  onClose,
}: ChangeObjectTypeModalProps) {
  const [kind, setKind] = useState<Exclude<DrawerObjectKind, 'group'> | null>(null);
  const [otherAccPolicyId, setOtherAccPolicyId] = useState('');

  const goods = useMemo(() => items.filter((i) => !i.isGroup), [items]);
  const skippedGroups = items.length - goods.length;

  const otherAccPolicies = useMemo(
    () =>
      [...accPolicies]
        .filter((p) => p.id !== CATALOG_ACC_POLICY_GOOD && p.id !== CATALOG_ACC_POLICY_KIT)
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [accPolicies]
  );

  useEffect(() => {
    if (!isOpen) return;
    setKind(null);
    setOtherAccPolicyId(otherAccPolicies[0]?.id || '');
  }, [isOpen, otherAccPolicies]);

  const resolvedAccPolicyId =
    kind === 'good'
      ? CATALOG_ACC_POLICY_GOOD
      : kind === 'kit'
        ? CATALOG_ACC_POLICY_KIT
        : kind === 'other'
          ? otherAccPolicyId
          : '';

  const canConfirm =
    Boolean(resolvedAccPolicyId) && goods.length > 0 && !loading && (kind !== 'other' || Boolean(otherAccPolicyId));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[85vh]',
        body: 'py-3',
      }}
    >
      <ModalContent>
        <ModalHeader>Змінити тип обʼєкта</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-default-600">
            Новий тип буде застосовано до {goods.length} товар(ів).
            {skippedGroups > 0 ? ` Групи (${skippedGroups}) буде пропущено.` : ''}
          </p>
          <CatalogConfirmItemsList items={goods.length > 0 ? goods : items} />
          <Select
            label="Тип обʼєкта"
            placeholder="Оберіть тип"
            isRequired
            selectedKeys={kind ? [kind] : []}
            classNames={{
              popoverContent: 'bg-default-100 w-auto min-w-max',
            }}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0];
              if (!v) return;
              setKind(String(v) as Exclude<DrawerObjectKind, 'group'>);
            }}
            renderValue={(selected) => {
              const key = selected[0]?.key;
              const tab = CHANGEABLE_KINDS.find((t) => t.key === String(key));
              if (!tab) return null;
              return (
                <div className="flex items-center gap-2">
                  <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                  {tab.title}
                </div>
              );
            }}
          >
            {CHANGEABLE_KINDS.map((tab) => (
              <SelectItem key={tab.key} textValue={tab.title}>
                <div className="flex items-center gap-2">
                  <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                  {tab.title}
                </div>
              </SelectItem>
            ))}
          </Select>
          {kind === 'other' && (
            <Select
              label="Політика обліку"
              selectedKeys={otherAccPolicyId ? [otherAccPolicyId] : []}
              classNames={{ popoverContent: 'bg-default-100' }}
              onSelectionChange={(keys) => {
                const v = Array.from(keys)[0];
                if (!v) return;
                setOtherAccPolicyId(String(v));
              }}
              description={
                otherAccPolicies.length === 0
                  ? 'Немає інших типів у довіднику accPolicies'
                  : undefined
              }
            >
              {otherAccPolicies.map((p) => (
                <SelectItem key={p.id}>{p.name}</SelectItem>
              ))}
            </Select>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>
            Скасувати
          </Button>
          <Button
            color="primary"
            isDisabled={!canConfirm}
            isLoading={loading}
            onPress={() => {
              if (!canConfirm) return;
              onConfirm(resolvedAccPolicyId);
            }}
          >
            Змінити тип
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
