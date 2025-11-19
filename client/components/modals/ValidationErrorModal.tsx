import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ValidationErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  errors: string[];
  actionRequired?: string;
  onOpenSettings?: () => void;
}

export default function ValidationErrorModal({
  isOpen,
  onClose,
  title,
  errors,
  actionRequired,
  onOpenSettings
}: ValidationErrorModalProps) {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="2xl"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-danger-100 dark:bg-danger-900/20 rounded-xl">
                  <DynamicIcon name="triangle-alert" className="w-6 h-6 text-danger-600 dark:text-danger-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {title}
                  </h3>
                  <p className="text-sm text-default-500 font-normal">
                    Експорт заблоковано через критичні помилки конфігурації
                  </p>
                </div>
              </div>
            </ModalHeader>

            <ModalBody>
              <div className="space-y-4">
                <Card className="border border-danger-200 dark:border-danger-800">
                  <CardBody className="p-4">
                    <h4 className="font-medium mb-3 text-danger-700 dark:text-danger-300">
                      Знайдені критичні помилки:
                    </h4>
                    <ul className="space-y-2">
                      {errors.map((error, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="flex-shrink-0 w-5 h-5 bg-danger-100 dark:bg-danger-900/30 text-danger-600 dark:text-danger-400 rounded-full flex items-center justify-center text-xs font-medium mt-0.5">
                            {index + 1}
                          </span>
                          <span className="text-default-700 dark:text-default-300">
                            {error}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>

                {actionRequired && (
                  <Card className="border border-warning-200 dark:border-warning-800">
                    <CardBody className="p-4">
                      <h4 className="font-medium mb-2 text-warning-700 dark:text-warning-300">
                        Необхідні дії:
                      </h4>
                      <p className="text-sm text-default-700 dark:text-default-300">
                        {actionRequired}
                      </p>
                    </CardBody>
                  </Card>
                )}

                <div className="bg-default-50 dark:bg-default-900/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2 text-default-700 dark:text-default-300">
                    💡 Рекомендації:
                  </h4>
                  <ul className="text-sm text-default-600 dark:text-default-400 space-y-1">
                    <li>• Перевірте налаштування мапінгу каналів оплати</li>
                    <li>• Переконайтеся, що вказані рахунки та фірми існують у Dilovod</li>
                    <li>• Перевірте налаштування складу за замовчуванням</li>
                    <li>• При потребі зверніться до адміністратора</li>
                  </ul>
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <div className="flex gap-2 w-full">
                {onOpenSettings && (
                  <Button
                    variant="flat"
                    color="primary"
                    className="bg-blue-100"
                    startContent={<DynamicIcon name="settings" className="w-4 h-4" />}
                    onPress={() => {
                      onOpenSettings();
                      onClose();
                    }}
                  >
                    Відкрити налаштування
                  </Button>
                )}
                <div className="flex-1" />
                <Button color="danger" variant="light" onPress={onClose}>
                  Закрити
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}