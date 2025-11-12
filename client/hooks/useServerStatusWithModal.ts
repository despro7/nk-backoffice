import { useState, useEffect, useCallback, useRef } from 'react';
import { useServerStatus } from './useServerStatus';

interface ServerStatusWithModal {
  isOnline: boolean;
  isLoading: boolean;
  lastChecked: Date | null;
  showModal: boolean;
  isOffline: boolean;
  serverStartTime: Date | null;
  uptime: string | null;
  onCloseModal: () => void;
}

export const useServerStatusWithModal = () => {
  const { isOnline, isLoading, lastChecked, serverStartTime: serverStartTimeFromApi, checkServerStatus } = useServerStatus();
  const [showModal, setShowModal] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [serverStartTime, setServerStartTime] = useState<Date | null>(null);
  const [uptime, setUptime] = useState<string | null>(null);
  const previousStatusRef = useRef<boolean | null>(null);
  const hasShownOfflineModalRef = useRef(false);

  // Функція для форматування часу роботи
  const formatUptime = useCallback((startTime: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}д ${diffHours}г ${diffMinutes}хв`;
    } else if (diffHours > 0) {
      return `${diffHours}г ${diffMinutes}хв`;
    } else {
      return `${diffMinutes}хв`;
    }
  }, []);

  // Оновлюємо uptime щохвилини
  useEffect(() => {
    if (!serverStartTime) return;

    const updateUptime = () => {
      setUptime(formatUptime(serverStartTime));
    };

    updateUptime(); // Оновлюємо відразу
    const interval = setInterval(updateUptime, 60000); // Щохвилини

    return () => clearInterval(interval);
  }, [serverStartTime, formatUptime]);

  // Синхронізуємо serverStartTime з даними з API
  useEffect(() => {
    if (serverStartTimeFromApi) {
      setServerStartTime(serverStartTimeFromApi);
    }
  }, [serverStartTimeFromApi]);

  // Відстежуємо зміни статусу сервера
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    
    // Якщо статус змінився з online на offline
    if (previousStatus === true && isOnline === false && !isLoading) {
      setIsOffline(true);
      setShowModal(true);
      hasShownOfflineModalRef.current = true;
    }
    // Якщо статус змінився з offline на online
    else if (previousStatus === false && isOnline === true && !isLoading) {
      setIsOffline(false);
      setShowModal(true);
      hasShownOfflineModalRef.current = false; // Скидаємо прапор для наступного вимкнення
    }

    previousStatusRef.current = isOnline;
  }, [isOnline, isLoading]);

  const onCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    isOnline,
    isLoading,
    lastChecked,
    showModal,
    isOffline,
    serverStartTime,
    uptime,
    onCloseModal,
    checkServerStatus,
  };
};
