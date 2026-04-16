/**
 * EscPosDebugModal — модальне вікно для налагодження ESC/POS даних.
 *
 * В debug-режимі показує замість реального друку три панелі поряд:
 * - Ліворуч: розпарсені ESC/POS команди
 * - По центру: візуальний рендер термочеку (як на папері)
 * - Праворуч: HTML-preview чек-листа (iframe)
 *
 * Використовується у OrdersTable та інших компонентах з друком.
 */

import { useMemo } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { generateWarehouseChecklistHTML } from '@/lib/receiptTemplates';
import type { OrderChecklistItem } from '@/types/orderAssembly';
import type { WarehouseChecklistOrderInfo } from '@/lib/receiptTemplates';

// ────────────────────────────────────────────────────────────────
// Типи
// ────────────────────────────────────────────────────────────────

export interface EscPosDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ESC/POS рядок (бінарні символи) */
  escPosData: string;
  /** Дані для HTML-preview */
  items: OrderChecklistItem[];
  orderInfo: WarehouseChecklistOrderInfo;
}

// ────────────────────────────────────────────────────────────────
// Парсер ESC/POS команд
// ────────────────────────────────────────────────────────────────

/**
 * ESC/POS рядок будується через String.fromCharCode(cp866byte),
 * тому charCodeAt() повертає оригінальний CP866 байт (< 256).
 * Для коректного відображення кирилиці потрібно декодувати CP866 → Unicode.
 */

type EscPosCommandType = 'cmd' | 'text' | 'lf';

interface EscPosCommand {
  type: EscPosCommandType;
  label: string;
  detail?: string;
}

const ALIGN_LABELS = ['ЛІВО', 'ЦЕНТР', 'ПРАВО'];
const CODE_PAGE_NAMES: Record<number, string> = {
  0x00: 'PC437 (USA)',
  0x02: 'PC850',
  0x11: 'CP866 (кирилиця)',
  0x12: 'PC866',
};

// ────────────────────────────────────────────────────────────────
// Рендер термочеку
// ────────────────────────────────────────────────────────────────

interface ReceiptLine {
  text: string;
  align: 0 | 1 | 2; // 0=left, 1=center, 2=right
  bold: boolean;
  doubleHeight: boolean;
  separator: boolean; // порожній рядок-розділювач
}

/** Конвертує ESC/POS рядок у список рядків термочеку зі стилями */
function buildReceiptLines(raw: string): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  let align: 0 | 1 | 2 = 0;
  let bold = false;
  let doubleHeight = false;
  let pendingText = '';

  const flushText = () => {
    if (pendingText) {
      lines.push({ text: pendingText, align, bold, doubleHeight, separator: false });
      pendingText = '';
    }
  };

  let i = 0;
  while (i < raw.length) {
    const b = raw.charCodeAt(i);

    if (b === 0x1b) {
      const next = raw.charCodeAt(i + 1);
      if (next === 0x40) { // ESC @ — reset
        flushText();
        align = 0; bold = false; doubleHeight = false;
        i += 2;
      } else if (next === 0x61) { // ESC a — align
        flushText();
        const v = raw.charCodeAt(i + 2);
        align = (v === 1 ? 1 : v === 2 ? 2 : 0);
        i += 3;
      } else if (next === 0x45) { // ESC E — bold
        flushText();
        bold = raw.charCodeAt(i + 2) !== 0;
        i += 3;
      } else if (next === 0x21) { // ESC ! — font mode
        flushText();
        const mode = raw.charCodeAt(i + 2);
        doubleHeight = (mode & 0x10) !== 0;
        i += 3;
      } else if (next === 0x74) { // ESC t — code page (skip)
        i += 3;
      } else {
        i += 2;
      }
    } else if (b === 0x1d) {
      const next = raw.charCodeAt(i + 1);
      if (next === 0x56) { // GS V — cut
        flushText();
        i += 4;
      } else if (next === 0x28) { // GS ( k — QR block
        flushText();
        const dataLen = raw.charCodeAt(i + 3) + raw.charCodeAt(i + 4) * 256;
        i += 3 + dataLen;
      } else {
        i += 2;
      }
    } else if (b === 0x0a) { // LF
      flushText();
      lines.push({ text: '', align, bold, doubleHeight, separator: true });
      i++;
    } else if (b >= 0x20) {
      // Текстовий символ — вже Unicode
      pendingText += raw[i];
      i++;
    } else {
      i++;
    }
  }
  flushText();
  return lines;
}

