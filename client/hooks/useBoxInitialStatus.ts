import { useState, useEffect } from 'react';
import { useApi } from './useApi';

type BoxInitialStatus = 'default' | 'pending' | 'awaiting_confirmation';

/**
 * Хук для отримання початкового статусу коробки з налаштувань
 */
export function useBoxInitialStatus() {
  const { apiCall } = useApi();
  const [boxInitialStatus, setBoxInitialStatus] = useState<BoxInitialStatus>('default');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBoxInitialStatus = async () => {
      try {
        const response = await apiCall('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          const boxStatusSetting = settings.find((s: any) => s.key === 'box_initial_status');
          
          if (boxStatusSetting?.value) {
            setBoxInitialStatus(boxStatusSetting.value as BoxInitialStatus);
          }
        }
      } catch (error) {
        console.error('Error loading box initial status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBoxInitialStatus();
  }, [apiCall]);

  return { boxInitialStatus, isLoading };
}

/**
 * Утилітна функція для отримання початкового статусу коробки без хука
 * (для використання в utility функціях)
 */
export async function getBoxInitialStatus(apiCall: any): Promise<BoxInitialStatus> {
  try {
    const response = await apiCall('/api/settings');
    if (response.ok) {
      const settings = await response.json();
      const boxStatusSetting = settings.find((s: any) => s.key === 'box_initial_status');
      
      if (boxStatusSetting?.value) {
        return boxStatusSetting.value as BoxInitialStatus;
      }
    }
  } catch (error) {
    console.error('Error loading box initial status:', error);
  }
  
  return 'default'; // За замовчуванням
}
