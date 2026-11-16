import { createElement } from 'react';
import { Font, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { InvoiceRecord } from '@shared/types/invoices';
import { formatDateUa } from '@shared/utils/invoiceCalc';
import { invoicesApi } from '@/services/InvoicesService';
import { InvoicePdfDocument } from './InvoicePdfDocument';

let fontsRegistered = false;

function ensureFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'InvoiceArial',
    fonts: [
      { src: '/fonts/ArialRegular.ttf', fontWeight: 400 },
      { src: '/fonts/ArialBold.ttf', fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

/** `Рахунок + Акт – ФОП Дзіова Г.Г – №109 від 02.11.2026.pdf` (as the old files were named). */
export function buildInvoiceFileName(invoice: InvoiceRecord): string {
  const num = String(invoice.number).padStart(3, '0');
  return `Рахунок + Акт – ФОП ${invoice.payee.signatureName.replace(/\.$/, '')} – №${num} від ${formatDateUa(invoice.date)}.pdf`;
}

export async function renderInvoicePdf(invoice: InvoiceRecord): Promise<Blob> {
  ensureFonts();
  // The signature is private: fetched with the admin session, never served statically.
  const { dataUrl } = await invoicesApi.getSignature();
  return pdf(createElement(InvoicePdfDocument, { invoice, signature: dataUrl }) as never).toBlob();
}

export async function downloadInvoicePdf(invoice: InvoiceRecord): Promise<void> {
  saveAs(await renderInvoicePdf(invoice), buildInvoiceFileName(invoice));
}

export async function openInvoicePdf(invoice: InvoiceRecord): Promise<void> {
  const blob = await renderInvoicePdf(invoice);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
