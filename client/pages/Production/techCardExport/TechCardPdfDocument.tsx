import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { TechCardResult } from '@/pages/Products/ProductsUtils';
import { formatTechCardMassKg } from '@/pages/Products/ProductsUtils';
import { pluralize } from '@/lib/formatUtils';
import type { StageTextBlock } from '@shared/utils/stageHtmlBlocks';
import type { TechCardPdfRecipe } from './techCardPdfRecipe';

const GRAY = '#6b7280';
const BORDER = '#e5e7eb';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Arial',
    fontSize: 10,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 32,
    color: '#111827',
  },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stageCol: { width: '49%', flexDirection: 'column' },
  meta: { fontSize: 9, color: GRAY, marginBottom: 2 },
  draft: { fontSize: 9, color: '#b45309', fontWeight: 700, marginBottom: 2 },
  header: { marginBottom: 2 },
  section: { marginTop: 16 },
  sectionSpaced: { marginTop: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  table: { width: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 5 },
  headerRow: { backgroundColor: '#f3f4f6', borderTopWidth: 1, borderTopColor: BORDER },
  footerRow: { backgroundColor: '#f9fafb', fontWeight: 700 },
  cell: { paddingHorizontal: 6 },
  right: { textAlign: 'right' },
  headerText: { fontWeight: 700, fontSize: 9, color: '#4b5563' },
  totalText: { fontWeight: 700, fontSize: 10, color: '#111827' },
  groupRow: { backgroundColor: '#f9fafb', paddingVertical: 4 },
  groupTitle: { fontSize: 10, fontWeight: 700, color: '#374151' },
  groupedName: { paddingLeft: 14 },
  footnote: { fontSize: 8, color: GRAY, marginTop: 4 },
  stage: {
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  stageTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  stageInfo: {
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  stageInfoText: { fontSize: 10, color: '#4b5563' },
  stageInfoDivider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginVertical: 3 },
  label: { color: GRAY },
  description: { marginTop: 6 },
  paragraph: { fontSize: 10, marginTop: 3, lineHeight: 1.35 },
  heading: { fontSize: 11, fontWeight: 700, marginTop: 5 },
  item: { flexDirection: 'row', marginTop: 3 },
  marker: { width: 12, fontSize: 10 },
  itemText: { flex: 1, fontSize: 10, lineHeight: 1.35 },
  notes: { fontSize: 10, lineHeight: 1.4 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  sectionHeaderTitle: { fontSize: 11, fontWeight: 700 },
  sectionHeaderAside: { fontSize: 10 },
  pageNumber: { position: 'absolute', bottom: 18, right: 32, fontSize: 8, color: GRAY },
});

const COMPOSITION = { name: '34%', recipe: '18%', loss: '10%', net: '19%', gross: '19%' };

function StageBlocks({ blocks }: { blocks: StageTextBlock[] }) {
  return (
    <View style={styles.description}>
      {blocks.map((block, idx) => {
        const runs = block.runs.map((run, i) => (
          <Text
            key={i}
            style={{
              ...(run.bold ? { fontWeight: 700 } : {}),
              ...(run.underline || run.strike
                ? { textDecoration: run.strike ? 'line-through' : 'underline' }
                : {}),
            }}
          >
            {run.text}
          </Text>
        ));
        if (block.kind === 'item') {
          return (
            <View key={idx} style={[styles.item, { paddingLeft: 10 + ((block.level ?? 1) - 1) * 14 }]}>
              <Text style={styles.marker}>{block.marker}</Text>
              <Text style={styles.itemText}>{runs}</Text>
            </View>
          );
        }
        return (
          <Text key={idx} style={block.kind === 'heading' ? styles.heading : styles.paragraph}>
            {runs}
          </Text>
        );
      })}
    </View>
  );
}

type CompositionRow = TechCardResult['rows'][number];

/** Склад секціями за етапами; рядки поза секціями – у «Не розподілено по етапах». Без секцій – одна група. */
function groupCompositionRows(
  rows: CompositionRow[],
  sections: TechCardPdfRecipe['compositionSections'],
): Array<{ title: string | null; rows: CompositionRow[] }> {
  if (sections.length === 0) return [{ title: null, rows }];
  const placed = new Set<CompositionRow>();
  const groups = sections.map((section) => {
    const keys = new Set(section.rowKeys);
    const groupRows = rows.filter((r) => r.rowKey != null && keys.has(r.rowKey) && !placed.has(r));
    groupRows.forEach((r) => placed.add(r));
    return { title: section.title, rows: groupRows };
  });
  const rest = rows.filter((r) => !placed.has(r));
  const restTitle = 'Не розподілено по етапах';
  const restGroup = groups.find((g) => g.title === restTitle);
  if (restGroup) restGroup.rows.push(...rest);
  else if (rest.length > 0) groups.push({ title: restTitle, rows: rest });
  return groups.filter((g) => g.rows.length > 0);
}

function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

function StageCard({ stage }: { stage: TechCardPdfRecipe['stages'][number] }) {
  return (
    <View style={styles.stage}>
      <Text style={styles.stageTitle}>{stage.title}</Text>
      {(stage.facts || stage.output) && (
        <View style={styles.stageInfo}>
          {stage.facts ? <Text style={styles.stageInfoText}>{stage.facts}</Text> : null}
          {stage.facts && stage.output ? <View style={styles.stageInfoDivider} /> : null}
          {stage.output ? <Text style={styles.stageInfoText}>Вихід: {stage.output}</Text> : null}
        </View>
      )}
      {stage.blocks.length > 0 && <StageBlocks blocks={stage.blocks} />}
    </View>
  );
}

interface TechCardPdfDocumentProps {
  productName: string;
  specQty: number;
  portions: number;
  techCard: TechCardResult;
  /** Етапи, пакування, дозування; без нього – лише склад */
  recipe?: TechCardPdfRecipe | null;
}

export function TechCardPdfDocument({ productName, specQty, portions, techCard, recipe }: TechCardPdfDocumentProps) {
  const derivedRows = techCard.rows.filter((row) => row.derived);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Техкарта «{productName}» на {portions} порцій
          </Text>
          {recipe?.isDraft && <Text style={styles.draft}>{recipe.versionLabel}</Text>}
          {recipe && !recipe.isDraft && <Text style={styles.meta}>{recipe.versionLabel}</Text>}
          <Text style={styles.meta}>
            {[
              recipe?.sku ? `SKU ${recipe.sku}` : null,
              `Вага за рецептом – на ${specQty} ${pluralize(specQty, 'порцію', 'порції', 'порцій')}, маса нетто і брутто – на ${portions} ${pluralize(portions, 'порцію', 'порції', 'порцій')}`,
              recipe ? `Формула брутто: ${recipe.lossFormulaLabel}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.meta}>Надруковано {new Date().toLocaleString('uk-UA')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Склад</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, { width: COMPOSITION.name }, styles.headerText]}>Інгредієнт</Text>
              <Text style={[styles.cell, { width: COMPOSITION.recipe }, styles.right, styles.headerText]}>
                Вага за рецептом
              </Text>
              <Text style={[styles.cell, { width: COMPOSITION.loss }, styles.right, styles.headerText]}>Втрати</Text>
              <Text style={[styles.cell, { width: COMPOSITION.net }, styles.right, styles.headerText]}>Маса нетто</Text>
              <Text style={[styles.cell, { width: COMPOSITION.gross }, styles.right, styles.headerText]}>
                Маса брутто
              </Text>
            </View>

            {groupCompositionRows(techCard.rows, recipe?.compositionSections ?? []).map((group, gIdx) => (
              <View key={gIdx}>
                {group.rows.map((row, index) => {
                  const line = (
                    <View style={styles.row}>
                      <Text style={[styles.cell, { width: COMPOSITION.name }, group.title ? styles.groupedName : {}]}>
                        {row.nameDisplay}
                        {row.derived ? ' Σ' : ''}
                      </Text>
                      <Text style={[styles.cell, { width: COMPOSITION.recipe }, styles.right]}>{row.recipeDisplay}</Text>
                      <Text style={[styles.cell, { width: COMPOSITION.loss }, styles.right]}>{row.lossDisplay}</Text>
                      <Text style={[styles.cell, { width: COMPOSITION.net }, styles.right]}>{row.netDisplay}</Text>
                      <Text style={[styles.cell, { width: COMPOSITION.gross }, styles.right]}>{row.grossDisplay}</Text>
                    </View>
                  );
                  // Заголовок секції – разом із першим рядком, щоб не лишався сам унизу сторінки
                  return (
                    <View key={`${row.name}-${index}`} wrap={false}>
                      {index === 0 && group.title && (
                        <View style={[styles.row, styles.groupRow]}>
                          <Text style={[styles.cell, styles.groupTitle]}>{group.title}</Text>
                        </View>
                      )}
                      {line}
                    </View>
                  );
                })}
              </View>
            ))}

            <View style={[styles.row, styles.footerRow]} wrap={false}>
              <Text style={[styles.cell, { width: COMPOSITION.name }, styles.totalText]}>Разом</Text>
              <Text style={[styles.cell, { width: COMPOSITION.recipe }, styles.right, styles.totalText]}>
                {formatTechCardMassKg(techCard.totalRecipeMassKg)}
              </Text>
              <Text style={[styles.cell, { width: COMPOSITION.loss }, styles.totalText]} />
              <Text style={[styles.cell, { width: COMPOSITION.net }, styles.right, styles.totalText]}>
                {formatTechCardMassKg(techCard.totalNetMassKg, techCard.massPrecision)}
              </Text>
              <Text style={[styles.cell, { width: COMPOSITION.gross }, styles.right, styles.totalText]}>
                {formatTechCardMassKg(techCard.totalGrossMassKg, techCard.massPrecision)}
              </Text>
            </View>
          </View>
          {derivedRows.map((row, idx) => (
            <Text key={idx} style={styles.footnote}>
              Σ {row.nameDisplay} = {row.derived?.k.toLocaleString('uk-UA')} × {row.derived?.sourceName} +{' '}
              {row.derived?.b.toLocaleString('uk-UA')} на варку ({row.derived?.batchQtyDisplay} на {portions} порцій)
            </Text>
          ))}
        </View>

        {recipe && recipe.stages.length > 0 && (
          <View style={styles.section}>
            {pairs(recipe.stages).map((pair, rowIdx) => (
              // Заголовок розділу – в одному неподільному блоці з першим рядом, щоб не лишався сам унизу сторінки
              <View key={rowIdx} wrap={false}>
                {rowIdx === 0 && <Text style={styles.sectionTitle}>Етапи</Text>}
                <View style={styles.stageRow}>
                  {pair.map((stage, i) => (
                    <View key={i} style={styles.stageCol}>
                      <StageCard stage={stage} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {recipe && (recipe.packaging.length > 0 || recipe.portionsPerBox != null) && (
          <View style={[styles.section, styles.sectionSpaced]} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>Пакування</Text>
              {recipe.portionsPerBox != null && (
                <Text style={styles.sectionHeaderAside}>
                  <Text style={styles.label}>Порцій у коробці: </Text>
                  {recipe.portionsPerBox}
                </Text>
              )}
            </View>
            {recipe.packaging.length > 0 && (
              <View style={styles.table}>
                <View style={[styles.row, styles.headerRow]}>
                  <Text style={[styles.cell, { width: '44%' }, styles.headerText]}>Матеріал</Text>
                  <Text style={[styles.cell, { width: '14%' }, styles.right, styles.headerText]}>Кількість</Text>
                  <Text style={[styles.cell, { width: '16%' }, styles.headerText]}>База</Text>
                  <Text style={[styles.cell, { width: '26%' }, styles.headerText]}>Примітка</Text>
                </View>
                {recipe.packaging.map((row, idx) => (
                  <View key={idx} style={styles.row}>
                    <Text style={[styles.cell, { width: '44%' }]}>{row.name}</Text>
                    <Text style={[styles.cell, { width: '14%' }, styles.right]}>{row.qty}</Text>
                    <Text style={[styles.cell, { width: '16%' }]}>{row.basis}</Text>
                    <Text style={[styles.cell, { width: '26%' }]}>{row.note || '–'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {recipe && recipe.dosing.length > 0 && (
          <View style={[styles.section, styles.sectionSpaced]} wrap={false}>
            <Text style={styles.sectionTitle}>Дозування</Text>
            <View style={styles.table}>
              <View style={[styles.row, styles.headerRow]}>
                <Text style={[styles.cell, { width: '22%' }, styles.headerText]}>Фракція</Text>
                <Text style={[styles.cell, { width: '58%' }, styles.headerText]}>Склад</Text>
                <Text style={[styles.cell, { width: '20%' }, styles.right, styles.headerText]}>На порцію</Text>
              </View>
              {recipe.dosing.map((row, idx) => (
                <View key={idx} style={styles.row}>
                  <Text style={[styles.cell, { width: '22%' }]}>{row.name}</Text>
                  <Text style={[styles.cell, { width: '58%' }]}>{row.composition}</Text>
                  <Text style={[styles.cell, { width: '20%' }, styles.right]}>{row.mass}</Text>
                </View>
              ))}
              <View style={[styles.row, styles.footerRow]}>
                <Text style={[styles.cell, { width: '80%' }, styles.totalText]}>Разом</Text>
                <Text style={[styles.cell, { width: '20%' }, styles.right, styles.totalText]}>
                  {recipe.dosingTotal ?? '–'}
                </Text>
              </View>
              {recipe.dosingWithPackaging && (
                <View style={styles.row}>
                  <Text style={[styles.cell, { width: '22%' }, styles.totalText]}>З пакуванням</Text>
                  <Text style={[styles.cell, { width: '58%' }, styles.label]}>+ {recipe.dosingWithPackaging.materials}</Text>
                  <Text style={[styles.cell, { width: '20%' }, styles.right, styles.totalText]}>
                    {recipe.dosingWithPackaging.total}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {recipe?.notes && (
          <View style={[styles.section, styles.sectionSpaced]} wrap={false}>
            <Text style={styles.sectionTitle}>Примітки</Text>
            <Text style={styles.notes}>{recipe.notes}</Text>
          </View>
        )}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
