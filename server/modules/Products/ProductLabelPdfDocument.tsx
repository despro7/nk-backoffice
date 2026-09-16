import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { ProductLabelPayload, ProductLabelTitleAlign } from '../../../shared/types/productLabel.js';
import { PORTION_LABEL_STATIC } from '../../../shared/constants/productLabelPortionStatic.js';
import {
  PORTION_LABEL_LAYOUT,
  PORTION_LABEL_PDF_SIZE_PT,
  PORTION_TITLE_LINE1_MAX_PX,
  PORTION_TITLE_LINE2_MAX_PX,
  portionFigmaPx,
  portionTitleFontSize,
} from '../../../shared/utils/productLabelPortionLayout.js';
import { parseNutritionValues } from '../../../shared/utils/productLabelNutrition.js';
import { encodeEan13ForFont } from '../../../shared/utils/encodeEan13Font.js';
import { prepareProductLabelForRender } from '../../../shared/utils/productLabel.js';
import { typographUk } from '../../../shared/utils/typograph.js';
import { portionLabelPdfAsset } from './productLabelPdfFonts.js';

const S = PORTION_LABEL_STATIC;
const L = PORTION_LABEL_LAYOUT;
const PAGE = PORTION_LABEL_PDF_SIZE_PT;

function titleAlignStyle(align: ProductLabelTitleAlign) {
  if (align === 'left') return 'left' as const;
  if (align === 'right') return 'right' as const;
  return 'center' as const;
}

const styles = StyleSheet.create({
  page: {
    width: PAGE,
    height: PAGE,
    backgroundColor: '#ffffff',
    color: '#000000',
    fontFamily: 'Arial',
    position: 'relative',
  },
  titleLine: {
    fontFamily: 'DaysOne',
    lineHeight: 1.02,
  },
  ingredientsBold: {
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 8,
    lineHeight: 1.125,
  },
  ingredientsRegular: {
    fontSize: 8,
    lineHeight: 1.125,
  },
  nutritionHeader: {
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 7.3,
    lineHeight: 1.1,
  },
  nutritionLine: {
    fontSize: 6.7,
    lineHeight: 1.2,
  },
  nutritionValue: {
    fontFamily: 'Arial',
    fontWeight: 700,
  },
  storage: {
    fontSize: 6.7,
    lineHeight: 1.05,
  },
  batchLine: {
    fontSize: 9.3,
    lineHeight: 1,
  },
  batchValue: {
    fontFamily: 'Arial',
    fontWeight: 700,
  },
  netWeightLabel: {
    fontFamily: 'OpenSansCondensed',
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1,
  },
  netWeightValue: {
    fontFamily: 'OpenSansCondensed',
    fontWeight: 700,
    fontSize: 22.7,
    lineHeight: 0.9,
  },
  manufacturerBold: {
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 6,
    lineHeight: 1.17,
  },
  manufacturerRegular: {
    fontSize: 6,
    lineHeight: 1.17,
  },
  addressBold: {
    fontFamily: 'Arial',
    fontWeight: 700,
    fontSize: 6,
    lineHeight: 1.17,
  },
  addressRegular: {
    fontSize: 6,
    lineHeight: 1.17,
  },
  warningText: {
    fontFamily: 'OpenSansCondensed',
    fontWeight: 700,
    fontSize: L.warningFontSize,
    color: '#ffffff',
    textTransform: 'uppercase',
    lineHeight: 1.1,
  },
  barcodeFont: {
    fontFamily: 'CodeEAN13',
    fontSize: L.barcodeFontSize,
    lineHeight: 1,
    textAlign: 'center',
  },
});

export type ProductLabelPdfProps = {
  payload: ProductLabelPayload;
};

