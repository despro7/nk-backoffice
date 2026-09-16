import type { ProductLabelPayload } from '@shared/types/productLabel';
import {
  PORTION_LABEL_CANVAS_PX,
  PORTION_LABEL_STATIC,
} from '@shared/constants/productLabelPortionStatic';
import { PORTION_LABEL_LAYOUT, portionFigmaPx } from '@shared/utils/productLabelPortionLayout';
import { typographUk } from '@shared/utils/typograph';
import { LabelEditableBlock } from './LabelEditableBlock';
import { LabelEditableZone } from './LabelEditableZone';
import { LabelTitleBlock } from './LabelTitleBlock';
import { NutritionValueFields } from './NutritionValueFields';
import { Ean13BarcodeText } from './Ean13BarcodeText';

const S = PORTION_LABEL_STATIC;
const L = PORTION_LABEL_LAYOUT;
const C = PORTION_LABEL_CANVAS_PX;

const ASSETS = {
  logo: '/nk-food-logo.svg',
  qr: '/qr-code-nk.svg',
  instruction: '/portion-instruction.svg',
  estimated: '/estimated.svg',
  warning: '/icon-warning.svg',
} as const;

interface PortionLabelCanvasProps {
  payload: ProductLabelPayload;
  onChange: (patch: Partial<ProductLabelPayload>) => void;
  disabled?: boolean;
}

