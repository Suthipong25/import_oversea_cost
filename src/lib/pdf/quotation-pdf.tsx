import React from 'react';
import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { CustomerQuotationPdfPayload } from '@/domain/quotations/payload';
import { ensurePdfFontsRegistered, getPerkinLogoSrc } from './assets';

ensurePdfFontsRegistered();

const BORDER = '#111827';
const HEADER_BG = '#e5e7eb';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 9,
    color: '#111827',
    paddingTop: 34,
    paddingBottom: 28,
    paddingHorizontal: 40,
    lineHeight: 1.25,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  brandLogo: {
    width: 112,
    height: 42,
    objectFit: 'contain',
  },
  metaBox: {
    width: 195,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  metaLabel: {
    width: 78,
    fontSize: 8.5,
  },
  metaValWrap: {
    flex: 1,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    paddingBottom: 1,
    alignItems: 'center',
  },
  metaVal: {
    fontSize: 8.5,
  },
  customerBlock: {
    marginBottom: 12,
  },
  customerLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 3,
  },
  customerLabel: {
    width: 88,
    fontSize: 8.5,
  },
  customerValWrap: {
    flex: 1,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    paddingBottom: 1,
    minHeight: 13,
  },
  customerValBold: {
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  customerVal: {
    fontSize: 8.5,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  currencyLabel: {
    width: 88,
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  currencyVal: {
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  // Main 4-Column Perkin Bordered Grid
  table: {
    borderWidth: 1,
    borderColor: BORDER,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: HEADER_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    fontWeight: 'bold',
    fontSize: 8.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.7,
    borderBottomColor: BORDER,
    minHeight: 16.5,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 17.5,
  },
  cellItem: {
    width: '12%',
    borderRightWidth: 0.8,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    textAlign: 'center',
    justifyContent: 'center',
  },
  cellDetail: {
    width: '55%',
    borderRightWidth: 0.8,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  cellUnit: {
    width: '13%',
    borderRightWidth: 0.8,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    textAlign: 'center',
    justifyContent: 'center',
  },
  cellAmount: {
    width: '20%',
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    textAlign: 'right',
    justifyContent: 'center',
  },
  headerTextCenter: {
    textAlign: 'center',
    fontWeight: 'bold',
  },
  itemTextBold: {
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  detailText: {
    fontSize: 8.2,
  },
  detailTextIndent: {
    fontSize: 8.2,
    paddingLeft: 18,
  },
  summaryLabel: {
    fontSize: 8.5,
    textAlign: 'right',
  },
  summaryLabelBold: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  summaryAmount: {
    fontSize: 8.5,
    textAlign: 'right',
  },
  summaryAmountBold: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  // Bottom Right Manager Approval Signature Box
  sigWrap: {
    marginTop: 14,
    alignItems: 'flex-end',
  },
  sigBox: {
    width: 215,
    borderWidth: 1.1,
    borderColor: BORDER,
  },
  sigHeader: {
    backgroundColor: HEADER_BG,
    borderBottomWidth: 0.9,
    borderBottomColor: BORDER,
    paddingVertical: 3.5,
    textAlign: 'center',
    fontSize: 8.2,
    fontWeight: 'bold',
  },
  sigSpace: {
    height: 44,
  },
  sigDateRow: {
    borderTopWidth: 0.9,
    borderTopColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
  },
});

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDdMmmYy(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = parts[0]!.slice(-2);
  const monthIdx = Number.parseInt(parts[1]!, 10) - 1;
  const day = parts[2]!;
  const mon = MONTHS_SHORT[monthIdx] ?? parts[1]!;
  return `${day}-${mon}-${year}`;
}

function formatDdMmYyyy(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function fmtNum(val: string | number): string {
  try {
    return new Decimal(val).toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '0.00';
  }
}

export function QuotationPdfDocument({
  data,
  lang,
}: {
  data: CustomerQuotationPdfPayload;
  lang: 'th' | 'en';
}) {
  const isTh = lang === 'th';

  const t = {
    date: isTh ? 'วันที่' : 'Date',
    quoteNo: isTh ? 'เลขที่ใบเสนอราคา' : 'Quotation No.',
    customerName: isTh ? 'ชื่อลูกค้า' : 'Customer Name',
    address: isTh ? 'ที่อยู่' : 'Address',
    currency: isTh ? 'สกุลเงิน:' : 'Currency:',
    colItem: isTh ? 'ลำดับ' : 'Item',
    colDetail: isTh ? 'รายละเอียด' : 'Detail',
    colUnit: isTh ? 'หน่วย' : 'Unit',
    colAmount: isTh ? 'จำนวนเงิน' : 'Amount',
    total: isTh ? 'รวม' : 'Total',
    discount: isTh ? 'ส่วนลด' : 'Discount',
    vat: isTh ? 'ภาษีมูลค่าเพิ่ม' : 'Vat',
    grandTotal: isTh ? 'รวมทั้งสิ้น' : 'Grand Total',
  };

  // Embedded Details rows inside the table grid — exact match to Perkin's paper form
  const detailLines: Array<{ text: string; indent?: boolean }> = [
    { text: isTh ? 'รายละเอียดการขนส่ง (Details)' : 'Details' },
    { text: `Commodity : ${data.commodityDescription || '-'}` },
    { text: `Volume : ${data.volumeText || data.containerSummary}` },
    { text: `POL : ${data.polPortCode}` },
    { text: `POD : ${data.podPortCode}` },
    { text: `Mode : ${data.modeText || 'Sea (FCL)'}` },
    { text: `Term : ${data.termText || 'FOB'}` },
    { text: data.freeTimeText ? `Free Days : ${data.freeTimeText}` : 'Free Days' },
  ];

  if (data.cutOffEtdText) {
    detailLines.push({ text: `CUT OFF ETD : ${data.cutOffEtdText}`, indent: true });
  }
  if (data.transitTimeText) {
    const tt = data.transitTimeText.toUpperCase().startsWith('TT')
      ? data.transitTimeText
      : `TT ABOUT ${data.transitTimeText}`;
    detailLines.push({ text: tt, indent: true });
  }
  if (data.remarks) {
    detailLines.push({ text: data.remarks, indent: true });
  }

  // Pad empty grid rows so the A4 table height matches Perkin's classic form cleanly
  const TARGET_BODY_ROWS = 26;
  const usedRows = data.items.length + 1 + detailLines.length;
  const fillerCount = Math.max(2, TARGET_BODY_ROWS - usedRows);

  const telParts = [
    data.customerPhone ? `Tel: ${data.customerPhone}` : null,
    data.customerContact ? `Attn: ${data.customerContact}` : null,
  ].filter(Boolean);

  const quotationNoLabel =
    data.versionNumber > 1 ? `${data.quotationNumber} (v${data.versionNumber})` : data.quotationNumber;

  const approvedDateDisplay = data.approvedDateText || formatDdMmYyyy(data.issueDate);

  return (
    <Document title={`${data.quotationNumber}-v${data.versionNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Top Letterhead: Official PerkiN Logo | Date & Quotation No. */}
        <View style={styles.topRow}>
          {getPerkinLogoSrc() ? (
            <PdfImage src={getPerkinLogoSrc()!} style={styles.brandLogo} />
          ) : (
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>PerkiN</Text>
          )}
          <View style={styles.metaBox}>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>{t.date}</Text>
              <View style={styles.metaValWrap}>
                <Text style={styles.metaVal}>{formatDdMmmYy(data.issueDate)}</Text>
              </View>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>{t.quoteNo}</Text>
              <View style={styles.metaValWrap}>
                <Text style={styles.metaVal}>{quotationNoLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Customer Info Block */}
        <View style={styles.customerBlock}>
          <View style={styles.customerLine}>
            <Text style={styles.customerLabel}>{t.customerName}</Text>
            <View style={styles.customerValWrap}>
              <Text style={styles.customerValBold}>{data.customerName}</Text>
            </View>
          </View>
          <View style={styles.customerLine}>
            <Text style={styles.customerLabel}>{t.address}</Text>
            <View style={styles.customerValWrap}>
              <Text style={styles.customerVal}>{data.customerAddress || ' '}</Text>
            </View>
          </View>
          <View style={styles.customerLine}>
            <Text style={styles.customerLabel}> </Text>
            <View style={styles.customerValWrap}>
              <Text style={styles.customerVal}>{telParts.join('   ') || ' '}</Text>
            </View>
          </View>
        </View>

        {/* Currency Header */}
        <View style={styles.currencyRow}>
          <Text style={styles.currencyLabel}>{t.currency}</Text>
          <Text style={styles.currencyVal}>{data.currency}</Text>
        </View>

        {/* 4-Column Bordered Table matching Perkin's Real Quotation Form */}
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableHeader}>
            <View style={styles.cellItem}>
              <Text style={styles.headerTextCenter}>{t.colItem}</Text>
            </View>
            <View style={styles.cellDetail}>
              <Text style={styles.headerTextCenter}>{t.colDetail}</Text>
            </View>
            <View style={styles.cellUnit}>
              <Text style={styles.headerTextCenter}>{t.colUnit}</Text>
            </View>
            <View style={styles.cellAmount}>
              <Text style={styles.headerTextCenter}>{t.colAmount}</Text>
            </View>
          </View>

          {/* Customer Charge Items */}
          {data.items.map((item) => (
            <View key={item.itemOrder} style={styles.tableRow}>
              <View style={styles.cellItem}>
                <Text style={styles.itemTextBold}>{item.itemOrder}</Text>
              </View>
              <View style={styles.cellDetail}>
                <Text style={styles.itemTextBold}>
                  {isTh && item.descriptionTh ? item.descriptionTh : item.descriptionEn}
                </Text>
              </View>
              <View style={styles.cellUnit}>
                <Text style={styles.detailText}>{Number(item.quantity)}</Text>
              </View>
              <View style={styles.cellAmount}>
                <Text style={styles.detailText}>{fmtNum(item.totalAmount)}</Text>
              </View>
            </View>
          ))}

          {/* Blank Spacer Row */}
          <View style={styles.tableRow}>
            <View style={styles.cellItem}>
              <Text> </Text>
            </View>
            <View style={styles.cellDetail}>
              <Text> </Text>
            </View>
            <View style={styles.cellUnit}>
              <Text> </Text>
            </View>
            <View style={styles.cellAmount}>
              <Text> </Text>
            </View>
          </View>

          {/* Embedded Shipment Details Block inside the Grid */}
          {detailLines.map((line, i) => (
            <View key={`det-${i}`} style={styles.tableRow}>
              <View style={styles.cellItem}>
                <Text> </Text>
              </View>
              <View style={styles.cellDetail}>
                <Text style={line.indent ? styles.detailTextIndent : styles.detailText}>
                  {line.text}
                </Text>
              </View>
              <View style={styles.cellUnit}>
                <Text> </Text>
              </View>
              <View style={styles.cellAmount}>
                <Text> </Text>
              </View>
            </View>
          ))}

          {/* Empty Lined Rows Filling A4 Grid */}
          {Array.from({ length: fillerCount }).map((_, idx) => (
            <View key={`pad-${idx}`} style={styles.tableRow}>
              <View style={styles.cellItem}>
                <Text> </Text>
              </View>
              <View style={styles.cellDetail}>
                <Text> </Text>
              </View>
              <View style={styles.cellUnit}>
                <Text> </Text>
              </View>
              <View style={styles.cellAmount}>
                <Text> </Text>
              </View>
            </View>
          ))}

          {/* Integrated Footer Summary Rows: Total / Discount / Vat / Grand Total */}
          <View style={styles.tableRow}>
            <View style={styles.cellItem}>
              <Text> </Text>
            </View>
            <View style={styles.cellDetail}>
              <Text style={styles.summaryLabel}>{t.total}</Text>
            </View>
            <View style={styles.cellUnit}>
              <Text> </Text>
            </View>
            <View style={styles.cellAmount}>
              <Text style={styles.summaryAmount}>{fmtNum(data.subtotal)}</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.cellItem}>
              <Text> </Text>
            </View>
            <View style={styles.cellDetail}>
              <Text style={styles.summaryLabel}>{t.discount}</Text>
            </View>
            <View style={styles.cellUnit}>
              <Text> </Text>
            </View>
            <View style={styles.cellAmount}>
              <Text style={styles.summaryAmount}>
                {Number(data.discountAmount) > 0 ? fmtNum(data.discountAmount) : '-'}
              </Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.cellItem}>
              <Text> </Text>
            </View>
            <View style={styles.cellDetail}>
              <Text style={styles.summaryLabel}>{t.vat}</Text>
            </View>
            <View style={styles.cellUnit}>
              <Text style={styles.summaryAmount}>{Number(data.vatPercent)}%</Text>
            </View>
            <View style={styles.cellAmount}>
              <Text style={styles.summaryAmount}>{fmtNum(data.vatAmount)}</Text>
            </View>
          </View>

          <View style={styles.tableRowLast}>
            <View style={styles.cellItem}>
              <Text> </Text>
            </View>
            <View style={styles.cellDetail}>
              <Text style={styles.summaryLabelBold}>{t.grandTotal}</Text>
            </View>
            <View style={styles.cellUnit}>
              <Text> </Text>
            </View>
            <View style={styles.cellAmount}>
              <Text style={styles.summaryAmountBold}>{fmtNum(data.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Bottom Right Signature Box: MANAGER / APPROVED BY */}
        <View style={styles.sigWrap}>
          <View style={styles.sigBox}>
            <Text style={styles.sigHeader}>MANAGER / APPROVED BY</Text>
            <View style={styles.sigSpace} />
            <View style={styles.sigDateRow}>
              <Text style={{ fontWeight: 'bold' }}>DATE :</Text>
              <Text>{approvedDateDisplay}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
