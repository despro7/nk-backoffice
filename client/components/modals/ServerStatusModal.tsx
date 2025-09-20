import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";

interface ServerStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOffline: boolean;
}

export function ServerStatusModal({ isOpen, onClose, isOffline }: ServerStatusModalProps) {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      isDismissable={false}
      hideCloseButton={true}
      size="md"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 text-lg font-semibold">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isOffline ? 'bg-red-100' : 'bg-green-100'
          }`}>
            <DynamicIcon 
              name={isOffline ? "triangle-alert" : "check-circle"} 
              size={20} 
              className={isOffline ? 'text-red-600' : 'text-green-600'} 
            />
          </div>
          {isOffline ? 'Сервер недоступний' : 'Сервер відновлено'}
        </ModalHeader>
        <ModalBody>
          <p className="text-neutral-600">
            {isOffline 
              ? 'Сервер тимчасово недоступний. Деякі функції можуть працювати обмежено. Спробуйте оновити сторінку або зверніться до адміністратора.'
              : 'З\'єднання з сервером відновлено. Всі функції працюють нормально.'
            }
          </p>
        </ModalBody>
        <ModalFooter>
          <Button 
            color={isOffline ? "danger" : "success"} 
            onPress={onClose}
            className="w-full"
          >
            {isOffline ? 'Зрозуміло' : 'Добре'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
