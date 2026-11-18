import React from 'react';
import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import { ensurePdfFontsRegistered, getPerkinLogoSrc } from './assets';

ensurePdfFontsRegistered();

export interface ComparePdfCatalogRow {
  id: string;
  nameEn: string;
  isSectionHeader: boolean;
}

export interface ComparePdfRateCharge {
  chargeCatalogId: string | null;
  rawChargeName: string;
  cellStatus: string;
  whtAmount: string;
  vatAmount: string;
  amountThb: string | null;
  amountUsd: string | null;
}

export interface ComparePdfAgentColumn {
  id: string;
  agentName: string;
  verificationStatus: string;
  totals: {
    whtThb: string;
    vatThb: string;
    amountThb: string;
    amountUsd: string;
  };
  charges: ComparePdfRateCharge[];
}

export interface CompareCostPdfInput {
  shipmentRef: string;
  customerName: string;
  polPortCode: string;
  podPortCode: string;
  containerSummary: string;
  fxRateUsdToThb: number;
  generatedDate: string;
  selectedRateRecordId: string | null;
  selectionReason: string | null;
  lowestComparableRateId: string | null;
  catalog: ComparePdfCatalogRow[];
  rates: ComparePdfAgentColumn[];
}

const BORDER = '#1e293b';
const BORDER_LIGHT = '#cbd5e1';
const NAVY = '#0c2340';
const NAVY_ALT = '#1e3a5f';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Sarabun',
    fontSize: 7.2,
    color: '#0f172a',
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 22,
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: NAVY,
    paddingBottom: 8,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  titleGroup: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  logo: {
    width: 92,
    height: 34,
    objectFit: 'contain',
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    color: NAVY,
    lineHeight: 1.3,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 7.8,
    color: '#475569',
    lineHeight: 1.35,
  },
  metaGrid: {
    alignItems: 'flex-end',
  },
  metaLine: {
    fontSize: 7.6,
    color: '#334155',
    lineHeight: 1.4,
    marginBottom: 1,
  },
  metaBold: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  // Main Side-by-Side Matrix Table
  table: {
    borderWidth: 1,
    borderColor: BORDER,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_LIGHT,
    minHeight: 14.5,
    alignItems: 'stretch',
  },
  rowAlt: {
    backgroundColor: '#f8fafc',
  },
  sectionRow: {
    flexDirection: 'row',
    backgroundColor: '#eef2f7',
    borderBottomWidth: 0.8,
    borderBottomColor: BORDER,
    minHeight: 15,
    alignItems: 'center',
  },
  headerRowTop: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    color: '#ffffff',
    fontWeight: 'bold',
    borderBottomWidth: 0.8,
    borderBottomColor: '#ffffff',
  },
  headerRowSub: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 6.7,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1.4,
    borderTopColor: BORDER,
    borderBottomWidth: 2,
    borderBottomColor: BORDER,
    fontWeight: 'bold',
    minHeight: 19,
    alignItems: 'center',
  },
  itemCol: {
    width: '24%',
    paddingVertical: 2,
    paddingHorizontal: 5,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  agentGroup: {
    flex: 1,
    flexDirection: 'row',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  agentGroupLast: {
    flex: 1,
    flexDirection: 'row',
  },
  agentHeaderCell: {
    flex: 1,
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  agentHeaderCellSelected: {
    backgroundColor: '#065f46',
  },
  agentHeaderCellAlt: {
    backgroundColor: NAVY_ALT,
  },
  subColWht: {
    width: '18%',
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'right',
    justifyContent: 'center',
    borderRightWidth: 0.4,
    borderRightColor: BORDER_LIGHT,
  },
  subColVat: {
    width: '16%',
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'right',
    justifyContent: 'center',
    borderRightWidth: 0.4,
    borderRightColor: BORDER_LIGHT,
  },
  subColThb: {
    width: '36%',
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'right',
    justifyContent: 'center',
    borderRightWidth: 0.4,
    borderRightColor: BORDER_LIGHT,
  },
  subColUsd: {
    width: '30%',
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'right',
    justifyContent: 'center',
  },
  textBold: {
    fontWeight: 'bold',
  },
  textMuted: {
    color: '#64748b',
  },
});

function fmtNum(val: string | null | undefined): string {
  if (!val) return '';
  try {
    const d = new Decimal(val);
    if (d.isZero()) return '';
    return d.toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '';
  }
}

function fmtTotal(val: string | null | undefined): string {
  if (!val) return '-';
  try {
    const d = new Decimal(val);
    if (d.isZero()) return '-';
    return d.toNumber().toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return '-';
  }
}

export function CompareCostPdfDocument({ data }: { data: CompareCostPdfInput }) {
  // Show only subjects that have values/NA in at least one Agent, keeping section headers when relevant
  const visibleCatalog = data.catalog.filter((sub) => {
    if (sub.isSectionHeader) return true;
    return data.rates.some((r) =>
      r.charges.some(
        (c) =>
          c.chargeCatalogId === sub.id &&
          (c.cellStatus === 'NOT_APPLICABLE' ||
            (c.amountThb && Number(c.amountThb) > 0) ||
            (c.amountUsd && Number(c.amountUsd) > 0) ||
            Number(c.whtAmount) > 0)
      )
    );
  });

  // Collect any unmapped charges across agents so nothing is silently dropped
  const unmappedNames = Array.from(
    new Set(
      data.rates.flatMap((r) =>
        r.charges
          .filter((c) => !c.chargeCatalogId && c.cellStatus === 'QUOTED')
          .map((c) => c.rawChargeName)
      )
    )
  );

  const selectedAgent = data.selectedRateRecordId
    ? data.rates.find((r) => r.id === data.selectedRateRecordId)
    : null;

  return (
    <Document title={`Compare-Cost-${data.shipmentRef}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Top Letterhead */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {getPerkinLogoSrc() ? (
              <PdfImage src={getPerkinLogoSrc()!} style={styles.logo} />
            ) : (
              <Text style={styles.title}>PerkiN</Text>
            )}
            <View style={styles.titleGroup}>
              <Text style={styles.title}>COST COMPARISON SHEET (COMPARE COST)</Text>
              <Text style={styles.subtitle}>
                Perkin Logistics (Thailand) Co., Ltd. · {data.customerName}
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <Text style={styles.metaLine}>
              Ref: <Text style={styles.metaBold}>{data.shipmentRef}</Text>  |  Date:{' '}
              <Text style={styles.metaBold}>{data.generatedDate}</Text>
            </Text>
            <Text style={styles.metaLine}>
              Route:{' '}
              <Text style={styles.metaBold}>
                {data.polPortCode} - {data.podPortCode}
              </Text>{' '}
              |  Size: <Text style={styles.metaBold}>{data.containerSummary}</Text>
            </Text>
            <Text style={styles.metaLine}>
              FX Ref: <Text style={styles.metaBold}>{data.fxRateUsdToThb.toFixed(2)} THB/USD</Text>
              {selectedAgent ? (
                <>
                  {'  |  '}Selected:{' '}
                  <Text style={[styles.metaBold, { color: '#065f46' }]}>
                    {selectedAgent.agentName} ({fmtTotal(selectedAgent.totals.amountThb)} THB)
                  </Text>
                </>
              ) : null}
            </Text>
          </View>
        </View>

        {/* Aligned Side-by-Side Comparison Matrix */}
        <View style={styles.table}>
          {/* Header Level 1: ITEM | Agent 1 | Agent 2 | Agent 3 */}
          <View style={styles.headerRowTop}>
            <View style={[styles.itemCol, { borderRightColor: '#334155' }]}>
              <Text style={{ fontSize: 8, fontWeight: 'bold' }}>ITEM (หัวข้อค่าใช้จ่าย)</Text>
            </View>
            {data.rates.map((r, idx) => {
              const isSelected = data.selectedRateRecordId === r.id;
              const isLowest = data.lowestComparableRateId === r.id;
              return (
                <View
                  key={r.id}
                  style={[
                    styles.agentHeaderCell,
                    idx === data.rates.length - 1 ? { borderRightWidth: 0 } : {},
                    isSelected
                      ? styles.agentHeaderCellSelected
                      : idx % 2 === 1
                        ? styles.agentHeaderCellAlt
                        : {},
                  ]}
                >
                  <Text style={{ fontSize: 8.5, fontWeight: 'bold', lineHeight: 1.3 }}>
                    {r.agentName}
                  </Text>
                  <Text style={{ fontSize: 6.5, color: '#cbd5e1', marginTop: 1.5, lineHeight: 1.25 }}>
                    {isSelected
                      ? 'SELECTED WINNER'
                      : isLowest
                        ? 'LOWEST COST'
                        : r.verificationStatus === 'Verified'
                          ? 'Verified'
                          : 'Pending'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Header Level 2: Blank | WHT | VAT | THB | USD per Agent */}
          <View style={styles.headerRowSub}>
            <View style={styles.itemCol}>
              <Text style={{ fontSize: 6.8, color: '#475569' }}>Charge Description</Text>
            </View>
            {data.rates.map((r, idx) => (
              <View
                key={`sub-${r.id}`}
                style={idx === data.rates.length - 1 ? styles.agentGroupLast : styles.agentGroup}
              >
                <View style={styles.subColWht}>
                  <Text>WHT</Text>
                </View>
                <View style={styles.subColVat}>
                  <Text>VAT</Text>
                </View>
                <View style={styles.subColThb}>
                  <Text>AMOUNT (THB)</Text>
                </View>
                <View style={styles.subColUsd}>
                  <Text>AMOUNT (USD)</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Catalog Rows */}
          {visibleCatalog.map((sub, rowIdx) => {
            if (sub.isSectionHeader) {
              return (
                <View key={sub.id} style={styles.sectionRow}>
                  <View style={{ paddingHorizontal: 5 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 7.5, color: NAVY }}>
                      {sub.nameEn}
                    </Text>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={sub.id}
                style={[styles.row, rowIdx % 2 === 1 ? styles.rowAlt : {}]}
              >
                <View style={styles.itemCol}>
                  <Text>{sub.nameEn}</Text>
                </View>
                {data.rates.map((r, idx) => {
                  const ch = r.charges.find((c) => c.chargeCatalogId === sub.id);
                  const isNA = ch?.cellStatus === 'NOT_APPLICABLE';
                  return (
                    <View
                      key={`${sub.id}-${r.id}`}
                      style={
                        idx === data.rates.length - 1 ? styles.agentGroupLast : styles.agentGroup
                      }
                    >
                      <View style={styles.subColWht}>
                        <Text style={styles.textMuted}>
                          {isNA ? '' : fmtNum(ch?.whtAmount)}
                        </Text>
                      </View>
                      <View style={styles.subColVat}>
                        <Text style={styles.textMuted}>
                          {isNA ? '' : fmtNum(ch?.vatAmount)}
                        </Text>
                      </View>
                      <View style={styles.subColThb}>
                        <Text style={isNA ? styles.textMuted : styles.textBold}>
                          {isNA ? '-' : fmtNum(ch?.amountThb)}
                        </Text>
                      </View>
                      <View style={styles.subColUsd}>
                        <Text style={styles.textMuted}>
                          {isNA ? '' : fmtNum(ch?.amountUsd)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}

          {/* Unmapped Extra Rows (if any) */}
          {unmappedNames.map((rawName, uIdx) => (
            <View
              key={`unmapped-${uIdx}`}
              style={[styles.row, (visibleCatalog.length + uIdx) % 2 === 1 ? styles.rowAlt : {}]}
            >
              <View style={styles.itemCol}>
                <Text>{rawName}</Text>
              </View>
              {data.rates.map((r, idx) => {
                const ch = r.charges.find(
                  (c) => !c.chargeCatalogId && c.rawChargeName === rawName
                );
                return (
                  <View
                    key={`u-${uIdx}-${r.id}`}
                    style={
                      idx === data.rates.length - 1 ? styles.agentGroupLast : styles.agentGroup
                    }
                  >
                    <View style={styles.subColWht}>
                      <Text style={styles.textMuted}>{fmtNum(ch?.whtAmount)}</Text>
                    </View>
                    <View style={styles.subColVat}>
                      <Text style={styles.textMuted}>{fmtNum(ch?.vatAmount)}</Text>
                    </View>
                    <View style={styles.subColThb}>
                      <Text style={styles.textBold}>{fmtNum(ch?.amountThb)}</Text>
                    </View>
                    <View style={styles.subColUsd}>
                      <Text style={styles.textMuted}>{fmtNum(ch?.amountUsd)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Double-Underlined TOTAL Row */}
          <View style={styles.totalRow}>
            <View style={styles.itemCol}>
              <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: NAVY }}>TOTAL</Text>
            </View>
            {data.rates.map((r, idx) => (
              <View
                key={`tot-${r.id}`}
                style={idx === data.rates.length - 1 ? styles.agentGroupLast : styles.agentGroup}
              >
                <View style={styles.subColWht}>
                  <Text>{fmtTotal(r.totals.whtThb)}</Text>
                </View>
                <View style={styles.subColVat}>
                  <Text>{fmtTotal(r.totals.vatThb)}</Text>
                </View>
                <View style={styles.subColThb}>
                  <Text style={{ fontSize: 8.2, color: NAVY }}>{fmtTotal(r.totals.amountThb)}</Text>
                </View>
                <View style={styles.subColUsd}>
                  <Text>{fmtTotal(r.totals.amountUsd)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
