import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { hashPassword } from '../auth/password';

config({ path: '.env.local' });
config({ path: '.env' });

interface SeedChargeSubject {
  code: string;
  nameEn: string;
  nameTh: string;
  category: 'Ocean' | 'Origin_Local' | 'Dest_Port' | 'TH_Local_Transport' | 'Insurance_Misc' | 'Other';
  isSectionHeader?: boolean;
  defaultWhtPercent?: string;
  defaultVatPercent?: string;
  isBaselineCandidate?: boolean;
  aliases?: string[];
}

// Unified FCL & LCL subjects confirmed from Perkin Logistics' "① compare cost" + real Agent rate items
const SEED_CHARGE_SUBJECTS: SeedChargeSubject[] = [
  { code: 'SEA_FREIGHT', nameEn: 'SEA FREIGHT CHARGE', nameTh: 'ค่าระวางเรือ (Ocean Freight)', category: 'Ocean', aliases: ['O/F', 'OFR', 'OCEAN FREIGHT', 'SEA FREIGHT', 'FREIGHT CHARGE'] },
  { code: 'BOOKING_FEE', nameEn: 'Booking Fee (Sea Freight)', nameTh: 'ค่าจองระวางเรือ (Booking Fee)', category: 'Ocean', aliases: ['BOOKING FEE', 'BOOKING FEE (SEA FREIGHT)', 'BOOKING', 'SEA FREIGHT BOOKING'] },
  { code: 'CIS_OCEAN', nameEn: 'CONTAINER IMBALANCE SURCHARGE', nameTh: 'ค่าธรรมเนียมสมดุลตู้', category: 'Ocean', aliases: ['CONTAINER IMBALANCE'] },
  { code: 'LSS', nameEn: 'LOW SULPHUR SURCHARGE', nameTh: 'ค่าน้ำมันกำมะถันต่ำ', category: 'Ocean', aliases: ['LSS', 'IMO2020', 'LOW SULPHUR'] },
  { code: 'LCL_CAF', nameEn: 'CAF (Currency Adjustment Factor)', nameTh: 'ค่าปรับอัตราแลกเปลี่ยน (CAF)', category: 'Ocean', aliases: ['CAF', 'CURRENCY ADJUSTMENT FACTOR'] },
  { code: 'CNTR_40DV', nameEn: '40 DV', nameTh: 'ค่าระวางตู้ 40 DV', category: 'Ocean', aliases: ["40'DV", "40'GP", "OFR 40'"] },
  { code: 'CNTR_20GP', nameEn: '20 GP', nameTh: 'ค่าระวางตู้ 20 GP', category: 'Ocean', aliases: ["20'GP", "20'DV", "OFR 20'"] },
  { code: 'SEC_LOCAL_CHARGE', nameEn: 'Local Charge', nameTh: 'ค่าใช้จ่ายในประเทศ (FCL / LCL)', category: 'TH_Local_Transport', isSectionHeader: true },
  { code: 'HANDLING_HBL', nameEn: 'HANDING FEE (THB 200 / HBL)', nameTh: 'ค่าดำเนินการ (HBL)', category: 'TH_Local_Transport', aliases: ['HANDLING FEE HBL', 'HBL HANDLING'] },
  { code: 'CUSTOMS_CLEARANCE', nameEn: 'CUSTOMER CLEARANCE', nameTh: 'ค่าพิธีการศุลกากร (Customs Clearance)', category: 'TH_Local_Transport', aliases: ['CUSTOMS CLEARANCE', 'CUSTOMS CLEARANGE', 'IMPORT CLEARANCE', 'EXPORT CLEARANCE', 'CLEARANCE', 'CLEARANCE FEE', 'ชิปปิ้ง'] },
  { code: 'SERVICE_CHARGE', nameEn: 'SERVICE CHARGE', nameTh: 'ค่าบริการ', category: 'TH_Local_Transport', aliases: ['SERVICE FEE'] },
  { code: 'TRUCKING_FEE', nameEn: 'Trucking Fee', nameTh: 'ค่าขนส่งรถบรรทุก (Trucking)', category: 'TH_Local_Transport', defaultWhtPercent: '1.00', aliases: ['TRUCKING FEE', 'TRUCKING', 'TRUCK COST', 'TRANSPORTATION CHARGE', 'INLAND TRUCKING', 'LOCAL TRUCKING'] },
  { code: 'TRANSPORT_1X40', nameEn: '1x40 TRANSPORTATION CHARGE', nameTh: 'ค่าขนส่งตู้ 1x40', category: 'TH_Local_Transport', defaultWhtPercent: '1.00', aliases: ['TRUCKING 40', 'TRANSPORT 40FT'] },
  { code: 'TRANSPORT_1X20', nameEn: '1x20 TRANSPORTATION CHARGE', nameTh: 'ค่าขนส่งตู้ 1x20', category: 'TH_Local_Transport', defaultWhtPercent: '1.00', aliases: ['TRUCKING 20', 'TRANSPORT 20FT'] },
  { code: 'EMERGENCY_BUNKER', nameEn: 'Emergency BUNKER', nameTh: 'ค่าน้ำมันฉุกเฉิน (EBS/BAF)', category: 'Origin_Local', aliases: ['EBS', 'BAF', 'BUNKER'] },
  { code: 'VGM_FEE', nameEn: 'VGM (Verified Gross Mass)', nameTh: 'ค่าแจ้งน้ำหนักตู้ (VGM)', category: 'Origin_Local', aliases: ['VGM', 'VERIFIED GROSS MASS', 'VGM FEE'] },
  { code: 'ORIGIN_PICKUP', nameEn: 'Pickup (750$ / container)', nameTh: 'ค่ารับสินค้าต้นทาง (Pickup)', category: 'Origin_Local', aliases: ['PICKUP', 'ORIGIN PICKUP', 'DRAYAGE'] },
  { code: 'LIVE_LOAD', nameEn: 'live load 2 hrs free then US$95.0', nameTh: 'ค่ารอโหลดสินค้า (Live Load)', category: 'Origin_Local', aliases: ['LIVE LOAD', 'WAITING TIME'] },
  { code: 'CHASSIS_RENTAL', nameEn: 'Chassis rental 45$/day/ container / min 2 days', nameTh: 'ค่าเช่าหางลาก (Chassis)', category: 'Origin_Local', aliases: ['CHASSIS', 'CHASSIS RENTAL'] },
  { code: 'BL_FEE', nameEn: 'BL', nameTh: 'ค่าออกใบตราส่ง (B/L)', category: 'Origin_Local', aliases: ['B/L', 'B/L FEE', 'BILL OF LADING'] },
  { code: 'ORIGIN_HANDLING', nameEn: 'Handling', nameTh: 'ค่าดำเนินการต้นทาง', category: 'Origin_Local', aliases: ['ORIGIN HANDLING'] },
  { code: 'OVERWEIGHT', nameEn: 'Overweight 350$/container', nameTh: 'ค่าน้ำหนักเกิน (Overweight)', category: 'Origin_Local', aliases: ['OVERWEIGHT', 'OWS'] },
  { code: 'TRI_AXLE_CHASSIS', nameEn: "Tri-axel chassis for 20'st", nameTh: 'ค่าหางลาก 3 เพลา (Tri-axle)', category: 'Origin_Local', aliases: ['TRI-AXLE', 'TRI AXLE'] },
  { code: 'PREPULL', nameEn: 'prepull surcharge (150/CNTR)', nameTh: 'ค่าลากตู้ล่วงหน้า (Pre-pull)', category: 'Origin_Local', aliases: ['PREPULL', 'PRE-PULL'] },
  { code: 'PIERPASS_CTF', nameEn: 'PIERPASS / CTF', nameTh: 'ค่าธรรมเนียมท่าเรือ (PierPass/CTF)', category: 'Origin_Local', aliases: ['PIERPASS', 'CTF', 'CLEAN TRUCK FEE'] },
  { code: 'YARD_STORAGE', nameEn: 'Yard Storage (50$ per day)', nameTh: 'ค่าฝากตู้ (Yard Storage)', category: 'Origin_Local', aliases: ['YARD STORAGE', 'STORAGE'] },
  { code: 'DOC_FEE_HAWB', nameEn: 'Document fee per HAWB', nameTh: 'ค่าเอกสาร (Document Fee / HAWB)', category: 'Origin_Local', aliases: ['DOCUMENT FEE', 'DOCUMENTATION FEE', 'DOC FEE', 'HAWB FEE'] },
  { code: 'INSURANCE', nameEn: 'Insurance', nameTh: 'ค่าประกันภัยสินค้า', category: 'Insurance_Misc', isBaselineCandidate: true, aliases: ['CARGO INSURANCE', 'MARINE INSURANCE'] },
  { code: 'DEST_THC', nameEn: 'Dest TRML HANDLG', nameTh: 'ค่า THC (Terminal Handling Charge)', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['THC', 'TERMINAL HANDLING CHARGE', 'DEST THC', 'DTHC', 'OTHC', 'TERMINAL HANDLING'] },
  { code: 'CFS_CHARGE', nameEn: 'CFS Charge (LCL)', nameTh: 'ค่าเปิดตู้/คลังสินค้า (CFS - LCL)', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['CFS', 'CFS FEE', 'CFS CHARGE', 'CONTAINER FREIGHT STATION', 'LCL CFS'] },
  { code: 'SEAL_FEE', nameEn: 'Seal Fee', nameTh: 'ค่าซีลตู้ (Seal Fee)', category: 'Dest_Port', aliases: ['SEAL FEE', 'SEAL', 'CONTAINER SEAL', 'E-SEAL'] },
  { code: 'DEST_DOC_FEE', nameEn: 'DEST DOC FEE', nameTh: 'ค่าเอกสารปลายทาง (D/O Fee)', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['D/O FEE', 'DO FEE', 'DEST DOC', 'DELIVERY ORDER'] },
  { code: 'LCL_FAC', nameEn: 'FAC (LCL)', nameTh: 'ค่าธรรมเนียม FAC (LCL)', category: 'Dest_Port', aliases: ['FAC', 'FAC FEE'] },
  { code: 'LCL_STATUS_FEE', nameEn: 'Status Fee (LCL)', nameTh: 'ค่า Status (LCL)', category: 'Dest_Port', aliases: ['STATUS FEE', 'LCL STATUS'] },
  { code: 'LCL_PCS', nameEn: 'PCS (Port Congestion Surcharge)', nameTh: 'ค่าความแออัดท่าเรือ (PCS)', category: 'Dest_Port', aliases: ['PCS', 'PORT CONGESTION'] },
  { code: 'EQPT_CLEANING', nameEn: 'EQPT CLEANING', nameTh: 'ค่าล้างตู้', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['CONTAINER CLEANING', 'CLEANING FEE'] },
  { code: 'EQPT_MAINT_PREMIUM', nameEn: 'Equipment Maintenance Premium', nameTh: 'ค่าบำรุงรักษาตู้', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['EMP', 'MAINTENANCE PREMIUM'] },
  { code: 'DEST_CIS_CIC', nameEn: 'CIS / CIC', nameTh: 'ค่า CIS / CIC ปลายทาง', category: 'Dest_Port', isBaselineCandidate: true, aliases: ['CIS', 'CIC', 'CIS/CIC'] },
];

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? 'Perkin2026!';
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    console.log('Seeding users (4 roles)...');
    const seedUsers = [
      { email: 'admin@perkin.co.th', fullName: 'IT Admin (Perkin)', role: 'admin' },
      { email: 'sales@perkin.co.th', fullName: 'Pricing / Sales Co.', role: 'sales_co' },
      { email: 'manager@perkin.co.th', fullName: 'Sales Manager', role: 'sales_manager' },
      { email: 'exec@perkin.co.th', fullName: 'Management Viewer', role: 'management' },
    ];

    for (const u of seedUsers) {
      await db
        .insert(schema.users)
        .values({
          email: u.email,
          fullName: u.fullName,
          passwordHash: hashPassword(defaultPassword),
          role: u.role,
          isActive: true,
        })
        .onConflictDoNothing({ target: schema.users.email });
    }

    const [adminUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@perkin.co.th'))
      .limit(1);

    console.log(`Seeding ${SEED_CHARGE_SUBJECTS.length} Compare Cost charge subjects + aliases...`);
    for (let i = 0; i < SEED_CHARGE_SUBJECTS.length; i++) {
      const item = SEED_CHARGE_SUBJECTS[i]!;
      await db
        .insert(schema.chargeCatalog)
        .values({
          code: item.code,
          nameEn: item.nameEn,
          nameTh: item.nameTh,
          category: item.category,
          isSectionHeader: item.isSectionHeader ?? false,
          defaultWhtPercent: item.defaultWhtPercent ?? '0.00',
          defaultVatPercent: item.defaultVatPercent ?? '0.00',
          isBaselineCandidate: item.isBaselineCandidate ?? false,
          displayOrder: (i + 1) * 10,
          isActive: true,
        })
        .onConflictDoNothing({ target: schema.chargeCatalog.code });

      if (item.aliases?.length) {
        const [catalogRow] = await db
          .select({ id: schema.chargeCatalog.id })
          .from(schema.chargeCatalog)
          .where(eq(schema.chargeCatalog.code, item.code))
          .limit(1);

        if (catalogRow) {
          for (const alias of item.aliases) {
            await db
              .insert(schema.chargeAliases)
              .values({
                chargeCatalogId: catalogRow.id,
                aliasPattern: alias.toUpperCase(),
                isConfirmed: true,
                createdBy: adminUser?.id ?? null,
              })
              .onConflictDoNothing({ target: schema.chargeAliases.aliasPattern });
          }
        }
      }
    }

    console.log('Seeding default FX snapshot (USD -> THB = 33.0000)...');
    await db
      .insert(schema.exchangeRates)
      .values({
        fromCurrency: 'USD',
        toCurrency: 'THB',
        rate: '33.0000',
        source: 'Internal',
        effectiveDate: '2026-11-18',
        createdBy: adminUser?.id ?? null,
      })
      .onConflictDoNothing();

    console.log('Seeding sample suppliers (COST Delta, COST msl, COST air)...');
    const existingSuppliers = await db.select({ name: schema.suppliers.name }).from(schema.suppliers);
    const existingNames = new Set(existingSuppliers.map((s) => s.name));
    const sampleSuppliers = [
      { name: 'COST Delta', companyName: 'Delta Global Logistics Co., Ltd.', countryCode: 'TH' },
      { name: 'COST msl', companyName: 'MSL Freight Forwarding Ltd.', countryCode: 'US' },
      { name: 'COST air', companyName: 'Air & Sea Express Partner', countryCode: 'US' },
    ];
    for (const sup of sampleSuppliers) {
      if (!existingNames.has(sup.name)) {
        await db.insert(schema.suppliers).values(sup);
      }
    }

    console.log('\nSeed completed successfully!');
    console.log(`Test login: sales@perkin.co.th / ${defaultPassword}`);
    console.log(`Admin login: admin@perkin.co.th / ${defaultPassword}`);
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
