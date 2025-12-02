import printerService from "./printerService";
import { ToastService } from "./ToastService";
import { useEquipmentFromAuth } from '../contexts/AuthContext';

export interface PrintTTNRequest {
  ttn: string;
  provider?: 'novaposhta' | 'ukrposhta'; // Тепер опціональний, якщо не вказано - використовується активний
  senderId?: number;
  format?: 'pdf' | 'html' | 'png' | 'zpl';
  printerName?: string;
}

export interface PrintTTNResponse {
  success: boolean;
  data?: string;
  message?: string;
  error?: string;
  format?: 'pdf' | 'zpl';
}

export class ShippingClientService {
  /**
   * Отримує активний провайдер доставки
   */
  async getActiveProvider(): Promise<{ provider: 'novaposhta' | 'ukrposhta' } | null> {
    try {
      const response = await fetch('/api/shipping-providers/active');
      const result = await response.json();

      // console.log(`🔍 [ShippingService] Запит на отримання активного провайдера: ${JSON.stringify(result)}`);

      if (result.success && result.data) {
        return { provider: result.data.providerType };
      }
      return null;
    } catch (error) {
      console.error('Error getting active provider:', error);
      return null;
    }
  }

  async printTTN(request: PrintTTNRequest): Promise<void> {
    try {
      // Якщо провайдер не вказаний, використовуємо активний
      let finalRequest = { ...request };
      if (!finalRequest.provider) {
        const activeProvider = await this.getActiveProvider();
        if (activeProvider) {
          finalRequest.provider = activeProvider.provider;
        } else {
          ToastService.show({
            title: 'Помилка',
            description: 'Не знайдено активного провайдера доставки. Налаштуйте провайдера в налаштуваннях.',
            color: 'danger'
          });
          return;
        }
      }

      console.log(`🔍 [ShippingService] Запит на друк ТТН: ${JSON.stringify(finalRequest)}`);

      const response = await fetch('/api/shipping/print-ttn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не вдалося отримати дані для друку');
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        const errorMessage = result.error || 'Не вдалося отримати дані для друку ТТН.';
        console.error('API Error:', result);
        ToastService.show({ title: 'Помилка', description: errorMessage, color: 'danger' });
        return;
      }

      // Додаткова валідація PDF даних
      if (!this.isValidPdfBase64(result.data)) {
        // Спробуємо розшифрувати BASE64 якщо це можливо
        const decodedError = this.tryDecodeBase64Error(result.data);
        // console.error('Invalid PDF data received:', result.data);

        let errorMessage = 'Отримані дані не є валідним PDF файлом. Можливо, сервер повернув помилку.';

        if (decodedError) {
          console.error('Decoded error data:', decodedError);

          // Формуємо більш детальне повідомлення про помилку
          if (decodedError.errors && Array.isArray(decodedError.errors)) {
            errorMessage = `Помилка сервера: ${decodedError.errors.join(', ')}${decodedError.errorCodes ? `, коди помилок: ${decodedError.errorCodes.join(', ')}` : decodedError.error}`;
          } else if (decodedError.error) {
            errorMessage = `Помилка сервера: ${decodedError.error}`;
          } else if (decodedError.message) {
            errorMessage = `Помилка сервера: ${decodedError.message}`;
          }
        }

        ToastService.show({
          title: 'Помилка даних',
          description: errorMessage,
          color: 'danger'
        });
        return;
      }

      // PDF может печататься напрямую или через диалог
      if (request.printerName) {
        await printerService.printPdf(request.printerName, result.data);
      } else {
        this.printPdfFromBase64(result.data);
      }
    } catch (error) {
      console.error('Помилка друку:', error);
      ToastService.show({
        title: 'Помилка друку',
        description: error.message || 'Сталася невідома помилка при друку ТТН.',
        color: 'danger'
      });
    }
  }

  printPdfFromBase64(base64Data: string): void {
    if (!this.isValidBase64(base64Data)) {
      console.error("Invalid base64 string provided for PDF printing.");
      ToastService.show({ title: 'Помилка даних', description: 'Отримані дані PDF некоректні.', color: 'danger' });
      return;
    }
    const pdfBlob = this.base64ToBlob(base64Data, 'application/pdf');
    const url = URL.createObjectURL(pdfBlob);

    const printWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');

    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow?.print();
        }, 1000);
      };
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30000);
    } else {
      ToastService.show({ title: 'Помилка', description: 'Не вдалося відкрити вікно для друку. Можливо, воно заблоковане.', color: 'warning' });
    }
  }

  /**
   * Відкриває PDF для перегляду без друку
   */
  viewPdfFromBase64(base64Data: string): void {
    if (!this.isValidBase64(base64Data)) {
      console.error("Invalid base64 string provided for PDF viewing.");
      ToastService.show({ title: 'Помилка даних', description: 'Отримані дані PDF некоректні.', color: 'danger' });
      return;
    }
    const pdfBlob = this.base64ToBlob(base64Data, 'application/pdf');
    const url = URL.createObjectURL(pdfBlob);

    const viewWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');

    if (viewWindow) {
      // Очищаємо URL через 30 секунд після відкриття
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30000);
    } else {
      ToastService.show({ title: 'Помилка', description: 'Не вдалося відкрити вікно для перегляду. Можливо, воно заблоковане.', color: 'warning' });
    }
  }

  /**
   * Отримує та відкриває ТТН для перегляду без друку
   */
  async viewTTN(request: PrintTTNRequest): Promise<void> {
    try {
      // Якщо провайдер не вказаний, використовуємо активний
      let finalRequest = { ...request };
      if (!finalRequest.provider) {
        const activeProvider = await this.getActiveProvider();
        if (activeProvider) {
          finalRequest.provider = activeProvider.provider;
        } else {
          ToastService.show({
            title: 'Помилка',
            description: 'Не знайдено активного провайдера доставки. Налаштуйте провайдера в налаштуваннях.',
            color: 'danger'
          });
          return;
        }
      }

      console.log(`🔍 [ShippingService] Запит на перегляд ТТН: ${JSON.stringify(finalRequest)}`);

      const response = await fetch('/api/shipping/print-ttn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не вдалося отримати дані для перегляду');
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        const errorMessage = result.error || 'Не вдалося отримати дані для перегляду ТТН.';
        console.error('API Error:', result);
        ToastService.show({ title: 'Помилка', description: errorMessage, color: 'danger' });
        return;
      }

      // Додаткова валідація PDF даних
      if (!this.isValidPdfBase64(result.data)) {
        const decodedError = this.tryDecodeBase64Error(result.data);
        let errorMessage = 'Отримані дані не є валідним PDF файлом. Можливо, сервер повернув помилку.';

        if (decodedError) {
          console.error('Decoded error data:', decodedError);

          if (decodedError.errors && Array.isArray(decodedError.errors)) {
            errorMessage = `Помилка сервера: ${decodedError.errors.join(', ')}${decodedError.errorCodes ? `, коди помилок: ${decodedError.errorCodes.join(', ')}` : decodedError.error}`;
          } else if (decodedError.error) {
            errorMessage = `Помилка сервера: ${decodedError.error}`;
          } else if (decodedError.message) {
            errorMessage = `Помилка сервера: ${decodedError.message}`;
          }
        }

        ToastService.show({
          title: 'Помилка даних',
          description: errorMessage,
          color: 'danger'
        });
        return;
      }

      // Відкриваємо PDF для перегляду без друку
      this.viewPdfFromBase64(result.data);
    } catch (error) {
      console.error('Помилка перегляду:', error);
      ToastService.show({
        title: 'Помилка перегляду',
        description: error.message || 'Сталася невідома помилка при перегляді ТТН.',
        color: 'danger'
      });
    }
  }

  private isValidBase64(str: string): boolean {
    try {
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      return base64Regex.test(str) && str.length % 4 === 0;
    } catch {
      return false;
    }
  }

  /**
   * Перевіряє чи є base64 рядок PDF файлом
   */
  private isValidPdfBase64(base64Data: string): boolean {
    try {
      // Спочатку перевіряємо чи це валідний base64
      if (!this.isValidBase64(base64Data)) {
        return false;
      }

      // Декодуємо base64
      const decoded = atob(base64Data);

      // PDF файли починаються з %PDF-
      return decoded.startsWith('%PDF-');
    } catch {
      return false;
    }
  }

  /**
   * Спробує розшифрувати BASE64 рядок як JSON помилку
   */
  private tryDecodeBase64Error(base64Data: string): any {
    try {
      // Перевіряємо чи це валідний base64
      if (!this.isValidBase64(base64Data)) {
        return null;
      }

      // Декодуємо base64
      const decoded = atob(base64Data);

      // Спробуємо розпарсити як JSON
      const parsed = JSON.parse(decoded);

      // Перевіряємо чи це схоже на помилку API
      if (typeof parsed === 'object' && (parsed.errors || parsed.error || parsed.success === false)) {
        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

export const shippingClientService = new ShippingClientService();