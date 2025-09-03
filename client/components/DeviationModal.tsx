import { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";
import { Input } from "@heroui/input";

interface DeviationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const orderOptions = [
  { key: "6237", label: "Замовлення 6237 - 20451228129381" },
  { key: "6238", label: "Замовлення 6238 - 20451228203743" },
  { key: "6241", label: "Замовлення 6241 - 20451228133782" },
  { key: "6239", label: "Замовлення 6239 - 20451228201988" },
  { key: "6240", label: "Замовлення 6240 - 20451228211320" },
];

export function DeviationModal({ isOpen, onClose }: DeviationModalProps) {
  const [selectedOrder, setSelectedOrder] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

  const handleSubmit = () => {
    console.log("Deviation submitted:", { selectedOrder, quantity });
    onClose();
    // Reset form
    setSelectedOrder("");
    setQuantity(1);
  };

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="xl"
      placement="auto"
      backdrop="blur"
      classNames={{
        backdrop: "bg-black/50 backdrop-blur-sm",
        base: "border-none bg-white",
        header: "border-b-[1px] border-gray-200",
        body: "py-6",
        footer: "border-t-[1px] border-gray-200",
        closeButton: "hover:bg-gray-100 active:bg-gray-200",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-gray-900">
            Позначити відхилення порцій
          </h3>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                Виберіть замовлення
              </label>
              <Select
                placeholder="Знайти замовлення..."
                selectedKeys={selectedOrder ? [selectedOrder] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setSelectedOrder(selected);
                }}
                variant="bordered"
                size="lg"
                classNames={{
                  base: "w-full",
                  trigger: "min-h-[48px] border-gray-300 hover:border-gray-400 data-[focus=true]:border-blue-500",
                  value: "text-gray-900",
                  listbox: "bg-white",
                  popoverContent: "bg-white border border-gray-200 shadow-lg",
                }}
              >
                {orderOptions.map((order) => (
                  <SelectItem 
                    key={order.key} 
                    // value={order.key}
                    // className="text-gray-900 hover:bg-gray-400"
                  >
                    {order.label}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-gray-700">
                Кількість відхилених порцій
              </label>
              <div className="flex items-center gap-3 justify-center">
                <Button
                  size="lg"
                  variant="bordered"
                  onPress={decrementQuantity}
                  isIconOnly
                  className="min-w-[44px] h-11 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50"
                >
                  -
                </Button>
                <Input
                  type="number"
                  value={quantity.toString()}
                  onValueChange={(value) => setQuantity(Math.max(1, parseInt(value) || 1))}
                  size="lg"
                  variant="bordered"
                  className="w-24"
                  classNames={{
                    input: "text-center text-gray-900 font-medium",
                    inputWrapper: "h-11 border-gray-300 hover:border-gray-400 data-[focus=true]:border-blue-500",
                  }}
                  min="1"
                />
                <Button
                  size="lg"
                  variant="bordered"
                  onPress={incrementQuantity}
                  isIconOnly
                  className="min-w-[44px] h-11 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50"
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="flex gap-3">
          <Button 
            variant="light" 
            onPress={onClose}
            size="lg"
            className="text-gray-600 hover:bg-gray-100"
          >
            Скасувати
          </Button>
          <Button 
            color="danger" 
            onPress={handleSubmit}
            isDisabled={!selectedOrder}
            size="lg"
            className="text-white disabled:opacity-50"
          >
            Позначити відхилення
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
