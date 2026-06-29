import { useEffect, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface MonolithicSetAvailabilityQuizModalProps {
  isOpen: boolean;
  setName: string;
  releaseUrl?: string;
  onClose: () => void;
  onProceedAsPortions: () => void;
}

type QuizStep = 'question' | 'yes' | 'no';

export function MonolithicSetAvailabilityQuizModal({
  isOpen,
  setName,
  releaseUrl = '/warehouse/releases',
  onClose,
  onProceedAsPortions,
}: MonolithicSetAvailabilityQuizModalProps) {
  const [step, setStep] = useState<QuizStep>('question');

  useEffect(() => {
    if (isOpen) {
      setStep('question');
      return;
    }

    setStep('question');
  }, [isOpen]);

  const handleClose = () => {
    setStep('question');
    onClose();
  };

  const questionBody = (
    <div className="space-y-3 text-sm text-neutral-700">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <DynamicIcon name="package-x" size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p>
              Набір <span className="font-semibold text-neutral-900">{setName}</span> відсутній по обліку.
            </p>
            <p>
              Чи є у вас такий комплект в наявності (фактично)?
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const yesBody = (
    <div className="space-y-3 text-sm text-neutral-700">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <DynamicIcon name="info" size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <div className="space-y-3">
            <p>
              Перед початком комплектування цього набору зробіть випуск/комплектацію в розділі{' '}
              <a
                href={releaseUrl}
                className="font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-800"
              >
                Склад → Випуск наборів
              </a>
              .
            </p>
            <p>
              Після випуску можна повертатись до комплектування цього монолітного набору.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const noBody = (
    <div className="space-y-3 text-sm text-neutral-700">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex gap-3">
          <DynamicIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div className="space-y-2">
            <p>
              Цей набір буде відвантажено окремими порціями за складом, а не як монолітний набір.
            </p>
            <p>
              Це важливо для правильності підрахунків залишків.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      // backdrop="opaque"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onModalClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
              <DynamicIcon name="circle-help" size={18} className="text-amber-600" />
              Перевірка монолітного набору
            </ModalHeader>
            <ModalBody>
              {step === 'question' && questionBody}
              {step === 'yes' && yesBody}
              {step === 'no' && noBody}
            </ModalBody>
            <ModalFooter className="gap-2">
              {step === 'question' && (
                <>
                  <Button color="primary" onPress={() => setStep('yes')}>
                    Так
                  </Button>
                  <Button variant="flat" color="secondary" onPress={() => setStep('no')}>
                    Ні
                  </Button>
                </>
              )}

              {step === 'yes' && (
                <>
                  <Button as="a" href={releaseUrl} color="primary" variant="solid">
                    Відкрити Випуск наборів
                  </Button>
                  <Button variant="flat" onPress={() => {
                    onModalClose();
                    handleClose();
                  }}>
                    Зрозуміло
                  </Button>
                </>
              )}

              {step === 'no' && (
                <>
                  <Button
                    color="danger"
                    onPress={() => {
                      onModalClose();
                      handleClose();
                      onProceedAsPortions();
                    }}
                  >
                    Я розумію, продовжити
                  </Button>
                  <Button variant="flat" onPress={() => setStep('question')}>
                    Назад
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export default MonolithicSetAvailabilityQuizModal;