const ALIGN_CLASS: Record<number, string> = {
  0: 'text-left',
  1: 'text-center',
  2: 'text-right',
};

// ────────────────────────────────────────────────────────────────
// Парсер ESC/POS команд (ліва панель)

/** Декодує один CP866 байт у Unicode символ */
function decodeCp866(b: number): string {  if (b >= 0x20 && b < 0x80) return String.fromCharCode(b);             // ASCII
  if (b >= 0x80 && b <= 0x9f) return String.fromCharCode(0x0410 + (b - 0x80)); // А-Я
  if (b >= 0xa0 && b <= 0xaf) return String.fromCharCode(0x0430 + (b - 0xa0)); // а-п
  if (b >= 0xe0 && b <= 0xef) return String.fromCharCode(0x0440 + (b - 0xe0)); // р-я
  if (b === 0xb2) return 'і';
  if (b === 0xb3) return 'ї';
  if (b === 0xf0) return 'Ё';
  if (b === 0xf1) return 'ё';
  if (b === 0xfc) return 'ь';
  if (b === 0xfd) return 'ю';
  if (b === 0xfe) return 'я';
  return '·';
}

function parseEscPosCommands(raw: string): EscPosCommand[] {
  const commands: EscPosCommand[] = [];
  let i = 0;

  while (i < raw.length) {
    const b = raw.charCodeAt(i);

    if (b === 0x1b) {
      // ESC
      const next = raw.charCodeAt(i + 1);
      if (next === 0x40) {
        commands.push({ type: 'cmd', label: 'ESC @', detail: 'RESET принтера' });
        i += 2;
      } else if (next === 0x61) {
        const align = ALIGN_LABELS[raw.charCodeAt(i + 2)] ?? `${raw.charCodeAt(i + 2)}`;
        commands.push({ type: 'cmd', label: 'ESC a', detail: `Вирівнювання: ${align}` });
        i += 3;
      } else if (next === 0x45) {
        commands.push({ type: 'cmd', label: 'ESC E', detail: `Жирний: ${raw.charCodeAt(i + 2) ? 'ON' : 'OFF'}` });
        i += 3;
      } else if (next === 0x74) {
        const cp = raw.charCodeAt(i + 2);
        const cpName = CODE_PAGE_NAMES[cp] ?? `0x${cp.toString(16).padStart(2, '0')}`;
        commands.push({ type: 'cmd', label: 'ESC t', detail: `Кодова сторінка: ${cpName}` });
        i += 3;
      } else if (next === 0x21) {
        commands.push({ type: 'cmd', label: 'ESC !', detail: `Режим: 0x${raw.charCodeAt(i + 2).toString(16).padStart(2, '0')}` });
        i += 3;
      } else {
        commands.push({ type: 'cmd', label: `ESC 0x${next.toString(16).padStart(2, '0')}`, detail: 'невідома команда' });
        i += 2;
      }
    } else if (b === 0x1d) {
      // GS
      const next = raw.charCodeAt(i + 1);
      if (next === 0x56) {
        const mode = raw.charCodeAt(i + 2);
        const modeLabel = mode === 0x00 ? 'повний' : mode === 0x01 ? 'частковий' : `0x${mode.toString(16)}`;
        commands.push({ type: 'cmd', label: 'GS V', detail: `CUT PAPER (${modeLabel})` });
        i += 4;
      } else if (next === 0x28) {
        const dataLen = raw.charCodeAt(i + 3) + raw.charCodeAt(i + 4) * 256;
        commands.push({ type: 'cmd', label: 'GS ( k', detail: `QR-код блок, ${dataLen} байт` });
        i += 3 + dataLen;
      } else {
        commands.push({ type: 'cmd', label: `GS 0x${next.toString(16).padStart(2, '0')}`, detail: 'невідома команда' });
        i += 2;
      }
    } else if (b === 0x0a) {
      // LF
      commands.push({ type: 'lf', label: 'LF', detail: '' });
      i++;
    } else if (b >= 0x20 || b >= 0x80) {
      // Текстовий сегмент — збираємо до керуючого символу
      let decoded = '';
      while (i < raw.length) {
        const code = raw.charCodeAt(i);
        if (code === 0x1b || code === 0x1d || code === 0x0a || code === 0x00) break;
        decoded += raw[i]; // Текст вже Unicode (UTF-16) — декодування CP866 не потрібне
        i++;
      }
      if (decoded.trim()) {
        commands.push({ type: 'text', label: 'TEXT', detail: decoded });
      }
    } else {
      i++;
    }
  }

  return commands;
}

