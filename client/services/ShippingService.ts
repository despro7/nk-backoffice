import printerService from "./printerService";
import { ToastService } from "./ToastService";
import { useEquipmentFromAuth } from '../contexts/AuthContext';

export interface PrintTTNRequest {
  ttn: string;
  provider: 'novaposhta' | 'ukrposhta';
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
  async printTTN(request: PrintTTNRequest): Promise<void> {
    try {
      const response = await fetch('/api/shipping/print-ttn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не вдалося отримати дані для друку');
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        ToastService.show({ title: 'Помилка', description: result.error || 'Не вдалося отримати дані для друку ТТН.', color: 'danger' });
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

  private isValidBase64(str: string): boolean {
    try {
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      return base64Regex.test(str) && str.length % 4 === 0;
    } catch {
      return false;
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