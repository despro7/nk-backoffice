import { useState } from 'react';
import { ToastService } from '@/services/ToastService';

interface ValidationResult {
  success: boolean;
  isReadyForExport?: boolean;
  warnings?: string[];
  errors?: string[];
  actionRequired?: string;
}

interface UseOrderValidationReturn {
  validateOrder: (orderId: string) => Promise<ValidationResult>;
  exportOrder: (orderId: string) => Promise<ValidationResult>;
  isValidating: boolean;
  isExporting: boolean;
}

export function useOrderValidation(): UseOrderValidationReturn {
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const validateOrder = async (orderId: string): Promise<ValidationResult> => {
    setIsValidating(true);
    try {
      const response = await fetch(`/api/dilovod/salesdrive/orders/${orderId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok) {
        return {
          success: true,
          isReadyForExport: result.data.isReadyForExport,
          warnings: result.data.warnings,
        };
      } else {
        // Критичні помилки валідації
        if (result.type === 'critical_validation_error') {
          return {
            success: false,
            isReadyForExport: false,
            errors: result.details.split('\n').slice(1), // Пропускаємо перший рядок з "Експорт заблоковано..."
            actionRequired: result.action_required,
          };
        } else {
          throw new Error(result.details || 'Помилка валідації');
        }
      }
    } catch (error) {
      console.error('Validation error:', error);
      ToastService.show({
        title: 'Помилка валідації',
        description: error instanceof Error ? error.message : 'Невідома помилка',
        color: 'danger',
      });
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Невідома помилка валідації'],
      };
    } finally {
      setIsValidating(false);
    }
  };

  const exportOrder = async (orderId: string): Promise<ValidationResult> => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/dilovod/salesdrive/orders/${orderId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok) {
        ToastService.show({
          title: 'Успіх!',
          description: `Замовлення ${orderId} успішно експортовано в Dilovod`,
          color: 'success',
        });
        return {
          success: true,
          warnings: result.data.warnings,
        };
      } else {
        // Критичні помилки валідації
        if (result.type === 'critical_validation_error') {
          return {
            success: false,
            errors: result.details.split('\n').slice(1), // Пропускаємо перший рядок
            actionRequired: result.action_required,
          };
        } else {
          throw new Error(result.details || 'Помилка експорту');
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      ToastService.show({
        title: 'Помилка експорту',
        description: error instanceof Error ? error.message : 'Невідома помилка',
        color: 'danger',
      });
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Невідома помилка експорту'],
      };
    } finally {
      setIsExporting(false);
    }
  };

  return {
    validateOrder,
    exportOrder,
    isValidating,
    isExporting,
  };
}