import { config } from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

config({ path: '.env.local' });
config({ path: '.env' });

interface DemoChargeRow {
  catalogCode: string;
  rawChargeName: string;
  cellStatus?: 'QUOTED' | 'NOT_APPLICABLE';
  wht?: number;
  vat?: number;
  thb?: number;
  usd?: number;
}

interface DemoAgentDataset {
  supplierName: string;
  companyName: string;
  countryCode: string;
  fileName: string;
  charges: DemoChargeRow[];
}

// Exact verified figures from Perkin Logistics' real "① compare cost" sheet (USLAX -> THLCH, 1x40DV + 1x20GP)
const DEMO_DATASETS: DemoAgentDataset[] = [
  {
    supplierName: 'COST Delta',
    companyName: 'Delta Global Logistics Co., Ltd.',
    countryCode: 'TH',
    fileName: 'Delta_Import_USA_Quote.pdf',
    charges: [
      { catalogCode: 'CNTR_40DV', rawChargeName: '40 DV', thb: 75800.0, usd: 2295.0 },
      { catalogCode: 'CNTR_20GP', rawChargeName: '20 GP', thb: 60600.0, usd: 1835.0 },
      { catalogCode: 'HANDLING_HBL', rawChargeName: 'HANDING FEE (THB 200 / HBL)', thb: 200.0 },
      { catalogCode: 'CUSTOMS_CLEARANCE', rawChargeName: 'CUSTOMER CLEARANCE', thb: 400.0 },
      { catalogCode: 'SERVICE_CHARGE', rawChargeName: 'SERVICE CHARGE', thb: 200.0 },
      { catalogCode: 'TRANSPORT_1X40', rawChargeName: '1x40 TRANSPORTATION CHARGE', wht: 55.0, thb: 5500.0 },
      { catalogCode: 'TRANSPORT_1X20', rawChargeName: '1x20 TRANSPORTATION CHARGE', thb: 5500.0 },
      { catalogCode: 'INSURANCE', rawChargeName: 'Insurance', thb: 1443.43 },
      { catalogCode: 'DEST_THC', rawChargeName: 'Dest TRML HANDLG', thb: 7400.0 },
      { catalogCode: 'DEST_DOC_FEE', rawChargeName: 'DEST DOC FEE', thb: 1500.0 },
      { catalogCode: 'EQPT_CLEANING', rawChargeName: 'EQPT CLEANING', thb: 1200.0 },
      { catalogCode: 'EQPT_MAINT_PREMIUM', rawChargeName: 'Equipment Maintenance Premium', thb: 1200.0 },
      { catalogCode: 'DEST_CIS_CIC', rawChargeName: 'CIS / CIC', thb: 5500.0, usd: 210.0 },
    ],
  },
  {
    supplierName: 'COST msl',
    companyName: 'MSL Freight Forwarding Ltd.',
    countryCode: 'US',
    fileName: 'MSL_USA_Rate_Sheet.pdf',
    charges: [
      { catalogCode: 'HANDLING_HBL', rawChargeName: 'HANDING FEE (THB 200 / HBL)', thb: 200.0 },
      { catalogCode: 'CUSTOMS_CLEARANCE', rawChargeName: 'CUSTOMER CLEARANCE', thb: 400.0 },
      { catalogCode: 'SERVICE_CHARGE', rawChargeName: 'SERVICE CHARGE', thb: 200.0 },
      { catalogCode: 'TRANSPORT_1X40', rawChargeName: '1x40 TRANSPORTATION CHARGE', wht: 55.0, thb: 5500.0 },
      { catalogCode: 'TRANSPORT_1X20', rawChargeName: '1x20 TRANSPORTATION CHARGE', thb: 5500.0 },
      { catalogCode: 'ORIGIN_PICKUP', rawChargeName: 'Pickup (750$ / container)', thb: 49500.0, usd: 1500.0 },
      { catalogCode: 'LIVE_LOAD', rawChargeName: 'live load 2 hrs free then US$95.0', thb: 6300.0, usd: 190.0 },
      { catalogCode: 'CHASSIS_RENTAL', rawChargeName: 'Chassis rental 45$/day/ container / min 2 days', thb: 6000.0, usd: 180.0 },
      { catalogCode: 'BL_FEE', rawChargeName: 'BL', thb: 900.0, usd: 25.0 },
      { catalogCode: 'ORIGIN_HANDLING', rawChargeName: 'Handling', thb: 900.0, usd: 25.0 },
      { catalogCode: 'OVERWEIGHT', rawChargeName: 'Overweight 350$/container', thb: 23100.0, usd: 700.0 },
      { catalogCode: 'TRI_AXLE_CHASSIS', rawChargeName: "Tri-axel chassis for 20'st", thb: 3200.0, usd: 95.0 },
      { catalogCode: 'INSURANCE', rawChargeName: 'Insurance', thb: 1443.43 },
      { catalogCode: 'DEST_THC', rawChargeName: 'Dest TRML HANDLG', thb: 7400.0 },
      { catalogCode: 'DEST_DOC_FEE', rawChargeName: 'DEST DOC FEE', thb: 1500.0 },
      { catalogCode: 'EQPT_CLEANING', rawChargeName: 'EQPT CLEANING', thb: 1200.0 },
      { catalogCode: 'EQPT_MAINT_PREMIUM', rawChargeName: 'Equipment Maintenance Premium', thb: 1200.0 },
      { catalogCode: 'DEST_CIS_CIC', rawChargeName: 'CIS / CIC', thb: 5500.0, usd: 210.0 },
    ],
  },
  {
    supplierName: 'COST air',
    companyName: 'Air & Sea Express Partner',
    countryCode: 'US',
    fileName: 'Air_Sea_Partner_Quote.pdf',
    charges: [
      { catalogCode: 'SEA_FREIGHT', rawChargeName: 'SEA FREIGHT CHARGE', thb: 35500.0, usd: 1075.0 },
      { catalogCode: 'EMERGENCY_BUNKER', rawChargeName: 'Emergency BUNKER', thb: 3300.0, usd: 100.0 },
      { catalogCode: 'ORIGIN_PICKUP', rawChargeName: 'Pickup (750$ / container)', thb: 63500.0, usd: 1924.0 },
      { catalogCode: 'LIVE_LOAD', rawChargeName: 'live load 2 hrs free then US$95.0', thb: 6300.0, usd: 190.0 },
      { catalogCode: 'CHASSIS_RENTAL', rawChargeName: 'Chassis rental 45$/day/ container / min 2 days', thb: 6000.0, usd: 180.0 },
      { catalogCode: 'BL_FEE', rawChargeName: 'BL', cellStatus: 'NOT_APPLICABLE' },
      { catalogCode: 'ORIGIN_HANDLING', rawChargeName: 'Handling', cellStatus: 'NOT_APPLICABLE' },
      { catalogCode: 'OVERWEIGHT', rawChargeName: 'Overweight 350$/container', cellStatus: 'NOT_APPLICABLE' },
      { catalogCode: 'TRI_AXLE_CHASSIS', rawChargeName: "Tri-axel chassis for 20'st", cellStatus: 'NOT_APPLICABLE' },
      { catalogCode: 'PREPULL', rawChargeName: 'prepull surcharge (150/CNTR)', thb: 9900.0, usd: 300.0 },
      { catalogCode: 'PIERPASS_CTF', rawChargeName: 'PIERPASS / CTF', thb: 5100.0, usd: 151.89 },
      { catalogCode: 'YARD_STORAGE', rawChargeName: 'Yard Storage (50$ per day)', thb: 1700.0, usd: 50.0 },
      { catalogCode: 'DOC_FEE_HAWB', rawChargeName: 'Document fee per HAWB', thb: 2000.0, usd: 60.0 },
      { catalogCode: 'INSURANCE', rawChargeName: 'Insurance', thb: 1443.43 },
      { catalogCode: 'DEST_THC', rawChargeName: 'Dest TRML HANDLG', thb: 7400.0 },
      { catalogCode: 'DEST_DOC_FEE', rawChargeName: 'DEST DOC FEE', thb: 1500.0 },
      { catalogCode: 'EQPT_CLEANING', rawChargeName: 'EQPT CLEANING', thb: 1200.0 },
      { catalogCode: 'EQPT_MAINT_PREMIUM', rawChargeName: 'Equipment Maintenance Premium', thb: 1200.0 },
      { catalogCode: 'DEST_CIS_CIC', rawChargeName: 'CIS / CIC', thb: 5500.0, usd: 210.0 },
    ],
  },
];

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const [admin] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@perkin.co.th'))
      .limit(1);

    if (!admin) throw new Error('Admin user not found. Run npm run db:seed first.');

    const catalogRows = await db.select().from(schema.chargeCatalog);
    const catalogByCode = new Map(catalogRows.map((c) => [c.code, c]));

    for (const dataset of DEMO_DATASETS) {
      let [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.name, dataset.supplierName))
        .limit(1);

      if (!supplier) {
        [supplier] = await db
          .insert(schema.suppliers)
          .values({
            name: dataset.supplierName,
            companyName: dataset.companyName,
            countryCode: dataset.countryCode,
          })
          .returning();
      }

      if (!supplier) continue;

      // Skip if standalone library record already exists for this supplier
      const existing = await db
        .select({ id: schema.rateRecords.id })
        .from(schema.rateRecords)
        .where(
          and(isNull(schema.rateRecords.shipmentId), eq(schema.rateRecords.supplierId, supplier.id))
        )
        .limit(1);

      if (existing[0]) {
        console.log(`  [skip] ${dataset.supplierName} already exists in Cost Agent Library`);
        continue;
      }

      const summaryText = dataset.charges
        .map((c) => {
          if (c.cellStatus === 'NOT_APPLICABLE') return `${c.rawChargeName}: -`;
          const parts = [];
          if (c.usd) parts.push(`USD ${c.usd.toLocaleString('en-US')}`);
          if (c.thb) parts.push(`${c.thb.toLocaleString('en-US')} THB`);
          if (c.wht) parts.push(`WHT ${c.wht}`);
          return `${c.rawChargeName}: ${parts.join(' / ')}`;
        })
        .join('\n');

      const [doc] = await db
        .insert(schema.sourceDocuments)
        .values({
          shipmentId: null,
          supplierId: supplier.id,
          fileName: dataset.fileName,
          fileType: 'PDF',
          mimeType: 'application/pdf',
          fileSize: Buffer.byteLength(summaryText, 'utf8'),
          fileHashSha256: `demo-${dataset.supplierName.toLowerCase().replace(/\s+/g, '-')}-2026`,
          rawTextContent: summaryText,
          extractionStatus: 'Extracted',
          createdBy: admin.id,
        })
        .returning();

      const now = new Date();
      const [rate] = await db
        .insert(schema.rateRecords)
        .values({
          shipmentId: null,
          sourceDocumentId: doc?.id ?? null,
          supplierId: supplier.id,
          polPortCode: 'USLAX',
          podPortCode: 'THLCH',
          modeType: 'FCL',
          containerSummary: '1×40DV + 1×20GP',
          serviceType: 'CY/CY',
          verificationStatus: 'Verified',
          verifiedBy: admin.id,
          verifiedAt: now,
        })
        .returning();

      if (!rate) continue;

      await db.insert(schema.rateCharges).values(
        dataset.charges.map((ch) => {
          const cat = catalogByCode.get(ch.catalogCode);
          const isNA = ch.cellStatus === 'NOT_APPLICABLE';
          return {
            rateRecordId: rate.id,
            chargeCatalogId: cat?.id ?? null,
            rawChargeName: ch.rawChargeName,
            category: cat?.category ?? 'Other',
            cellStatus: isNA ? 'NOT_APPLICABLE' : 'QUOTED',
            amount: isNA ? null : (ch.thb ?? ch.usd ?? 0).toFixed(4),
            currency: isNA ? null : ch.usd ? 'USD' : 'THB',
            amountUsd: isNA || ch.usd === undefined ? null : ch.usd.toFixed(4),
            amountThb: isNA || ch.thb === undefined ? null : ch.thb.toFixed(4),
            fxRateUsed: !isNA && ch.usd !== undefined ? '33.0000' : null,
            whtPercent: ch.wht ? '1.00' : '0.00',
            whtAmount: (ch.wht ?? 0).toFixed(4),
            vatPercent: '0.00',
            vatAmount: (ch.vat ?? 0).toFixed(4),
            chargeUnit: 'PER_SHIPMENT',
            isVerified: true,
          };
        })
      );

      console.log(`  [done] Inserted ${dataset.supplierName} (${dataset.charges.length} lines, Verified)`);
    }

    console.log('\nDemo Cost Agent data (COST Delta, COST msl, COST air) ready for presentation!');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