export function PortionLabelCanvas({ payload, onChange, disabled }: PortionLabelCanvasProps) {
  const {
    title,
    batchNumber,
    barcode,
    netWeightLabel,
    expiresAt,
    ingredientsText,
    nutritionText,
    nutritionEnergyManual,
    storageText,
  } = payload;

  return (
    <div
      className="relative flex shrink-0 flex-col overflow-visible bg-white text-black select-none"
      style={{ width: C, height: C, fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {/* Штрихкод */}
      <div
        className="absolute z-10 flex items-center justify-center"
        style={{
          right: L.barcodeRight,
          top: portionFigmaPx(277.63),
          width: L.barcodeWidth,
          height: L.barcodeHeight,
        }}
      >
        <Ean13BarcodeText barcode={barcode} className="!text-[36px]" />
      </div>

      {/* Основний контент */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingLeft: L.padX,
          paddingRight: L.padX,
          paddingTop: L.padTop,
          paddingBottom: L.padBottom,
        }}
      >
        {/* Header: logo | title | qr */}
        <div className="flex items-center justify-between">
          <img
            src={ASSETS.logo}
            alt=""
            className="shrink-0"
            style={{ width: L.logoSize, height: L.logoSize }}
            draggable={false}
          />
          <LabelTitleBlock
            title={title}
            disabled={disabled}
            onChange={(nextTitle) => onChange({ title: nextTitle })}
          />
          <img
            src={ASSETS.qr}
            alt=""
            className="shrink-0"
            style={{ width: L.qrSize, height: L.qrSize }}
            draggable={false}
          />
        </div>

        {/* Body */}
        <div className="mt-[7px] flex min-h-0 flex-1 flex-col justify-between">
          <div className="flex flex-col" style={{ gap: L.bodyGap }}>
            {/* Склад */}
            <LabelEditableBlock
              ariaLabel="Склад"
              prefix="Склад: "
              value={ingredientsText}
              disabled={disabled}
              multiline
              typographOnBlur
              onChange={(v) => onChange({ ingredientsText: v.trim() })}
              className="text-[8px] leading-[9px] tracking-[0.05px]"
              contentClassName="inline whitespace-pre-wrap"
            />

            {/* Інструкція + інфо-колонка */}
            <div className="flex items-start" style={{ gap: L.instructionTextGap }}>
              <img
                src={ASSETS.instruction}
                alt=""
                className="shrink-0"
                style={{ width: L.instructionWidth, height: L.instructionHeight }}
                draggable={false}
              />

              <div
                className="flex shrink-0 flex-col"
                style={{ width: L.infoColumnWidth, gap: L.infoColumnGap }}
              >
                <div className="flex flex-col" style={{ gap: L.nutritionGap }}>
                  <p className="text-[7.3px] font-bold leading-[8px] tracking-[0.06px]">
                    {typographUk(S.nutritionHeader)}
                  </p>
                  <NutritionValueFields
                    nutritionText={nutritionText}
                    energyManual={nutritionEnergyManual}
                    disabled={disabled}
                    onChange={(patch) => onChange(patch)}
                  />
                </div>

                <LabelEditableBlock
                  ariaLabel="Умови зберігання"
                  value={storageText}
                  disabled={disabled}
                  multiline
                  typographOnBlur
                  onChange={(v) => onChange({ storageText: v })}
                  className="text-[6.7px] leading-[7px] tracking-[0.05px]"
                  contentClassName="block w-full whitespace-pre-wrap"
                />

                <div className="flex flex-col whitespace-nowrap" style={{ gap: L.batchGap }}>
                  <p className="text-[9.3px] leading-[9px]">
                    {S.batchLabel}{' '}
                    <span className="font-bold">{batchNumber || '—'}</span>
                  </p>
                  <p className="text-[9.3px] leading-[9px]">
                    {S.expiryLabel}{' '}
                    <LabelEditableZone
                      ariaLabel="Вжити до"
                      value={expiresAt}
                      disabled={disabled}
                      onChange={(v) => onChange({ expiresAt: v })}
                      className="inline font-bold"
                    />
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Нижній ряд: вага | виробник | адреса */}
          <div
            className="flex items-end justify-between"
            style={{ width: L.bottomRowWidth, maxWidth: '100%' }}
          >
            <div
              className="flex flex-col pr-[3px]"
              style={{ gap: L.netWeightGap, marginBottom: L.netWeightBlockLift }}
            >
              <p
                className="whitespace-nowrap text-[14px] font-bold leading-[14px] tracking-[0.28px]"
                style={{ fontFamily: "'Open Sans Condensed', sans-serif" }}
              >
                {S.netWeightLabel}
              </p>
              <div className="flex items-end gap-[4px]">
                <LabelEditableZone
                  ariaLabel="Маса нетто"
                  value={netWeightLabel}
                  disabled={disabled}
                  onChange={(v) => onChange({ netWeightLabel: v })}
                  className="whitespace-nowrap text-[22.7px] font-bold leading-[20px]"
                  style={{ fontFamily: "'Open Sans Condensed', sans-serif" }}
                />
                <img
                  src={ASSETS.estimated}
                  alt=""
                  className="shrink-0"
                  style={{
                    width: L.estimatedSize,
                    height: L.estimatedSize,
                    transform: `translateY(${L.estimatedIconDrop}px)`,
                  }}
                  draggable={false}
                />
              </div>
            </div>

            <div
              className="text-[6px] leading-[7px]"
              style={{ width: L.manufacturerWidth }}
            >
              <p className="font-bold">Виробник: </p>
              <p>{typographUk(S.manufacturer.name)}</p>
              {/* <p>{S.manufacturer.fop}</p> */}
              <p className="mt-[2px] font-bold">{S.manufacturer.emailLabel}</p>
              <p>{S.manufacturer.email}</p>
              <p className="mt-[1px]">
                <span className="font-bold">{S.manufacturer.siteLabel} </span>
                {S.manufacturer.site}
              </p>
            </div>

            <div className="text-[6px] leading-[7px]" style={{ width: L.addressWidth }}>
              <p className="font-bold">{S.address.title[0]}</p>
              <p className="font-bold">{S.address.title[1]}</p>
              <p className="mt-[2px] whitespace-pre-wrap">{typographUk(S.address.line)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Попередження */}
      <div
        className="absolute bottom-0 left-0 flex w-fit max-w-full items-center rounded-tr-[5px] bg-black"
        style={{
          gap: L.headerGap,
          paddingTop: portionFigmaPx(6),
          paddingBottom: portionFigmaPx(9),
          paddingLeft: portionFigmaPx(12),
          paddingRight: portionFigmaPx(9),
        }}
      >
        <img
          src={ASSETS.warning}
          alt=""
          className="shrink-0"
          style={{ width: L.warningIconSize, height: L.warningIconSize }}
          draggable={false}
        />
        <p
          className="font-bold uppercase leading-[1.1] text-white"
          style={{
            fontFamily: "'Open Sans Condensed', sans-serif",
            fontSize: L.warningFontSize,
          }}
        >
          {typographUk(S.warning)}
        </p>
      </div>
    </div>
  );
}
