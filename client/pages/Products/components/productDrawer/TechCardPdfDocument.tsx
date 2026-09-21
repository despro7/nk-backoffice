import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { TechCardResult } from '../../ProductsUtils';
import { formatTechCardMassKg } from '../../ProductsUtils';
import { pluralize } from '@/lib/formatUtils';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Arial',
    fontSize: 10,
    padding: 32,
    color: '#111827',
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 16,
  },
  table: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
  },
  headerRow: {
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerRow: {
    backgroundColor: '#f9fafb',
    fontWeight: 700,
  },
  cell: {
    paddingHorizontal: 8,
  },
  cellIngredient: {
    width: '34%',
  },
  cellRecipe: {
    width: '18%',
    textAlign: 'right',
  },
  cellLoss: {
    width: '10%',
    textAlign: 'right',
  },
  cellNet: {
    width: '19%',
    textAlign: 'right',
  },
  cellGross: {
    width: '19%',
    textAlign: 'right',
  },
  headerText: {
    fontWeight: 700,
    fontSize: 9,
    color: '#4b5563',
  },
});

interface TechCardPdfDocumentProps {
  productName: string;
  specQty: number;
  portions: number;
  techCard: TechCardResult;
}

export function TechCardPdfDocument({
  productName,
  specQty,
  portions,
  techCard,
}: TechCardPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Техкарта «{productName}»</Text>
        <Text style={styles.meta}>
          Порцій для варки: {portions} · Рецепт на {specQty}{' '}
          {pluralize(specQty, 'порцію', 'порції', 'порцій')}
        </Text>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.cellIngredient, styles.headerText]}>Інгредієнт</Text>
            <Text style={[styles.cell, styles.cellRecipe, styles.headerText]}>Вага за рецептом</Text>
            <Text style={[styles.cell, styles.cellLoss, styles.headerText]}>Втрати</Text>
            <Text style={[styles.cell, styles.cellNet, styles.headerText]}>Маса нетто</Text>
            <Text style={[styles.cell, styles.cellGross, styles.headerText]}>Маса брутто</Text>
          </View>

          {techCard.rows.map((row, index) => (
            <View key={`${row.name}-${index}`} style={styles.row}>
              <Text style={[styles.cell, styles.cellIngredient]}>{row.nameDisplay}</Text>
              <Text style={[styles.cell, styles.cellRecipe]}>{row.recipeDisplay}</Text>
              <Text style={[styles.cell, styles.cellLoss]}>{row.lossDisplay}</Text>
              <Text style={[styles.cell, styles.cellNet]}>{row.netDisplay}</Text>
              <Text style={[styles.cell, styles.cellGross]}>{row.grossDisplay}</Text>
            </View>
          ))}

          <View style={[styles.row, styles.footerRow]}>
            <Text style={[styles.cell, styles.cellIngredient, styles.headerText]}>Разом</Text>
            <Text style={[styles.cell, styles.cellRecipe, styles.headerText]}>
              {formatTechCardMassKg(techCard.totalRecipeMassKg)}
            </Text>
            <Text style={[styles.cell, styles.cellLoss, styles.headerText]} />
            <Text style={[styles.cell, styles.cellNet, styles.headerText]}>
              {formatTechCardMassKg(techCard.totalNetMassKg, techCard.massPrecision)}
            </Text>
            <Text style={[styles.cell, styles.cellGross, styles.headerText]}>
              {formatTechCardMassKg(techCard.totalGrossMassKg, techCard.massPrecision)}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
