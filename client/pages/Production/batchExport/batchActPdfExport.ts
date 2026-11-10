import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import type { ProductionBatchDetailDto, ProductionLossType } from '@shared/types/production';
import { ensureTechCardPdfFonts, printPdfInBrowser } from '../techCardExport/techCardPdfExport';
import { BatchActPdfDocument } from './BatchActPdfDocument';

async function renderBatchActBlob(batch: ProductionBatchDetailDto, lossTypes: ProductionLossType[]): Promise<Blob> {
  ensureTechCardPdfFonts();
  return pdf(BatchActPdfDocument({ batch, lossTypes })).toBlob();
}

export async function exportBatchActPdf(batch: ProductionBatchDetailDto, lossTypes: ProductionLossType[]): Promise<void> {
  const blob = await renderBatchActBlob(batch, lossTypes);
  saveAs(blob, `Акт_варки_${batch.number}.pdf`);
}

export async function printBatchActPdf(batch: ProductionBatchDetailDto, lossTypes: ProductionLossType[]): Promise<void> {
  printPdfInBrowser(await renderBatchActBlob(batch, lossTypes));
}
