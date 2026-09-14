import { useCallback, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '@heroui/react';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { PersonCardPanel, type PersonCardPanelHandle } from './panels/PersonCardPanel';
import { HR_BTN_PRIMARY } from '@/pages/Hr/hrUi';
import type { PersonCardProps } from './PersonCard.types';

export function PersonCard({
  isOpen,
  person = null,
  initialValues,
  canManage = true,
  enableMerge = true,
  syncOnSave = true,
  onClose,
  onSaved,
}: PersonCardProps) {
  const panelRef = useRef<PersonCardPanelHandle>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isCreate = person == null;

  const title = isCreate
    ? 'Нова фізична особа'
    : canManage
      ? 'Редагування фіз. особи'
      : 'Перегляд фіз. особи';

  const handleSaveDraft = useCallback(async () => {
    await panelRef.current?.save();
  }, []);

  const guard = useUnsavedGuard({
    isDirty: isOpen && canManage && isDirty,
    onSaveDraft: handleSaveDraft,
  });

  const requestClose = guard.guardAction(onClose, {
    title: 'Незбережені зміни',
    message: 'У картці фіз. особи є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const closeDrawer = useCallback(() => {
    if (isBusy) return;
    requestClose();
  }, [isBusy, requestClose]);

  const handleSave = () => {
    void panelRef.current?.save();
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) closeDrawer(); }}
        placement="right"
        size="xl"
        classNames={{
          wrapper: '!z-[60]',
          backdrop: '!z-[55] bg-overlay/20',
          base: 'flex flex-col shadow-2xl',
          body: 'flex-1 min-h-0 overflow-y-auto',
          closeButton: 'top-4',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-border-subtle shrink-0">
                {title}
              </DrawerHeader>
              <DrawerBody className="flex flex-col gap-5 py-5 overflow-y-auto min-h-0">
                <PersonCardPanel
                  ref={panelRef}
                  isOpen={isOpen}
                  person={person}
                  initialValues={initialValues}
                  canManage={canManage}
                  enableMerge={enableMerge}
                  syncOnSave={syncOnSave}
                  onSaved={onSaved}
                  onClose={onClose}
                  onBusyChange={setIsBusy}
                  onDirtyChange={setIsDirty}
                />
              </DrawerBody>
              <DrawerFooter className="border-t border-border-subtle shrink-0">
                <Button variant="light" onPress={closeDrawer} isDisabled={isBusy}>
                  {canManage ? 'Скасувати' : 'Закрити'}
                </Button>
                {canManage ? (
                  <Button className={HR_BTN_PRIMARY} isLoading={isBusy} isDisabled={!isDirty} onPress={handleSave}>
                    {isCreate ? 'Створити' : 'Зберегти'}
                  </Button>
                ) : null}
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />
    </>
  );
}
