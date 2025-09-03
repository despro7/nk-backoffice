export interface PrintTTNRequest {
  ttn: string;
  provider: 'novaposhta' | 'ukrposhta';
  format?: 'pdf' | 'html' | 'png';
}

export interface PrintTTNResponse {
  success: boolean;
  data?: string;
  message?: string;
  error?: string;
}

export class ShippingClientService {
  async printTTN(request: PrintTTNRequest): Promise<PrintTTNResponse> {
    const response = await fetch('/api/shipping/print-ttn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data;
  }

  async downloadAndPrintTTN(ttn: string, provider: 'novaposhta' | 'ukrposhta'): Promise<void> {
    try {
      const result = await this.printTTN({ ttn, provider, format: 'pdf' });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Не удалось получить данные для печати');
      }

      if (provider === 'ukrposhta') {
        const printWindow = window.open(result.data, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
        
        if (printWindow) {
          console.log('✅ URL Укрпошты открыт в новой вкладке');
        } else {
          window.location.href = result.data;
        }
        
        return;
      }

      if (!this.isValidBase64(result.data)) {
        throw new Error('Полученные данные не являются корректной base64 строкой');
      }
      
      const pdfBlob = this.base64ToBlob(result.data, 'application/pdf');
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
        window.location.href = url;
      }

    } catch (error) {
      throw error;
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