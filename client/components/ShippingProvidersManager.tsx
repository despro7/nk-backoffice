import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { Button } from '@heroui/react';
import { Input } from '@heroui/react';
import { Select, SelectItem } from '@heroui/react';
import { Switch } from '@heroui/react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { addToast } from '@heroui/toast';
import { Trash2, Pencil, Plus, Check, X, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

interface ShippingProvider {
  id: number;
  name: string;
  providerType: 'novaposhta' | 'ukrposhta';
  senderName: string;
  senderId: number;
  isActive: boolean;
  order: number;
  apiKey?: string;
  bearerEcom?: string;
  counterpartyToken?: string;
  bearerStatus?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateProviderData {
  name: string;
  providerType: 'novaposhta' | 'ukrposhta';
  senderName: string;
  senderId: number;
  isActive: boolean;
  apiKey?: string;
  bearerEcom?: string;
  counterpartyToken?: string;
  bearerStatus?: string;
}

export const ShippingProvidersManager: React.FC = () => {
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ShippingProvider | null>(null);
  const [formData, setFormData] = useState<CreateProviderData>({
    name: 'Нова Пошта', // Автоматично встановлюємо назву за замовчуванням
    providerType: 'novaposhta',
    senderName: '',
    senderId: 0,
    isActive: false,
    apiKey: '',
    bearerEcom: '',
    counterpartyToken: '',
    bearerStatus: ''
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/shipping-providers');
      const result = await response.json();

      if (result.success) {
        setProviders(result.data);
      } else {
        addToast({
          title: 'Помилка завантаження',
          description: result.error || 'Не вдалося завантажити провайдерів',
          color: 'danger'
        });
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося завантажити провайдерів',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProvider = async () => {
    try {
      const response = await fetch('/api/shipping-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        addToast({
          title: 'Успіх',
          description: 'Провайдер успішно створено',
          color: 'success'
        });
        loadProviders();
        resetForm();
        onClose();
      } else {
        addToast({
          title: 'Помилка створення',
          description: result.error || 'Не вдалося створити провайдера',
          color: 'danger'
        });
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося створити провайдера',
        color: 'danger'
      });
    }
  };

  const handleUpdateProvider = async () => {
    if (!editingProvider) return;

    try {
      const response = await fetch(`/api/shipping-providers/${editingProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        addToast({
          title: 'Успіх',
          description: 'Провайдер успішно оновлено',
          color: 'success'
        });
        loadProviders();
        resetForm();
        setEditingProvider(null);
        onEditClose();
      } else {
        addToast({
          title: 'Помилка оновлення',
          description: result.error || 'Не вдалося оновити провайдера',
          color: 'danger'
        });
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося оновити провайдера',
        color: 'danger'
      });
    }
  };

  const handleDeleteProvider = async (id: number) => {
    if (!confirm('Ви впевнені, що хочете видалити цього провайдера?')) {
      return;
    }

    try {
      const response = await fetch(`/api/shipping-providers/${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        addToast({
          title: 'Успіх',
          description: 'Провайдер успішно видалено',
          color: 'success'
        });
        loadProviders();
      } else {
        addToast({
          title: 'Помилка видалення',
          description: result.error || 'Не вдалося видалити провайдера',
          color: 'danger'
        });
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося видалити провайдера',
        color: 'danger'
      });
    }
  };

  const handleActivateProvider = async (id: number) => {
    try {
      const response = await fetch(`/api/shipping-providers/${id}/activate`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        addToast({
          title: 'Успіх',
          description: 'Провайдер успішно активовано',
          color: 'success'
        });
        loadProviders();
      } else {
        addToast({
          title: 'Помилка активації',
          description: result.error || 'Не вдалося активувати провайдера',
          color: 'danger'
        });
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося активувати провайдера',
        color: 'danger'
      });
    }
  };

  const handleEditProvider = (provider: ShippingProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      providerType: provider.providerType,
      senderName: provider.senderName,
      senderId: provider.senderId,
      isActive: provider.isActive,
      apiKey: provider.apiKey || '',
      bearerEcom: provider.bearerEcom || '',
      counterpartyToken: provider.counterpartyToken || '',
      bearerStatus: provider.bearerStatus || ''
    });
    onEditOpen();
  };

  const resetForm = () => {
    setFormData({
      name: 'Нова Пошта', // Автоматично встановлюємо назву за замовчуванням
      providerType: 'novaposhta',
      senderName: '',
      senderId: 0,
      isActive: false,
      apiKey: '',
      bearerEcom: '',
      counterpartyToken: '',
      bearerStatus: ''
    });
  };

  const getProviderTypeLabel = (type: string) => {
    return type === 'novaposhta' ? 'Нова Пошта' : 'Укрпошта';
  };

  const getProviderIcon = (type: string) => {
    return type === 'novaposhta' ? '/icons/nova-poshta.svg' : '/icons/ukr-poshta.svg';
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const items = Array.from(providers);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Оновлюємо локальний стан
    setProviders(items);

    // Оновлюємо порядок на сервері
    try {
      const updatedProviders = items.map((provider, index) => ({
        id: provider.id,
        order: index + 1
      }));

      const response = await fetch('/api/shipping-providers/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: updatedProviders })
      });

      const result = await response.json();

      if (!result.success) {
        addToast({
          title: 'Помилка',
          description: 'Не вдалося оновити порядок провайдерів',
          color: 'danger'
        });
        // Відновлюємо попередній стан
        loadProviders();
      }
    } catch (error) {
      addToast({
        title: 'Помилка',
        description: 'Не вдалося оновити порядок провайдерів',
        color: 'danger'
      });
      // Відновлюємо попередній стан
      loadProviders();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between p-5">
        <div>
          <h3 className="text-lg font-semibold">Провайдери доставки</h3>
          <p className="text-sm text-gray-600">Управління API ключами для різних відправників</p>
        </div>
        <Button
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={onOpen}
        >
          Додати провайдера
        </Button>
      </CardHeader>

      <CardBody className="p-5">
        {loading ? (
          <div className="text-center py-8">Завантаження...</div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="providers">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-4"
                >
                  {providers.map((provider, index) => (
                    <Draggable key={provider.id} draggableId={provider.id.toString()} index={index}>
                      {(provided, snapshot) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`border ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                        >
                          <CardBody>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {/* Drag handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
                                >
                                  <GripVertical className="w-4 h-4 text-gray-400" />
                                </div>

                                {/* Provider icon */}
                                <img
                                  src={getProviderIcon(provider.providerType)}
                                  alt={getProviderTypeLabel(provider.providerType)}
                                  className={`w-6 h-6 ${provider.isActive ? 'grayscale-0' : 'grayscale opacity-50'}`}
                                />

                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <h4 className={`font-medium ${provider.isActive ? 'text-gray-900' : 'text-gray-400'}`}>{provider.senderName}</h4>
                                    {provider.isActive && (
                                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        Активний
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-sm ${provider.isActive ? 'text-gray-600' : 'text-gray-400'}`}>{provider.name}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!provider.isActive && (
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    startContent={<Check className="w-4 h-4" />}
                                    onPress={() => handleActivateProvider(provider.id)}
                                  >
                                    Активувати
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="flat"
                                  startContent={<Pencil className="w-4 h-4" />}
                                  onPress={() => handleEditProvider(provider)}
                                >
                                  Редагувати
                                </Button>

                                <Button
                                  size="sm"
                                  color="danger"
                                  variant="flat"
                                  startContent={<Trash2 className="w-4 h-4" />}
                                  onPress={() => handleDeleteProvider(provider.id)}
                                >
                                  Видалити
                                </Button>
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  {providers.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      Немає налаштованих провайдерів
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </CardBody>

      {/* Modal для створення */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>Додати провайдера доставки</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Input
                  label="Назва відправника"
                  placeholder="Наприклад: ФОП Бубнов С.В."
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                  aria-label="Введіть назву відправника"
                />

                <Input
                  label="senderId (SalesDrive API)"
                  placeholder="Наприклад: 1"
                  value={String(formData.senderId)}
                  onChange={(e) => setFormData({ ...formData, senderId: Number(e.target.value) })}
                  aria-label="Введіть senderId"
                />
              </div>

              <Select
                label="Тип провайдера"
                selectedKeys={[formData.providerType]}
                onChange={(e) => {
                  const providerType = e.target.value as 'novaposhta' | 'ukrposhta';
                  const providerName = providerType === 'novaposhta' ? 'Нова Пошта' : 'Укрпошта';
                  setFormData({ ...formData, providerType, name: providerName });
                }}
                aria-label="Виберіть тип провайдера доставки"
                disallowEmptySelection
              >
                <SelectItem key="novaposhta">Нова Пошта</SelectItem>
                <SelectItem key="ukrposhta">Укрпошта</SelectItem>
              </Select>

              {formData.providerType === 'novaposhta' && (
                <Input
                  label="API ключ Нової Пошти"
                  placeholder="Введіть API ключ"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  aria-label="Введіть API ключ Нової Пошти"
                />
              )}

              {formData.providerType === 'ukrposhta' && (
                <>
                  <Input
                    label="Bearer токен (Ecom)"
                    placeholder="Bearer токен для ecom API"
                    value={formData.bearerEcom}
                    onChange={(e) => setFormData({ ...formData, bearerEcom: e.target.value })}
                    aria-label="Введіть Bearer токен для ecom API Укрпошти"
                  />

                  <Input
                    label="Counterparty токен"
                    placeholder="Counterparty токен"
                    value={formData.counterpartyToken}
                    onChange={(e) => setFormData({ ...formData, counterpartyToken: e.target.value })}
                    aria-label="Введіть Counterparty токен Укрпошти"
                  />

                  <Input
                    label="Bearer токен (Status)"
                    placeholder="Bearer токен для статусів"
                    value={formData.bearerStatus}
                    onChange={(e) => setFormData({ ...formData, bearerStatus: e.target.value })}
                    aria-label="Введіть Bearer токен для статусів Укрпошти"
                  />
                </>
              )}

              <Switch
                isSelected={formData.isActive}
                onValueChange={(checked) => setFormData({ ...formData, isActive: checked })}
                aria-label="Зробити активним провайдером доставки"
              >
                Зробити активним провайдером
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              Скасувати
            </Button>
            <Button color="primary" onPress={handleCreateProvider}>
              Створити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal для редагування */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl">
        <ModalContent>
          <ModalHeader>Редагувати провайдера доставки</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Input
                  label="Назва відправника"
                  placeholder="Наприклад: ФОП Бубнов С.В."
                  value={formData.senderName}
                  onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                />

                <Input
                  label="senderId (SalesDrive API)"
                  placeholder="Наприклад: 1"
                  value={String(formData.senderId)}
                  onChange={(e) => setFormData({ ...formData, senderId: Number(e.target.value) })}
                />
              </div>

              <Select
                label="Тип провайдера"
                selectedKeys={[formData.providerType]}
                onChange={(e) => {
                  const providerType = e.target.value as 'novaposhta' | 'ukrposhta';
                  const providerName = providerType === 'novaposhta' ? 'Нова Пошта' : 'Укрпошта';
                  setFormData({ ...formData, providerType, name: providerName });
                }}
                disallowEmptySelection
              >
                <SelectItem key="novaposhta">Нова Пошта</SelectItem>
                <SelectItem key="ukrposhta">Укрпошта</SelectItem>
              </Select>

              {formData.providerType === 'novaposhta' && (
                <Input
                  label="API ключ Нової Пошти"
                  placeholder="Введіть API ключ"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
              )}

              {formData.providerType === 'ukrposhta' && (
                <>
                  <Input
                    label="Bearer токен (Ecom)"
                    placeholder="Bearer токен для ecom API"
                    value={formData.bearerEcom}
                    onChange={(e) => setFormData({ ...formData, bearerEcom: e.target.value })}
                  />

                  <Input
                    label="Counterparty токен"
                    placeholder="Counterparty токен"
                    value={formData.counterpartyToken}
                    onChange={(e) => setFormData({ ...formData, counterpartyToken: e.target.value })}
                  />

                  <Input
                    label="Bearer токен (Status)"
                    placeholder="Bearer токен для статусів"
                    value={formData.bearerStatus}
                    onChange={(e) => setFormData({ ...formData, bearerStatus: e.target.value })}
                  />
                </>
              )}

              <Switch
                isSelected={formData.isActive}
                onValueChange={(checked) => setFormData({ ...formData, isActive: checked })}
                aria-label="Зробити активним провайдером доставки"
              >
                Зробити активним провайдером
              </Switch>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onEditClose}>
              Скасувати
            </Button>
            <Button color="primary" onPress={handleUpdateProvider}>
              Оновити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
};
