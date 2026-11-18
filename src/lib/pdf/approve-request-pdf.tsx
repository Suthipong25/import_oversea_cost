import React from 'react';
import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import type { SellingDocumentMeta } from '@/modules/pricing/schema';
import { ensurePdfFontsRegistered, getPerkinLogoSrc } from './assets';

ensurePdfFontsRegistered();

export interface ApprovePdfLine {
  description: string;
  isVatApplicable: boolean;
  costWhtThb: string;
  costVatThb: string;
  costAmountThb: string;
  costAmountUsd: string | null;
  costForeignCurrUsd: string | null;
  revenueWhtPercent: string;
  sellingAmountThb: string | null;
  revenueAmountUsd: string | null;
}

export interface ApproveRequestPdfInput {
  shipmentRef: string;
  docMeta: SellingDocumentMeta;
  vatPercent: string;
  totalRevenueThb: string;
  totalCostThb: string;
  grossProfitThb: string;
  grossMarginPercent: string;
  status: string;
  approverName: string | null;
  approvedDateStr: string;
  lines: ApprovePdfLine[];
}

const BORDER = '#0f172a';
const BORDER_LIGHT = '#cbd5e1';
const HEADER_BG = '#e2e8f0';
const SUBHEADER_BG = '#f1f5f9';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 7.5,
    color: '#0f172a',
    paddingTop: 26,
    paddingBottom: 24,
    paddingHorizontal: 28,
    lineHeight: 1.25,
  },
  // Top Letterhead: PerkiN Logo | SEA FREIGHT IMPORT
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  logo: {
    width: 96,
    height: 36,
    objectFit: 'contain',
  },
  docTitle: {
    fontSize: 13.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    color: '#0f172a',
  },
  // Exact 3-Column Metadata Block
  metaGrid: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 12,
  },
  metaCol1: { flex: 1.2 },
  metaCol2: { flex: 1.0 },
  metaCol3: { flex: 0.95 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  metaLabel: {
    width: 52,
    fontSize: 7.2,
    color: '#334155',
  },
  metaValBox: {
    flex: 1,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    paddingBottom: 1,
    minHeight: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metaVal: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  metaSuffix: {
    fontSize: 6.8,
    fontWeight: 'bold',
    color: '#334155',
    marginLeft: 4,
  },
  // Main 10-Column Bordered Table (DETAIL | COST 5 cols | REVENUE 4 cols)
  table: {
    borderWidth: 1.2,
    borderColor: BORDER,
  },
  headWrap: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headDetail: {
    width: '28%',
    backgroundColor: HEADER_BG,
    borderRightWidth: 1.2,
    borderRightColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  headCostGroup: {
    width: '39.5%',
    borderRightWidth: 1.2,
    borderRightColor: BORDER,
  },
  headRevGroup: {
    width: '32.5%',
  },
  headGroupTop: {
    backgroundColor: HEADER_BG,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headSubRow: {
    flexDirection: 'row',
    backgroundColor: SUBHEADER_BG,
    minHeight: 22,
    alignItems: 'stretch',
  },
  // Data Rows
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_LIGHT,
    minHeight: 15.5,
    alignItems: 'stretch',
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: HEADER_BG,
    borderTopWidth: 1.2,
    borderTopColor: BORDER,
    minHeight: 19,
    alignItems: 'stretch',
    fontWeight: 'bold',
  },
  // Column Widths (sum = 100%)
  colDetail: {
    width: '28%',
    borderRightWidth: 1.2,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // COST 5 cols (sum = 39.5%)
  colCostWht: {
    width: '6.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colCostVat: {
    width: '5.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colCostThb: {
    width: '10.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colCostUsd: {
    width: '8.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colCostForeign: {
    width: '8.5%',
    borderRightWidth: 1.2,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  // REVENUE 4 cols (sum = 32.5%)
  colRevWht: {
    width: '6.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colRevVat: {
    width: '6.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colRevThb: {
    width: '10.5%',
    borderRightWidth: 0.6,
    borderRightColor: BORDER,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  colRevUsd: {
    width: '9%',
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  // Sub-header widths relative to their group containers
  subCostWht: { width: '16.45%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subCostVat: { width: '13.92%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subCostThb: { width: '26.58%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subCostUsd: { width: '21.52%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subCostFor: { width: '21.53%', justifyContent: 'center', alignItems: 'center', padding: 1 },
  subRevWht: { width: '20.0%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subRevVat: { width: '20.0%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subRevThb: { width: '32.3%', borderRightWidth: 0.6, borderRightColor: BORDER, justifyContent: 'center', alignItems: 'center', padding: 1 },
  subRevUsd: { width: '27.7%', justifyContent: 'center', alignItems: 'center', padding: 1 },
  headLabel: { fontSize: 7.5, fontWeight: 'bold', textAlign: 'center' },
  subLabel: { fontSize: 6.3, fontWeight: 'bold', textAlign: 'center' },
  subUnit: { fontSize: 5.6, color: '#475569', textAlign: 'center' },
  whtTag: { fontSize: 5.6, color: '#475569', fontWeight: 'bold', marginLeft: 4 },
  // Bottom 2-Column CONDITION | Summary Block
  bottomGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 20,
  },
  conditionBox: {
    width: '54%',
  },
  conditionTitle: {
    fontSize: 7.8,
    fontWeight: 'bold',
    textDecoration: 'underline',
    marginBottom: 4,
  },
  conditionLine: {
    fontSize: 7.5,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  summaryBox: {
    width: '42%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryLabel: {
    width: 92,
    fontSize: 7.6,
    fontWeight: 'bold',
  },
  summaryMid: {
    width: 48,
    textAlign: 'right',
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  summaryVal: {
    width: 82,
    textAlign: 'right',
    fontSize: 7.8,
    fontWeight: 'bold',
  },
  gpValBox: {
    width: 82,
    borderTopWidth: 0.9,
    borderBottomWidth: 2,
    borderColor: BORDER,
    paddingVertical: 1.5,
    alignItems: 'flex-end',
  },
  gpValText: {
    fontSize: 8.8,
    fontWeight: 'bold',
  },
  // 4-Box Approval Signature Footer
  sigGrid: {
    flexDirection: 'row',
    borderWidth: 1.2,
    borderColor: BORDER,
    marginTop: 18,
  },
  sigCol: {
    flex: 1,
    borderRightWidth: 0.8,
    borderRightColor: BORDER,
  },
  sigColLast: {
    flex: 1,
  },
  sigHeader: {
    backgroundColor: HEADER_BG,
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    paddingVertical: 3.5,
    textAlign: 'center',
    fontSize: 6.8,
    fontWeight: 'bold',
  },
  sigSpace: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sigApprover: {
    fontSize: 7.8,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  sigDateRow: {
    borderTopWidth: 0.8,
    borderTopColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 5,
    flexDirection: 'row',
    gap: 4,
    fontSize: 6.8,
  },
});

function parseDec(val: string | number | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  try {
    return new Decimal(String(val).replace(/,/g, ''));
  } catch {
    return new Decimal(0);
  }
}

function fmt(val: string | number | Decimal): string {
  try {
    const d = val instanceof Decimal ? val : new Decimal(val);
    return d.toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '0.00';
  }
}

function fmtNonZero(val: string | number | Decimal | null | undefined): string {
  const d = val instanceof Decimal ? val : parseDec(val);
  return d.gt(0) ? fmt(d) : '';
}

function fmtTotal(val: Decimal): string {
  return val.gt(0) ? fmt(val) : '-';
}

export function ApproveRequestPdfDocument({ data }: { data: ApproveRequestPdfInput }) {
  const vatRate = parseDec(data.vatPercent);

  let sumCostWht = new Decimal(0);
  let sumCostVat = new Decimal(0);
  let sumCostThb = new Decimal(0);
  let sumCostUsd = new Decimal(0);
  let sumCostFor = new Decimal(0);
  let sumRevWht = new Decimal(0);
  let sumRevVat = new Decimal(0);
  let sumRevThb = new Decimal(0);
  let sumRevUsd = new Decimal(0);

  const computedLines = data.lines.map((l) => {
    const cWht = parseDec(l.costWhtThb);
    const cVat = parseDec(l.costVatThb);
    const cThb = parseDec(l.costAmountThb);
    const cUsd = parseDec(l.costAmountUsd);
    const cFor = parseDec(l.costForeignCurrUsd);
    const rThb = parseDec(l.sellingAmountThb);
    const rUsd = parseDec(l.revenueAmountUsd);

    const rWht =
      l.isVatApplicable && rThb.gt(0)
        ? rThb
            .times(parseDec(l.revenueWhtPercent || '3'))
            .dividedBy(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : new Decimal(0);
    const rVat =
      l.isVatApplicable && rThb.gt(0)
        ? rThb.times(vatRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : new Decimal(0);

    sumCostWht = sumCostWht.plus(cWht);
    sumCostVat = sumCostVat.plus(cVat);
    sumCostThb = sumCostThb.plus(cThb);
    sumCostUsd = sumCostUsd.plus(cUsd);
    sumCostFor = sumCostFor.plus(cFor);
    sumRevWht = sumRevWht.plus(rWht);
    sumRevVat = sumRevVat.plus(rVat);
    sumRevThb = sumRevThb.plus(rThb);
    sumRevUsd = sumRevUsd.plus(rUsd);

    return {
      description: l.description,
      isVatApplicable: l.isVatApplicable,
      cWht,
      cVat,
      cThb,
      cUsd,
      cFor,
      rWht,
      rVat,
      rThb,
      rUsd,
    };
  });

  // Pad a few blank lines if table is short so it looks balanced and formal on A4
  const padCount = Math.max(0, 14 - computedLines.length);

  return (
    <Document title={`ApproveRequest-${data.shipmentRef}`}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Top Letterhead: Official PerkiN Logo + SEA FREIGHT IMPORT */}
        <View style={styles.topHeader}>
          {getPerkinLogoSrc() ? (
            <PdfImage src={getPerkinLogoSrc()!} style={styles.logo} />
          ) : (
            <Text style={styles.docTitle}>PerkiN</Text>
          )}
          <Text style={styles.docTitle}>SEA FREIGHT IMPORT</Text>
        </View>

        {/* 3-Column Header Metadata Grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCol1}>
            <MetaLine label="JOB NO." value={data.docMeta.jobNo} />
            <MetaLine label="CUSTOMER" value={data.docMeta.customerName} />
            <MetaLine label="CONSIGNEE" value={data.docMeta.consigneeName} />
            <MetaLine label="AGENT" value={data.docMeta.agentName} />
          </View>

          <View style={styles.metaCol2}>
            <MetaLine label="Commodity" value={data.docMeta.commodity} />
            <MetaLine label="Volume" value={data.docMeta.volume} />
            <MetaLine label="Weight" value={data.docMeta.weightKgs} suffix="KGS" />
            <MetaLine label="Measure" value={data.docMeta.measureCbm} suffix="CBM" />
          </View>

          <View style={styles.metaCol3}>
            <MetaLine label="Mode" value={data.docMeta.mode} />
            <MetaLine label="Term" value={data.docMeta.term} />
            <MetaLine label="POL" value={data.docMeta.pol} />
            <MetaLine label="POD" value={data.docMeta.pod} />
            <MetaLine label="Free Days" value={data.docMeta.freeDays} />
          </View>
        </View>

        {/* Main 10-Column Bordered Table: DETAIL | COST (5) | REVENUE (4) */}
        <View style={styles.table}>
          {/* 2-Level Header */}
          <View style={styles.headWrap}>
            <View style={styles.headDetail}>
              <Text style={styles.headLabel}>DETAIL</Text>
            </View>

            <View style={styles.headCostGroup}>
              <View style={styles.headGroupTop}>
                <Text style={styles.headLabel}>COST</Text>
              </View>
              <View style={styles.headSubRow}>
                <View style={styles.subCostWht}>
                  <Text style={styles.subLabel}>WHT</Text>
                </View>
                <View style={styles.subCostVat}>
                  <Text style={styles.subLabel}>VAT</Text>
                </View>
                <View style={styles.subCostThb}>
                  <Text style={styles.subLabel}>AMOUNT</Text>
                  <Text style={styles.subUnit}>(THB)</Text>
                </View>
                <View style={styles.subCostUsd}>
                  <Text style={styles.subLabel}>AMOUNT</Text>
                  <Text style={styles.subUnit}>(USD)</Text>
                </View>
                <View style={styles.subCostFor}>
                  <Text style={styles.subLabel}>FOREIGN</Text>
                  <Text style={styles.subUnit}>CURR (USD)</Text>
                </View>
              </View>
            </View>

            <View style={styles.headRevGroup}>
              <View style={styles.headGroupTop}>
                <Text style={styles.headLabel}>REVENUE</Text>
              </View>
              <View style={styles.headSubRow}>
                <View style={styles.subRevWht}>
                  <Text style={styles.subLabel}>WHT</Text>
                </View>
                <View style={styles.subRevVat}>
                  <Text style={styles.subLabel}>VAT</Text>
                </View>
                <View style={styles.subRevThb}>
                  <Text style={styles.subLabel}>AMOUNT</Text>
                  <Text style={styles.subUnit}>(THB)</Text>
                </View>
                <View style={styles.subRevUsd}>
                  <Text style={styles.subLabel}>AMOUNT</Text>
                  <Text style={styles.subUnit}>(USD)</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Line Rows */}
          {computedLines.map((row, idx) => (
            <View key={idx} style={styles.dataRow}>
              <View style={styles.colDetail}>
                <Text style={{ fontSize: 7.2, flex: 1 }}>{row.description}</Text>
                {row.isVatApplicable && <Text style={styles.whtTag}>WHT&amp;VAT</Text>}
              </View>
              <View style={styles.colCostWht}>
                <Text>{fmtNonZero(row.cWht)}</Text>
              </View>
              <View style={styles.colCostVat}>
                <Text>{fmtNonZero(row.cVat)}</Text>
              </View>
              <View style={styles.colCostThb}>
                <Text>{fmtNonZero(row.cThb)}</Text>
              </View>
              <View style={styles.colCostUsd}>
                <Text>{fmtNonZero(row.cUsd)}</Text>
              </View>
              <View style={styles.colCostForeign}>
                <Text>{fmtNonZero(row.cFor)}</Text>
              </View>
              <View style={styles.colRevWht}>
                <Text>{fmtNonZero(row.rWht)}</Text>
              </View>
              <View style={styles.colRevVat}>
                <Text>{fmtNonZero(row.rVat)}</Text>
              </View>
              <View style={styles.colRevThb}>
                <Text style={{ fontWeight: 'bold' }}>{fmtNonZero(row.rThb)}</Text>
              </View>
              <View style={styles.colRevUsd}>
                <Text>{fmtNonZero(row.rUsd)}</Text>
              </View>
            </View>
          ))}

          {/* Blank Formal Padding Rows */}
          {Array.from({ length: padCount }).map((_, i) => (
            <View key={`pad-${i}`} style={styles.dataRow}>
              <View style={styles.colDetail}><Text> </Text></View>
              <View style={styles.colCostWht}><Text> </Text></View>
              <View style={styles.colCostVat}><Text> </Text></View>
              <View style={styles.colCostThb}><Text> </Text></View>
              <View style={styles.colCostUsd}><Text> </Text></View>
              <View style={styles.colCostForeign}><Text> </Text></View>
              <View style={styles.colRevWht}><Text> </Text></View>
              <View style={styles.colRevVat}><Text> </Text></View>
              <View style={styles.colRevThb}><Text> </Text></View>
              <View style={styles.colRevUsd}><Text> </Text></View>
            </View>
          ))}

          {/* TOTAL Row */}
          <View style={styles.totalRow}>
            <View style={[styles.colDetail, { justifyContent: 'center' }]}>
              <Text style={{ fontSize: 7.8, fontWeight: 'bold' }}>TOTAL</Text>
            </View>
            <View style={styles.colCostWht}>
              <Text>{fmtTotal(sumCostWht)}</Text>
            </View>
            <View style={styles.colCostVat}>
              <Text>{fmtTotal(sumCostVat)}</Text>
            </View>
            <View style={styles.colCostThb}>
              <Text>{fmtTotal(sumCostThb)}</Text>
            </View>
            <View style={styles.colCostUsd}>
              <Text>{fmtTotal(sumCostUsd)}</Text>
            </View>
            <View style={styles.colCostForeign}>
              <Text>{fmtTotal(sumCostFor)}</Text>
            </View>
            <View style={styles.colRevWht}>
              <Text>{fmtTotal(sumRevWht)}</Text>
            </View>
            <View style={styles.colRevVat}>
              <Text>{fmtTotal(sumRevVat)}</Text>
            </View>
            <View style={styles.colRevThb}>
              <Text>{fmtTotal(sumRevThb)}</Text>
            </View>
            <View style={styles.colRevUsd}>
              <Text>{fmtTotal(sumRevUsd)}</Text>
            </View>
          </View>
        </View>

        {/* Bottom 2-Column Section: CONDITION (Left) | Summary Totals (Right) */}
        <View style={styles.bottomGrid}>
          <View style={styles.conditionBox}>
            <Text style={styles.conditionTitle}>CONDITION</Text>
            <Text style={styles.conditionLine}>
              MINIMUM GROSS PROFIT (THB) : NOT LESS THAN 5000 THB/JOB
            </Text>
            <Text style={styles.conditionLine}>
              MINIMUM GROSS PROFIT (%) : NOT LESS THAN 25%
            </Text>
          </View>

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>TOTAL REVENUE :</Text>
              <Text style={styles.summaryMid}> </Text>
              <Text style={styles.summaryVal}>{fmt(data.totalRevenueThb)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>TOTAL COST :</Text>
              <Text style={styles.summaryMid}> </Text>
              <Text style={styles.summaryVal}>{fmt(data.totalCostThb)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>DIFF ADVANCE :</Text>
              <Text style={styles.summaryMid}> </Text>
              <Text style={styles.summaryVal}>{data.docMeta.diffAdvance || '-'}</Text>
            </View>
            <View style={[styles.summaryRow, { marginTop: 2 }]}>
              <Text style={[styles.summaryLabel, { fontSize: 8.2 }]}>GROSS PROFIT :</Text>
              <Text style={styles.summaryMid}>
                {Number(data.grossMarginPercent).toFixed(2)}%
              </Text>
              <View style={styles.gpValBox}>
                <Text style={styles.gpValText}>{fmt(data.grossProfitThb)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 4-Box Approval Signature Footer */}
        <View style={styles.sigGrid}>
          {[
            { title: 'SALES / PREPARED BY', name: '', date: '' },
            { title: 'SALES CO / CHECKED BY', name: '', date: '' },
            { title: 'ACCOUNTING / AUDIT BY', name: '', date: '' },
            {
              title: 'MANAGER / APPROVED BY',
              name: data.status === 'Approved' ? (data.approverName ?? '') : '',
              date: data.status === 'Approved' ? data.approvedDateStr : '',
            },
          ].map((box, idx, arr) => (
            <View key={box.title} style={idx === arr.length - 1 ? styles.sigColLast : styles.sigCol}>
              <Text style={styles.sigHeader}>{box.title}</Text>
              <View style={styles.sigSpace}>
                {box.name ? <Text style={styles.sigApprover}>{box.name}</Text> : null}
              </View>
              <View style={styles.sigDateRow}>
                <Text style={{ fontWeight: 'bold' }}>DATE :</Text>
                <Text>{box.date}</Text>
              </View>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

function MetaLine({
  label,
  value,
  suffix,
}: {
  label: string;
  value?: string;
  suffix?: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValBox}>
        <Text style={styles.metaVal}>{value || ' '}</Text>
        {suffix ? <Text style={styles.metaSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}
