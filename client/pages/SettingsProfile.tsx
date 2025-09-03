import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { Input, Button, Alert, Accordion, AccordionItem } from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { formatDateOnly } from "@/lib/formatUtils";

interface ProfileFormData {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ProfileData {
  id: number;
  name: string;
  email: string;
  role: string;
  roleName: string;
  createdAt: string;
  updatedAt: string;
}

export default function Profile() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Состояния для валидации
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValid, setIsValid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await apiCall('/api/auth/profile');
      const data = await response.json();
      setProfileData(data);
      setFormData(prev => ({
        ...prev,
        name: data.name || '',
        email: data.email || ''
      }));
    } catch (error) {
      console.error('Error fetching profile:', error);
      setMessage({ type: 'error', text: 'Не вдалося завантажити профіль' });
    } finally {
      setLoading(false);
    }
  };



  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Ім\'я обов\'язкове';
        if (value.trim().length < 2) return 'Ім\'я має бути не менше 2 символів';
        return '';
      case 'email':
        if (!value.trim()) return 'Email обов\'язковий';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Невірний формат email';
        return '';
      case 'newPassword':
        if (value && value.length < 6) return 'Пароль має бути не менше 6 символів';
        return '';
      case 'confirmPassword':
        if (formData.newPassword && value !== formData.newPassword) return 'Паролі не співпадають';
        return '';
      default:
        return '';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Валидация в реальном времени
    const error = validateField(name, value);
    setErrors(prev => ({
      ...prev,
      [name]: error
    }));
    setIsValid(prev => ({
      ...prev,
      [name]: !error
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Валидация всех полей
    const newErrors: Record<string, string> = {};
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key as keyof ProfileFormData]);
      if (error) newErrors[key] = error;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setMessage({ type: 'error', text: 'Будь ласка, виправте помилки в формі' });
      setSaving(false);
      return;
    }

    try {
      const updateData: any = {
        name: formData.name,
        email: formData.email
      };

      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }

      const response = await apiCall('/api/auth/profile', { method: 'PUT', body: JSON.stringify(updateData) });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Профіль успішно оновлено' });
        
        // Обновляем данные в контексте
        // setUser removed - not available in current AuthContext
        // User data updated in component state only

        // Очищаем поля паролей и ошибки
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
        setErrors(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
        setIsValid(prev => ({
          ...prev,
          currentPassword: true,
          newPassword: true,
          confirmPassword: true
        }));

        // Обновляем профиль
        await fetchProfile();
      } else {
        setMessage({ type: 'error', text: data.message || 'Помилка оновлення профілю' });
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Помилка оновлення профілю' 
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6">
      {message && (
        <Alert
          classNames={{
            base: `mb-6${message.type === 'success' ? ' text-success-600 bg-success-100 border-success-700' : ''}`,
          }}
          variant="faded"
          hideIcon={true}
          color={message.type === 'success' ? 'success' : 'danger'}
          startContent={
            <DynamicIcon 
              name={message.type === 'success' ? 'check-circle' : 'alert-circle'} 
              size={20} 
            />
          }
        >
          {message.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Информация о профиле */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Інформація профілю</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 shadow-inner-md">
              <div className="flex items-center gap-3 mb-3">
                <DynamicIcon name="hash" size={20} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">ID користувача</span>
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {profileData?.id}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 shadow-inner-md">
              <div className="flex items-center gap-3 mb-3">
                <DynamicIcon name="shield" size={20} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Роль</span>
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {profileData?.roleName}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 shadow-inner-md">
              <div className="flex items-center gap-3 mb-3">
                <DynamicIcon name="calendar" size={20} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Дата створення</span>
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {profileData?.createdAt ? formatDateOnly(profileData.createdAt) : '-'}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 shadow-inner-md">
              <div className="flex items-center gap-3 mb-3">
                <DynamicIcon name="clock" size={20} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Останнє оновлення</span>
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {profileData?.updatedAt ? formatDateOnly(profileData.updatedAt) : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Форма редактирования */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Редагування профілю</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Ім'я"
              labelPlacement="outside"
              size="lg"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              isRequired
              isInvalid={!!errors.name}
              errorMessage={errors.name}
              // variant="bordered"
              startContent={<DynamicIcon name="user" size={20} className="text-gray-400" />}
            />

            <Input
              label="Email"
              labelPlacement="outside"
              size="lg"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              isRequired
              isInvalid={!!errors.email}
              errorMessage={errors.email}
              // variant="bordered"
              startContent={<DynamicIcon name="mail" size={20} className="text-gray-400" />}
            />

            <Accordion 
              className="mt-4"
              variant="bordered"
              defaultExpandedKeys={[]}
            >
              <AccordionItem
                key="password-change"
                aria-label="Зміна паролю"
                title="Зміна паролю"
                startContent={<DynamicIcon name="lock" size={20} className="text-gray-400" />}
                className="px-0"
              >
                <div className="flex flex-col gap-4 pt-2 pb-4">
                  <Input
                    label="Поточний пароль"
                    labelPlacement="outside"
                    size="lg"
                    name="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    startContent={<DynamicIcon name="lock" size={20} className="text-gray-400" />}
                  />

                  <Input
                    label="Новий пароль"
                    labelPlacement="outside"
                    size="lg"
                    name="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    isInvalid={!!errors.newPassword}
                    errorMessage={errors.newPassword}
                    startContent={<DynamicIcon name="key-round" size={20} className="text-gray-400" />}
                  />

                  <Input
                    label="Підтвердження нового паролю"
                    labelPlacement="outside"
                    size="lg"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    isInvalid={!!errors.confirmPassword}
                    errorMessage={errors.confirmPassword}
                    startContent={<DynamicIcon name="key-round" size={20} className="text-gray-400" />}
                  />
                </div>
              </AccordionItem>
            </Accordion>

            <div className="pt-4">
              <Button
                type="submit"
                color="primary"
                variant="solid"
                size="lg"
                className="w-full"
                isLoading={saving}
                startContent={!saving && <DynamicIcon name="save" size={20} />}
              >
                {saving ? 'Збереження...' : 'Зберегти зміни'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