export function ProductLabelPdfDocument({ payload }: ProductLabelPdfProps) {
  const {
    title,
    netWeightLabel,
    ingredientsText,
    nutritionText,
    storageText,
    expiresAt,
    batchNumber,
    barcode,
  } = prepareProductLabelForRender(payload);
  const barcodeEncoded = encodeEan13ForFont(barcode);
  const line1Size = portionTitleFontSize(title.line1FontSize, PORTION_TITLE_LINE1_MAX_PX);
  const line2Size = portionTitleFontSize(title.line2FontSize, PORTION_TITLE_LINE2_MAX_PX);
  const titleAlign = titleAlignStyle(title.align ?? 'center');
  const nutrition = parseNutritionValues(nutritionText);

  return (
    <Document>
      <Page size={[PAGE, PAGE]} style={styles.page}>
        {/* Barcode */}
        {barcodeEncoded ? (
          <View
            style={{
              position: 'absolute',
              right: L.barcodeRight,
              top: portionFigmaPx(277.63),
              width: L.barcodeWidth,
              height: L.barcodeHeight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: L.barcodeHeight,
                height: L.barcodeWidth,
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'rotate(-90deg)',
              }}
            >
              <Text style={styles.barcodeFont}>{barcodeEncoded}</Text>
            </View>
          </View>
        ) : null}

        {/* Main */}
        <View
          style={{
            flex: 1,
            paddingLeft: L.padX,
            paddingRight: L.padX,
            paddingTop: L.padTop,
            paddingBottom: L.padBottom,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Image
              src={portionLabelPdfAsset('nk-food-logo.svg')}
              style={{ width: L.logoSize, height: L.logoSize }}
            />
            <View style={{ width: L.titleWidth, paddingRight: portionFigmaPx(4), alignItems: titleAlign === 'center' ? 'center' : titleAlign === 'right' ? 'flex-end' : 'flex-start' }}>
              {title.line1 ? (
                <Text style={[styles.titleLine, { fontSize: line1Size, textAlign: titleAlign }]}>{title.line1}</Text>
              ) : null}
              {title.line2 ? (
                <Text style={[styles.titleLine, { fontSize: line2Size, textAlign: titleAlign, marginTop: 1 }]}>{title.line2}</Text>
              ) : null}
            </View>
            <Image
              src={portionLabelPdfAsset('qr-code-nk.svg')}
              style={{ width: L.qrSize, height: L.qrSize }}
            />
          </View>

          {/* Body */}
          <View style={{ flex: 1, marginTop: 7, justifyContent: 'space-between' }}>
            <View>
              <View style={{ marginBottom: L.bodyGap }}>
                <Text>
                  <Text style={styles.ingredientsBold}>Склад: </Text>
                  <Text style={styles.ingredientsRegular}>{ingredientsText}</Text>
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: L.instructionTextGap }}>
                <Image
                  src={portionLabelPdfAsset('portion-instruction.svg')}
                  style={{ width: L.instructionWidth, height: L.instructionHeight }}
                />
                <View style={{ width: L.infoColumnWidth, gap: L.infoColumnGap }}>
                  <View style={{ gap: L.nutritionGap }}>
                    <Text style={styles.nutritionHeader}>{typographUk(S.nutritionHeader)}</Text>
                    <View style={{ gap: L.nutritionLineGap }}>
                      <Text style={styles.nutritionLine}>
                        Білки <Text style={styles.nutritionValue}>{nutrition.proteins || '—'}</Text>г
                      </Text>
                      <Text style={styles.nutritionLine}>
                        Жири <Text style={styles.nutritionValue}>{nutrition.fats || '—'}</Text>г
                      </Text>
                      <Text style={styles.nutritionLine}>
                        Вуглеводи <Text style={styles.nutritionValue}>{nutrition.carbs || '—'}</Text>г
                      </Text>
                      <Text style={styles.nutritionLine}>
                        Енергетична цінність <Text style={styles.nutritionValue}>{nutrition.energy || '—'}</Text> ккал
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.storage}>{storageText}</Text>

                  <View style={{ gap: L.batchGap }}>
                    <Text style={styles.batchLine}>
                      {S.batchLabel} <Text style={styles.batchValue}>{batchNumber || '—'}</Text>
                    </Text>
                    <Text style={styles.batchLine}>
                      {S.expiryLabel} <Text style={styles.batchValue}>{expiresAt}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View
              style={{
                width: L.bottomRowWidth,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ gap: L.netWeightGap, paddingRight: 3, marginBottom: L.netWeightBlockLift }}>
                <Text style={styles.netWeightLabel}>{S.netWeightLabel}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.netWeightValue}>{netWeightLabel}</Text>
                  <Image
                    src={portionLabelPdfAsset('estimated.svg')}
                    style={{
                      width: L.estimatedSize,
                      height: L.estimatedSize,
                      transform: `translateY(${L.estimatedIconDrop})`,
                    }}
                  />
                </View>
              </View>

              <View style={{ width: L.manufacturerWidth }}>
                <Text style={styles.manufacturerBold}>Виробник: </Text>
                <Text style={styles.manufacturerRegular}>{typographUk(S.manufacturer.name)}</Text>
                {/* <Text style={styles.manufacturerRegular}>{S.manufacturer.fop}</Text> */}
                <Text style={[styles.manufacturerBold, { marginTop: 2 }]}>{S.manufacturer.emailLabel}</Text>
                <Text style={styles.manufacturerRegular}>{S.manufacturer.email}</Text>
                <Text style={{ marginTop: 1 }}>
                  <Text style={styles.manufacturerBold}>{S.manufacturer.siteLabel} </Text>
                  <Text style={styles.manufacturerRegular}>{S.manufacturer.site}</Text>
                </Text>
              </View>

              <View style={{ width: L.addressWidth }}>
                <Text style={styles.addressBold}>{S.address.title[0]}</Text>
                <Text style={styles.addressBold}>{S.address.title[1]}</Text>
                <Text style={[styles.addressRegular, { marginTop: 2 }]}>{typographUk(S.address.line)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Warning */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            backgroundColor: '#000000',
            flexDirection: 'row',
            alignItems: 'center',
            gap: L.headerGap,
            paddingTop: portionFigmaPx(6),
            paddingBottom: portionFigmaPx(9),
            paddingLeft: portionFigmaPx(12),
            paddingRight: portionFigmaPx(9),
            borderTopRightRadius: 5,
          }}
        >
          <Image
            src={portionLabelPdfAsset('icon-warning.svg')}
            style={{ width: L.warningIconSize, height: L.warningIconSize }}
          />
          <Text style={styles.warningText}>{typographUk(S.warning)}</Text>
        </View>
      </Page>
    </Document>
  );
}
