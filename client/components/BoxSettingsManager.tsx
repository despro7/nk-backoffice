import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { SettingsBoxes } from "../types/boxes";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Textarea,
  Switch,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  addToast,
  NumberInput,
} from "@heroui/react";
import { Plus, Edit, Trash2, Package } from "lucide-react";
import { ConfirmModal } from "./modals/ConfirmModal";

interface BoxFormData {
  name: string;
  marking: string;
  qntFrom: number;
  qntTo: number;
  width: number;
  height: number;
  length: number;
  weight: number;
  self_weight: number;
  description: string;
  isActive: boolean;
}

const initialFormData: BoxFormData = {
  name: "",
  marking: "",
  qntFrom: 0,
  qntTo: 0,
  width: 0,
  height: 0,
  length: 0,
  weight: 0,
  self_weight: 0,
  description: "",
  isActive: true,
};

export const BoxSettingsManager: React.FC = () => {
  const { apiCall } = useApi();
  const [boxes, setBoxes] = useState<SettingsBoxes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBox, setEditingBox] = useState<SettingsBoxes | null>(null);
  const [formData, setFormData] = useState<BoxFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Загрузка коробок
  const fetchBoxes = async () => {
    try {
      setLoading(true);
      const response = await apiCall("/api/boxes?all=true"); // Получаем все коробки

      if (response.ok) {
        const boxesData = await response.json();
        setBoxes(boxesData);
        setError(null);
      } else {
        setError(`Не удалось загрузить настройки коробок: ${response.status}`);
      }
    } catch (err) {
      setError("Ошибка при загрузке настроек коробок");
    } finally {
      setLoading(false);
    }
  };

  // Открытие модального окна для создания/редактирования
  const openModal = (box?: SettingsBoxes) => {
    if (box) {
      setEditingBox(box);
      setFormData({
        name: box.name,
        marking: box.marking,
        qntFrom: box.qntFrom,
        qntTo: box.qntTo,
        width: box.width,
        height: box.height,
        length: box.length,
        weight: Number(box.weight),
        self_weight: Number(box.self_weight),
        description: box.description || "",
        isActive: box.isActive,
      });
    } else {
      setEditingBox(null);
      setFormData(initialFormData);
    }
    onOpen();
  };

  // Закрытие модального окна
  const closeModal = () => {
    onClose();
    setEditingBox(null);
    setFormData(initialFormData);
    setIsSubmitting(false);
  };

  // Обработка изменения формы
  const handleInputChange = (
    field: keyof BoxFormData,
    value: string | number | boolean,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Обработка изменения текстовых полей
  const handleTextChange = (field: keyof BoxFormData, value: string) => {
    handleInputChange(field, value);
  };

  // Обработка изменения числовых полей
  const handleNumberChange = (field: keyof BoxFormData, value: string) => {
    const numValue = field.includes("weight")
      ? parseFloat(value) || 0
      : parseInt(value) || 0;
    handleInputChange(field, numValue);
  };

  // Сохранение коробки
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      const url = editingBox ? `/api/boxes/${editingBox.id}` : "/api/boxes";

      const method = editingBox ? "PUT" : "POST";

      const response = await apiCall(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchBoxes();
        closeModal();
        addToast({
          title: "Успіх",
          description: "Коробка успішно збережена",
          color: "success",
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Ошибка при сохранении коробки");
        addToast({
          title: "Помилка",
          description: "Помилка при збереженні коробки",
          color: "danger",
        });
      }
    } catch (err) {
      setError("Ошибка при сохранении коробки");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Удаление коробки
  const [confirmBoxId, setConfirmBoxId] = useState<number | null>(null);

  const doDelete = async (boxId: number) => {
    try {
      const response = await apiCall(`/api/boxes/${boxId}`, { method: "DELETE" });
  
      if (response.ok) {
        await fetchBoxes();
        addToast({
          title: "Успіх",
          description: "Коробка успішно видалена",
          color: "success",
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Помилка при видаленні коробки");
        addToast({
          title: "Помилка",
          description: "Помилка при видаленні коробки",
          color: "danger",
        });
      }
    } catch (err) {
      setError("Помилка при видаленні коробки");
      addToast({
        title: "Помилка",
        description: "Помилка при видаленні коробки",
        color: "danger",
      });
    }
  };

  // Быстрое переключение статуса коробки
  const handleToggleStatus = async (boxId: number, currentStatus: boolean) => {
    try {
      const response = await apiCall(`/api/boxes/${boxId}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (response.ok) {
        // Обновляем локальное состояние без перезагрузки всех коробок
        setBoxes((prevBoxes) =>
          prevBoxes.map((box) =>
            box.id === boxId ? { ...box, isActive: !currentStatus } : box,
          ),
        );
        addToast({
          title: "Успіх",
          description: "Статус коробки успішно змінено",
          color: "success",
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Ошибка при изменении статуса коробки");
        addToast({
          title: "Помилка",
          description: "Помилка при зміні статусу коробки",
          color: "danger",
        });
      }
    } catch (err) {
      setError("Ошибка при изменении статуса коробки");
      addToast({
        title: "Помилка",
        description: "Помилка при зміні статусу коробки",
        color: "danger",
      });
    }
  };

  // Загрузка при монтировании
  useEffect(() => {
    fetchBoxes();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <Button
          color="danger"
          variant="flat"
          size="sm"
          className="mt-2"
          onPress={() => fetchBoxes()}
        >
          Спробувати знову
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок с кнопкой добавления */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">
          Налаштування коробок
        </h2>
        <Button
          color="primary"
          variant="solid"
          startContent={<Plus className="w-4 h-4" />}
          onPress={() => openModal()}
        >
          Додати коробку
        </Button>
      </div>

      {/* Список коробок */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {boxes
          .sort((a, b) => {
            // Сначала сортируем по максимальной вместимости (qntTo)
            if (a.qntTo !== b.qntTo) {
              return a.qntTo - b.qntTo;
            }
            // Если вместимость одинаковая, сортируем по маркировке
            return a.marking.localeCompare(b.marking);
          })
          .map((box) => (
            <Card key={box.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex items-center justify-between pt-3 px-5 pb-2 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-gray-900">{box.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="primary"
                    onPress={() => openModal(box)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => setConfirmBoxId(box.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-5 pt-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Маркування:</span>
                    <span className="font-medium">{box.marking}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Місткість:</span>
                    <span className="font-medium">
                      {box.qntFrom}-{box.qntTo} порций
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Розміри:</span>
                    <span className="font-medium">
                      {box.width}×{box.height}×{box.length} см
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Вантажопідйомність:</span>
                    <span className="font-medium">
                      {Number(box.weight).toFixed(1)} кг
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Вага коробки:</span>
                    <span className="font-medium">
                      {Number(box.self_weight).toFixed(2)} кг
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Переповнення (в режимі економії):
                    </span>
                    <span className="font-medium">
                      {Number(box.overflow).toFixed(0)}
                    </span>
                  </div>
                  {box.description && (
                    <div className="pt-2 border-t">
                      <span className="text-gray-600 text-xs">
                        {box.description}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-gray-600 text-xs">Статус:</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        size="sm"
                        isSelected={box.isActive}
                        onValueChange={() =>
                          handleToggleStatus(box.id, box.isActive)
                        }
                        color={box.isActive ? "success" : "default"}
                      />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
      </div>
      
      {/* Модальное окно для удаления */}
      <ConfirmModal
        isOpen={!!confirmBoxId}
        title="Видалити коробку?"
        message="Ви впевнені, що хочете видалити цю коробку?"
        confirmText="Так, видалити"
        cancelText="Скасувати"
        onConfirm={async () => {
          if (confirmBoxId) {
            await doDelete(confirmBoxId); // твоя логика удаления
          }
          setConfirmBoxId(null);
        }}
        onCancel={() => setConfirmBoxId(null)}
      />

      {/* Модальное окно для создания/редактирования */}
      <Modal isOpen={isOpen} onClose={closeModal} size="2xl">
        <ModalContent>
          <ModalHeader>
            {editingBox ? "Редагувати коробку" : "Додати нову коробку"}
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-6 gap-4">
              <Input
                label="Назва"
                value={formData.name}
                onValueChange={(value) => handleTextChange("name", value)}
                placeholder="Наприклад: Коробка NK"
                className="col-span-3"
                isRequired
              />
              <Input
                label="Маркування"
                value={formData.marking}
                onValueChange={(value) => handleTextChange("marking", value)}
                placeholder="Наприклад: NK"
                className="col-span-3"
                isRequired
              />
              <NumberInput
                label="Мін. кількість порцій"
                min={0}
                max={30}
                step={1}
                value={formData.qntFrom}
                onValueChange={(value) => handleNumberChange("qntFrom", value.toString())}
                placeholder="0"
                className="col-span-3"
                isRequired
              />
              <NumberInput
                label="Макс. кількість порцій"
                min={0}
                max={50}
                step={1}
                value={formData.qntTo}
                onValueChange={(value) => handleNumberChange("qntTo", value.toString())}
                placeholder="0.00"
                className="col-span-3"
                isRequired
              />
              <NumberInput
                label="Ширина (см)"
                min={0}
                value={formData.width}
                onValueChange={(value) => handleNumberChange("width", value.toString())}
                placeholder="25.00"
                className="col-span-2"
                isRequired
              />
              <NumberInput
                label="Висота (см)"
                min={0}
                max={100}
                value={formData.height}
                onValueChange={(value) => handleNumberChange("height", value.toString())}
                placeholder="15.00"
                className="col-span-2"
                isRequired
              />
              <NumberInput
                label="Довжина (см)"
                min={0}
                value={formData.length}
                onValueChange={(value) => handleNumberChange("length", value.toString())}
                placeholder="20.00"
                className="col-span-2"
                isRequired
              />
              <NumberInput
                label="Вантажопідйомність (кг)"
                min={0}
                step={1}
                value={formData.weight}
                onValueChange={(value) => handleNumberChange("weight", value.toString())}
                placeholder="5.00"
                className="col-span-3"
                isRequired
              />
              <NumberInput
                label="Вага коробки (кг)"
                value={formData.self_weight}
                onValueChange={(value) => handleNumberChange("self_weight", value.toString())}
                min={0}
                max={5}
                step={0.01}
                placeholder="0.15"
                className="col-span-3"
                isRequired
              />

            </div>
            <div className="mt-4">
              <Textarea
                label="Опис"
                value={formData.description}
                onValueChange={(value) =>
                  handleTextChange("description", value)
                }
                placeholder="Додаткова інформація про коробку"
                rows={3}
              />
            </div>
            <div className="mt-4">
              <Switch
                isSelected={formData.isActive}
                onValueChange={(value) => handleInputChange("isActive", value)}
              >
                Активна
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={handleSubmit}
              isLoading={isSubmitting}
            >
              {editingBox ? "Зберегти" : "Створити"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};
