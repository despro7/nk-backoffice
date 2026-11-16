import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoiceRecord } from '@shared/types/invoices';
import { amountInWordsUa, formatDateUa, formatMoneyUa } from '@shared/utils/invoiceCalc';

const styles = StyleSheet.create({
  page: { fontFamily: 'InvoiceArial', fontSize: 10.5, paddingTop: 48, paddingBottom: 48, paddingHorizontal: 48, color: '#111111', lineHeight: 1.4 },
  bold: { fontWeight: 700 },
  head: { marginBottom: 18 },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 14 },
  block: { marginBottom: 12 },
  label: { fontWeight: 700 },
  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#111111', paddingVertical: 4, fontWeight: 700 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#999999', paddingVertical: 5 },
  cNum: { width: '6%' },
  cTitle: { width: '44%', paddingRight: 6 },
  cQty: { width: '10%', textAlign: 'right' },
  cUnit: { width: '10%', textAlign: 'center' },
  cPrice: { width: '15%', textAlign: 'right' },
  cSum: { width: '15%', textAlign: 'right' },
  total: { marginTop: 12, marginBottom: 14 },
  note: { marginBottom: 6 },
  signRow: { marginTop: 28, flexDirection: 'row', alignItems: 'flex-end' },
  // The signature PNG is ~1.44:1; fixed size keeps it undistorted.
  signImage: { width: 63, height: 44, marginHorizontal: 6 },
  signLine: { borderBottomWidth: 1, borderColor: '#111111', width: 90, height: 14, marginHorizontal: 6 },
  actTitle: { fontSize: 14, fontWeight: 700, marginBottom: 2 },
  actSub: { marginBottom: 10 },
  party: { marginBottom: 10 },
});

const money = (n: number): string => formatMoneyUa(n);

function numberedLines(invoice: InvoiceRecord, unitOverride?: (u: string) => string) {
  return invoice.lines.map((l, idx) => ({
    n: idx + 1,
    title: l.title,
    quantity: String(l.quantity).replace('.', ','),
    unit: unitOverride ? unitOverride(l.unit) : l.unit,
    price: money(l.price),
    amount: money(l.amount),
  }));
}

/** City for the act header: the first part of the payee address (`м. Кривий Ріг, ...`). */
function actCity(address: string): string {
  const first = address.split(',')[0]?.trim();
  return first && /^м\./.test(first) ? first : '';
}

function Signature({ src }: { src: string | null }) {
  return src ? <Image src={src} style={styles.signImage} /> : <View style={styles.signLine} />;
}

