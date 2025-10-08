import qz from 'qz-tray';
import type { PrintData } from 'qz-tray';
import { addToast } from '@heroui/toast';
import { initializeQzTray } from '../lib/qzConfig';

interface Printer {
  name: string;
  driver: string;
}

class PrinterService {
  private static instance: PrinterService;
  private connectionAttempts = 0;
  private maxConnectionAttempts = 5;
  private isInitialized = false;

  /**
   * Перевіряє чи є base64 рядок PDF файлом
   */
  private isPdfBase64(base64Data: string): boolean {
    try {
      // Декодуємо base64
      const decoded = atob(base64Data);
      
      // PDF файли починаються з %PDF-
      return decoded.startsWith('%PDF-');
    } catch {
      return false;
    }
  }

  private constructor() {
    // Ініціалізація QZ Tray з сертифікатом
    this.initialize();
  }

  /**
   * Ініціалізація QZ Tray
   */
  private initialize(): void {
    if (!this.isInitialized) {
      initializeQzTray();
      this.isInitialized = true;
    }
  }

  public static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  public async findPrinters(): Promise<Printer[]> {
    try {
      if (!(await this.connect())) {
        throw new Error("Немає з'єднання з QZ Tray");
      }
      const printers = await qz.printers.find();
      // The result can be an array of strings or an array of objects
      if (Array.isArray(printers) && printers.length > 0) {
        if (typeof printers[0] === 'string') {
          return (printers as string[]).map(p => ({ name: p, driver: 'unknown' }));
        }
        // Assuming it's an array of objects with a name property
        return (printers as any[]).map(p => ({ name: p.name || 'Unknown Printer', driver: p.driver || 'unknown' }));
      }
      return [];
    } catch (error) {
      console.error("Error finding printers:", error);
      addToast({
        title: "Помилка пошуку принтерів",
        description: error.message,
        color: "danger",
        timeout: 3000,
      });
      return [];
    }
  }

  public async printZpl(printerName: string, zpl: string): Promise<boolean> {
    try {
      if (!(await this.connect())) {
        throw new Error("Немає з'єднання з QZ Tray");
      }

      const config = qz.configs.create(printerName, {
        encoding: "UTF-8",
        language: "zpl",
      } as any);

      const data: any[] = [
        {
          type: "raw",
          format: "base64",
          data: btoa(zpl),
        },
      ];

      await qz.print(config, data);

      addToast({
        title: "Друк",
        description: `Завдання відправлено на принтер ${printerName}`,
        color: "success",
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error("Error printing ZPL:", error);
      addToast({
        title: "Помилка друку",
        description: error.message,
        color: "danger",
        timeout: 3000,
      });
      return false;
    }
  }

  public async printPdf(printerName: string, base64Pdf: string): Promise<boolean> {
    try {
      if (!(await this.connect())) {
        throw new Error("Немає з'єднання з QZ Tray");
      }

      // Валідація PDF даних
      if (!this.isPdfBase64(base64Pdf)) {
        throw new Error("Отримані дані не є валідним PDF файлом. Можливо, API повернув помилку замість PDF.");
      }

      const config = qz.configs.create(printerName);
      const data = [{
        type: 'pdf',
        format: 'base64',
        data: base64Pdf
      }];

      await qz.print(config, data as any); // Используем as any для обхода неполных определений типов

      addToast({
        title: 'Друк PDF',
        description: `Завдання PDF відправлено на принтер ${printerName}`,
        color: 'success',
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error('Error printing PDF:', error);
      addToast({
        title: 'Помилка друку PDF',
        description: error.message,
        color: 'danger',
        timeout: 3000,
      });
      return false;
    }
  }

  private async connect(): Promise<boolean> {
    if (qz.websocket.isActive()) {
      return true;
    }
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      throw new Error("Перевищено максимальну кількість спроб з'єднання з QZ Tray.");
    }
    try {
      await qz.websocket.connect();
      this.connectionAttempts = 0;
      return true;
    } catch (error) {
      this.connectionAttempts++;
      console.error(`Помилка з'єднання з QZ Tray (спроба ${this.connectionAttempts}/${this.maxConnectionAttempts}):`, error);
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * this.connectionAttempts)); // Збільшуємо затримку між спробами
        return this.connect();
      }
      throw new Error("Не вдалося встановити з'єднання з QZ Tray після кількох спроб.");
    }
  }
}

export default PrinterService.getInstance();
