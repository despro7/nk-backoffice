import type { ReleaseSendSummary } from '@shared/types/warehouseRelease';

export type ReleaseConfirmMode = 'kit' | 'unkit' | 'correctionKit' | 'correctionUnkit';

export function getReleaseSendTitle(mode: ReleaseConfirmMode): string {
  switch (mode) {
    case 'unkit':
      return 'Підтвердження розукомплектування';
    case 'correctionKit':
      return 'Зібрати партії в інвентаризаційний набір?';
    case 'correctionUnkit':
      return 'Розкласти партії після перерахунку?';
    default:
      return 'Підтвердження комплектування';
  }
}

export function getReleaseSendExplanation(mode: ReleaseConfirmMode, summary: ReleaseSendSummary): string {
  switch (mode) {
    case 'unkit':
      return 'Компоненти будуть повернені на склад у вказані партії в Dilovod.';
    case 'correctionKit':
      return `Усі обрані партії будуть зібрані в технічний інвентаризаційний набір «${summary.setSku}». Наступний крок — розукомплектування.`;
    case 'correctionUnkit':
      return 'Після підтвердження компоненти будуть розкладені по порахованих партіях. Перевірте очікувану та фактичну кількість.';
    default:
      if (summary.kitOutputBatch?.batchNumber) {
        const action = summary.kitOutputBatch.created
          ? 'буде створена'
          : 'буде використана';
        const barcodeSuffix = summary.kitOutputBatch.barcode
          ? `, ШК ${summary.kitOutputBatch.barcode}`
          : summary.kitOutputBatch.created
            ? ' з новим ШК'
            : '';
        return `Компоненти будуть списані з обраних партій у Dilovod. Для зібраного набору ${action} партія «${summary.kitOutputBatch.batchNumber}»${barcodeSuffix}.`;
      }
      return 'Компоненти будуть списані з обраних партій у Dilovod.';
  }
}

export function buildKitSendSummary(input: {
  setSku: string;
  setName: string | null;
  quantity: number;
  storageId: string | null;
  storageName: string | null;
  operDate: string | null;
  remark: string | null;
  components: ReleaseSendSummary['components'];
  kitOutputBatch?: ReleaseSendSummary['kitOutputBatch'];
}): ReleaseSendSummary {
  return {
    setSku: input.setSku,
    setName: input.setName,
    quantity: input.quantity,
    storageId: input.storageId,
    storageName: input.storageName,
    operDate: input.operDate,
    remark: input.remark,
    components: input.components,
    kitOutputBatch: input.kitOutputBatch ?? null,
  };
}

export function buildCorrectionUnkitSummary(input: {
  setSku: string;
  setName: string | null;
  quantity: number;
  storageId: string | null;
  storageName: string | null;
  operDate: string | null;
  remark: string | null;
  components: ReleaseSendSummary['components'];
  expectedTotal: number;
  countedTotal: number;
  surplusBatchName?: string | null;
}): ReleaseSendSummary {
  const shortage = Math.max(0, input.expectedTotal - input.countedTotal);
  const surplus = Math.max(0, input.countedTotal - input.expectedTotal);

  return {
    setSku: input.setSku,
    setName: input.setName,
    quantity: input.quantity,
    storageId: input.storageId,
    storageName: input.storageName,
    operDate: input.operDate,
    remark: input.remark,
    components: input.components,
    expectedTotal: input.expectedTotal,
    countedTotal: input.countedTotal,
    shortage,
    surplus,
    surplusBatchName: input.surplusBatchName ?? null,
  };
}

export function formatCorrectionBatchDateLabel(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `Коригування обліку ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