export function InvoicePdfDocument({ invoice, signature }: { invoice: InvoiceRecord; signature: string | null }) {
  const date = formatDateUa(invoice.date);
  const rows = numberedLines(invoice);
  const actRows = numberedLines(invoice, (u) => (u === 'посл.' ? 'послуга' : u));
  const payee = invoice.payee;
  const total = money(invoice.totalUah);
  const city = actCity(payee.address);

  return (
    <Document title={`Рахунок №${invoice.number} від ${date}`} author={payee.fullName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.bold}>{payee.fullName}</Text>
          <Text>ІПН: {payee.taxId}</Text>
          <Text>Адреса: {payee.address}</Text>
          {payee.phone ? <Text>Тел: {payee.phone}</Text> : null}
          {payee.bank ? <Text>Банк: {payee.bank}</Text> : null}
          {payee.iban ? <Text>IBAN: {payee.iban}</Text> : null}
        </View>

        <Text style={styles.title}>
          РАХУНОК №{invoice.number} від {date}
        </Text>

        <View style={styles.block}>
          <Text style={styles.label}>Платник:</Text>
          <Text>{invoice.payer.name}</Text>
          <Text>Код ЄДРПОУ: {invoice.payer.taxId}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Призначення платежу:</Text>
          <Text>{invoice.paymentPurpose}</Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cNum}>№</Text>
          <Text style={styles.cTitle}>Найменування послуги</Text>
          <Text style={styles.cQty}>Кіл-ть</Text>
          <Text style={styles.cUnit}>Од.</Text>
          <Text style={styles.cPrice}>Ціна, грн</Text>
          <Text style={styles.cSum}>Сума, грн</Text>
        </View>
        {rows.map((r) => (
          <View key={r.n} style={styles.tableRow} wrap={false}>
            <Text style={styles.cNum}>{r.n}</Text>
            <Text style={styles.cTitle}>{r.title}</Text>
            <Text style={styles.cQty}>{r.quantity}</Text>
            <Text style={styles.cUnit}>{r.unit}</Text>
            <Text style={styles.cPrice}>{r.price}</Text>
            <Text style={styles.cSum}>{r.amount}</Text>
          </View>
        ))}

        <Text style={styles.total}>
          <Text style={styles.bold}>Всього до сплати: {total} грн.</Text> ({amountInWordsUa(invoice.totalUah)})
        </Text>

        {invoice.taxNote ? <Text style={styles.note}>{invoice.taxNote}</Text> : null}
        {invoice.paymentTerms ? <Text style={styles.note}>{invoice.paymentTerms}</Text> : null}

        <View style={styles.signRow}>
          <Text style={styles.bold}>Виконавець:</Text>
          <Signature src={signature} />
          <Text>({payee.signatureName})</Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.actTitle}>
          Акт наданих послуг №{invoice.number}/1 від {date}
        </Text>
        <Text style={styles.actSub}>згідно з рахунком №{invoice.number} від {date}</Text>
        {city ? <Text style={styles.block}>{city}</Text> : null}

        <Text style={styles.party}>
          <Text style={styles.label}>Замовник: </Text>
          {invoice.payer.name}, ІПН {invoice.payer.taxId}, {invoice.payer.address}.
        </Text>
        <View style={styles.party}>
          <Text>
            <Text style={styles.label}>Виконавець: </Text>
            {payee.fullName}, ІПН {payee.taxId}, {payee.address}.
          </Text>
          {payee.phone ? <Text>Тел: {payee.phone}</Text> : null}
          {payee.bank ? <Text>Банк: {payee.bank}</Text> : null}
          {payee.iban ? <Text>IBAN: {payee.iban}</Text> : null}
        </View>

        <Text style={[styles.label, { marginBottom: 6 }]}>Перелік виконаних робіт:</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.cNum}>№</Text>
          <Text style={styles.cTitle}>Найменування</Text>
          <Text style={styles.cUnit}>Од.</Text>
          <Text style={styles.cQty}>К-ть</Text>
          <Text style={styles.cPrice}>Ціна, грн</Text>
          <Text style={styles.cSum}>Сума, грн</Text>
        </View>
        {actRows.map((r) => (
          <View key={r.n} style={styles.tableRow} wrap={false}>
            <Text style={styles.cNum}>{r.n}</Text>
            <Text style={styles.cTitle}>{r.title}</Text>
            <Text style={styles.cUnit}>{r.unit}</Text>
            <Text style={styles.cQty}>{r.quantity}</Text>
            <Text style={styles.cPrice}>{r.price}</Text>
            <Text style={styles.cSum}>{r.amount}</Text>
          </View>
        ))}

        <Text style={styles.total}>
          <Text style={styles.bold}>Всього без ПДВ: {total}</Text>
        </Text>

        <Text style={styles.note}>
          Сторони претензій одна до одної не мають. Цей акт складено у двох примірниках, по одному для кожної із сторін.
        </Text>

        <View style={styles.signRow}>
          <View>
            <Text style={styles.label}>Виконавець:</Text>
            <Text>{payee.fullName}</Text>
          </View>
          <Text style={{ marginLeft: 12 }}>Підпис:</Text>
          <Signature src={signature} />
        </View>
        <View style={[styles.signRow, { marginTop: 18 }]}>
          <View>
            <Text style={styles.label}>Замовник:</Text>
            <Text>{invoice.payer.name}</Text>
          </View>
          <Text style={{ marginLeft: 12 }}>Підпис:</Text>
          <View style={styles.signLine} />
        </View>
      </Page>
    </Document>
  );
}
