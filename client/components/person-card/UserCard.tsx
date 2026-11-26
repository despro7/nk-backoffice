import { useCallback, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '@heroui/react';
import { UserSessionsTable } from '@/components/sessions/UserSessionsTable';
import { SectionTitle } from '@/components/SectionTitle';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { UserCardPanel, type UserCardPanelHandle } from './panels/UserCardPanel';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import type { UserCardProps } from './UserCard.types';

export function UserCard({
  isOpen,
  user = null,
  initialValues,
  onClose,
  onSaved,
}: UserCardProps) {
  const panelRef = useRef<UserCardPanelHandle>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isCreate = user == null;

  const title = isCreate ? 'Створити користувача' : 'Редагувати користувача';

  const handleSaveDraft = useCallback(async () => {
    await panelRef.current?.save();
  }, []);

  const guard = useUnsavedGuard({
    isDirty: isOpen && isDirty,
    onSaveDraft: handleSaveDraft,
  });

  const requestClose = guard.guardAction(onClose, {
    title: 'Незбережені зміни',
    message: 'У картці користувача є незбережені зміни. Що зробити перед закриттям?',
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
        // Таблиці сесій потрібна ширша панель
        size={user ? '3xl' : 'xl'}
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
              <DrawerHeader className="border-b border-default-200 shrink-0">
                <SectionTitle icon={isCreate ? 'user-plus' : 'user-pen'}>{title}</SectionTitle>
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                <UserCardPanel
                  ref={panelRef}
                  isOpen={isOpen}
                  user={user}
                  initialValues={initialValues}
                  onSaved={onSaved}
                  onClose={onClose}
                  onBusyChange={setIsBusy}
                  onDirtyChange={setIsDirty}
                />
                {user && (
                  <div className="shrink-0 border-t border-default-200 pt-4">
                    <UserSessionsTable key={user.id} source={user.id} />
                  </div>
                )}
              </DrawerBody>
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={closeDrawer} isDisabled={isBusy}>
                  Скасувати
                </Button>
                <Button
                  className={HR_BTN_PRIMARY}
                  isLoading={isBusy}
                  isDisabled={!isDirty}
                  onPress={handleSave}
                >
                  {isCreate ? 'Створити' : 'Зберегти'}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />
    </>
  );
}
