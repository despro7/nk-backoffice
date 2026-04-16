import qz from 'qz-tray';
import type { PrintData } from 'qz-tray';
import { addToast } from '@heroui/toast';
import { initializeQzTray } from '../lib/qzConfig';
import { ToastService } from './ToastService';

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
      ToastService.show({
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

      ToastService.show({
        title: "Друк",
        description: `Завдання відправлено на принтер ${printerName}`,
        color: "success",
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error("Error printing ZPL:", error);
      ToastService.show({
        title: "Помилка друку",
        description: error.message,
        color: "danger",
        timeout: 3000,
      });
      return false;
    }
  }

  /**
   * Таблиця перекодування Unicode → CP866 для кирилиці.
   * Використовується для ESC/POS термопринтерів (наприклад, Xprinter X58).
   */
  private static readonly UNICODE_TO_CP866: Record<number, number> = {
    // Великі літери А-Я (U+0410–U+042F → CP866 0x80–0x9F)
    0x0410: 0x80, 0x0411: 0x81, 0x0412: 0x82, 0x0413: 0x83,
    0x0414: 0x84, 0x0415: 0x85, 0x0416: 0x86, 0x0417: 0x87,
    0x0418: 0x88, 0x0419: 0x89, 0x041A: 0x8A, 0x041B: 0x8B,
    0x041C: 0x8C, 0x041D: 0x8D, 0x041E: 0x8E, 0x041F: 0x8F,
    0x0420: 0x90, 0x0421: 0x91, 0x0422: 0x92, 0x0423: 0x93,
    0x0424: 0x94, 0x0425: 0x95, 0x0426: 0x96, 0x0427: 0x97,
    0x0428: 0x98, 0x0429: 0x99, 0x042A: 0x9A, 0x042B: 0x9B,
    0x042C: 0x9C, 0x042D: 0x9D, 0x042E: 0x9E, 0x042F: 0x9F,
    // Малі літери а-п (U+0430–U+043F → CP866 0xA0–0xAF)
    0x0430: 0xA0, 0x0431: 0xA1, 0x0432: 0xA2, 0x0433: 0xA3,
    0x0434: 0xA4, 0x0435: 0xA5, 0x0436: 0xA6, 0x0437: 0xA7,
    0x0438: 0xA8, 0x0439: 0xA9, 0x043A: 0xAA, 0x043B: 0xAB,
    0x043C: 0xAC, 0x043D: 0xAD, 0x043E: 0xAE, 0x043F: 0xAF,
    // Малі літери р-я (U+0440–U+044F → CP866 0xE0–0xEF)
    0x0440: 0xE0, 0x0441: 0xE1, 0x0442: 0xE2, 0x0443: 0xE3,
    0x0444: 0xE4, 0x0445: 0xE5, 0x0446: 0xE6, 0x0447: 0xE7,
    0x0448: 0xE8, 0x0449: 0xE9, 0x044A: 0xEA, 0x044B: 0xEB,
    0x044C: 0xEC, 0x044D: 0xED, 0x044E: 0xEE, 0x044F: 0xEF,
    // Ё/ё
    0x0401: 0xF0, 0x0451: 0xF1,
    // Українські І/і, Ї/ї, Є/є, Ґ/ґ — замінюємо на найближчі CP866
    0x0406: 0x49, // І → I (латинська, CP866 не має окремої І)
    0x0456: 0x69, // і → i
    0x0407: 0x9F, // Ї → Я (найближча за виглядом у CP866)
    0x0457: 0xEF, // ї → я
    0x0404: 0x85, // Є → Е
    0x0454: 0xA5, // є → е
    0x0490: 0x83, // Ґ → Г
    0x0491: 0xA3, // ґ → г
  };

  /**
   * Конвертує ESC/POS рядок у масив байтів CP866.
   * Символи < 0x80 передаються як є, кириличні символи перекодовуються з Unicode → CP866.
   * Повертає number[] — готово для передачі у QZ Tray як type:'raw', format:'plain'.
   */
  private escPosToBytes(data: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      if (code < 0x80) {
        // ASCII і ESC/POS бінарні команди — передаємо як є
        bytes.push(code);
      } else {
        const cp866 = PrinterService.UNICODE_TO_CP866[code];
        if (cp866 !== undefined) {
          bytes.push(cp866);
        } else {
          // Невідомий символ — замінюємо знаком питання
          bytes.push(0x3F);
        }
      }
    }
    return bytes;
  }

  /**
   * Друк ESC/POS даних на термопринтер (наприклад, Xprinter X58).
   *
   * ВАЖЛИВО: QZ Tray ігнорує параметр `encoding` для принтерів (і TCP-хостів),
   * та перекодовує Unicode рядки через системне кодування Windows (CP1251).
   * Це ламає CP866 кирилицю на принтері.
   *
   * Рішення: ручна конвертація Unicode → CP866 байти через escPosToBytes(),
   * і передача як format:'hex' — єдиний формат де QZ Tray не чіпає байти.
   *
   * Потік: Unicode ESC/POS → escPosToBytes() → number[] (CP866) → HEX string → QZ Tray → принтер.
   */
  public async printRaw(printerName: string, data: string): Promise<boolean> {
    try {
      if (!(await this.connect())) {
        throw new Error("Немає з'єднання з QZ Tray");
      }

      const bytes = this.escPosToBytes(data);

      if (bytes.length === 0) {
        throw new Error('ESC/POS дані порожні після конвертації');
      }

      // format:'hex' — QZ Tray передає байти на принтер 1:1, без жодного перекодування.
      // Це єдиний надійний спосіб: інші формати (plain, base64) перекодуються
      // через системне кодування Windows (CP1251) і ламають CP866 кирилицю.
      const hexData = bytes.map(b => b.toString(16).padStart(2, '0')).join('');

      const config = qz.configs.create(printerName) as any;
      const printData: any[] = [{
        type: 'raw',
        format: 'hex',
        data: hexData,
      }];

      await qz.print(config, printData);

      ToastService.show({
        title: 'Друк чека',
        description: `Завдання відправлено на принтер ${printerName}`,
        color: 'success',
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error('Помилка друку ESC/POS:', error);
      ToastService.show({
        title: 'Помилка друку чека',
        description: error.message,
        color: 'danger',
        timeout: 3000,
      });
      return false;
    }
  }

  /** Друкує HTML-рядок через QZ Tray (тип 'html'). */
  public async printHtml(printerName: string, html: string): Promise<boolean> {
    try {
      if (!(await this.connect())) {
        throw new Error("Немає з'єднання з QZ Tray");
      }

      const config = qz.configs.create(printerName) as any;
      const printData: any[] = [{
        type: 'html',
        format: 'plain',
        data: html,
      }];

      await qz.print(config, printData);

      ToastService.show({
        title: 'Друк чек-листа',
        description: `Завдання відправлено на принтер ${printerName}`,
        color: 'success',
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error('Помилка друку HTML:', error);
      ToastService.show({
        title: 'Помилка друку чек-листа',
        description: error.message,
        color: 'danger',
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

      // Параметри для 58мм термопринтера: масштабування під ширину рулону
      const config = qz.configs.create(printerName, {
        size: { width: 58, height: null },
        units: 'mm',
        scaleContent: true,
        colorType: 'blackwhite',
        duplex: false,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      } as any);
      const data = [{
        type: 'pdf',
        format: 'base64',
        data: base64Pdf
      }];

      await qz.print(config, data as any); // Используем as any для обхода неполных определений типов

      ToastService.show({
        title: 'Друк PDF',
        description: `Завдання PDF відправлено на принтер ${printerName}`,
        color: 'success',
        timeout: 2000,
      });
      return true;
    } catch (error) {
      console.error('Error printing PDF:', error);
      ToastService.show({
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