// ────────────────────────────────────────────────────────────────
// Компонент
// ────────────────────────────────────────────────────────────────

export function EscPosDebugModal({
  isOpen,
  onClose,
  escPosData,
  items,
  orderInfo,
}: EscPosDebugModalProps) {
  const commands = useMemo(() => parseEscPosCommands(escPosData), [escPosData]);
  const receiptLines = useMemo(() => buildReceiptLines(escPosData), [escPosData]);

  // Видаляємо <script> з HTML перед вставкою в iframe —
  // щоб уникнути авто-друку і попередження "allow-scripts + allow-same-origin"
  const htmlPreview = useMemo(() => {
    const raw = generateWarehouseChecklistHTML(items, orderInfo);
    return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  }, [items, orderInfo]);

  const totalBytes = escPosData.length;
  const textLines = commands.filter((c) => c.type === 'text').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="outside"
      classNames={{ base: 'max-h-[95vh] mx-4' }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 pb-2 border-b border-neutral-100">
          <DynamicIcon name="bug" size={18} className="text-danger-500 flex-shrink-0" />
          <span className="text-base font-semibold">ESC/POS Debug</span>
          <span className="text-xs font-normal text-neutral-400">#{orderInfo.orderNumber}</span>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400 font-normal">
            <span className="bg-neutral-100 rounded px-1.5 py-0.5">{totalBytes} байт</span>
            <span className="bg-neutral-100 rounded px-1.5 py-0.5">{textLines} рядків</span>
          </div>
        </ModalHeader>

        <ModalBody className="pt-3 pb-2 px-4">
          <div className="grid grid-cols-[1fr_280px_1fr] gap-10" style={{ height: '75vh' }}>

            {/* ── Ліва панель: ESC/POS команди ── */}
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <DynamicIcon name="terminal" size={12} />
                ESC/POS команди
              </div>
              <div className="font-mono text-xs overflow-y-auto flex-1 bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                {commands.map((cmd, idx) => {
                  if (cmd.type === 'lf') {
                    return (
                      <div key={idx} className="text-neutral-300 leading-3 select-none h-3">↵</div>
                    );
                  }
                  if (cmd.type === 'text') {
                    return (
                      <div key={idx} className="flex gap-1.5 leading-5">
                        <span className="text-emerald-600 w-10 flex-shrink-0 font-semibold">TEXT</span>
                        <span className="text-neutral-800 break-all">{cmd.detail}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex gap-1.5 leading-5">
                      <span className="text-blue-500 w-10 flex-shrink-0 text-[10px] leading-5 font-semibold">
                        {cmd.label}
                      </span>
                      <span className="text-neutral-400 text-[10px] leading-5 italic truncate">
                        {cmd.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Середня панель: термочек ── */}
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <DynamicIcon name="receipt" size={12} />
                Термочек
              </div>
              <div className="overflow-y-auto flex-1 bg-white rounded-lg border border-neutral-200 shadow-inner">
                {/* Імітація термопаперу */}
                <div
                  className="mx-auto py-3 px-2"
                  style={{ width: '100%', fontFamily: '"Courier New", Courier, monospace', fontSize: '11px', lineHeight: '1.4' }}
                >
                  {receiptLines.map((line, idx) => {
                    if (line.separator) {
                      return <div key={idx} style={{ height: '4px' }} />;
                    }
                    return (
                      <div
                        key={idx}
                        className={ALIGN_CLASS[line.align]}
                        style={{
                          fontWeight: line.bold ? 700 : 400,
                          fontSize: line.doubleHeight ? '14px' : '11px',
                          letterSpacing: line.doubleHeight ? '0.02em' : undefined,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {line.text || '\u00A0'}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Права панель: HTML preview ── */}
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <DynamicIcon name="file-text" size={12} />
                HTML Preview
              </div>
              <div className="flex-1 border border-neutral-200 rounded-lg overflow-hidden">
                <iframe
                  title="Warehouse checklist preview"
                  srcDoc={htmlPreview}
                  className="w-full h-full"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

          </div>
        </ModalBody>

        <ModalFooter className="pt-2 border-t border-neutral-100">
          <Button variant="flat" size="sm" onPress={onClose}>
            Закрити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
