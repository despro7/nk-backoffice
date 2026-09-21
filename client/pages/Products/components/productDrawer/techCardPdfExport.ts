import { pdf, Font } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { TechCardResult } from '../../ProductsUtils';
import { TechCardPdfDocument } from './TechCardPdfDocument';
import { buildTechCardFileName } from './techCardExportShared';

let fontsRegistered = false;

function ensureTechCardPdfFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Arial',
    fonts: [
      { src: '/fonts/ArialRegular.ttf', fontWeight: 400 },
      { src: '/fonts/ArialBold.ttf', fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

async function renderTechCardPdfBlob(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<Blob> {
  ensureTechCardPdfFonts();
  return pdf(TechCardPdfDocument({ productName, specQty, portions, techCard })).toBlob();
}

function printPdfInBrowser(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } else {
    URL.revokeObjectURL(url);
    throw new Error('Браузер заблокував вікно друку');
  }
}

export async function exportTechCardPdf(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const blob = await renderTechCardPdfBlob(productName, specQty, portions, techCard);
  saveAs(blob, buildTechCardFileName(productName, 'pdf'));
}

export async function printTechCardPdf(
  productName: string,
  specQty: number,
  portions: number,
  techCard: TechCardResult
): Promise<void> {
  const blob = await renderTechCardPdfBlob(productName, specQty, portions, techCard);
  printPdfInBrowser(blob);
}
