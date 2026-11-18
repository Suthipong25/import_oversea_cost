# Perkin FreightRate — Import Oversea Cost & Quotation System

ระบบเปรียบเทียบต้นทุน Agent นำเข้า (FCL & LCL), ขออนุมัติราคาขาย (Sale Price Approve Request), และออกใบเสนอราคาลูกค้า (Customer Quotation PDF) สำหรับ **Perkin Logistics (Thailand) Co., Ltd.**

- **Production URL:** https://importoverseacost.vercel.app/shipments

---

## ภาพรวมการทำงาน (3-Step Workflow)

0. **รายการ Cost Agent (`/shipments`)**
   - จัดเก็บใบราคาต้นทุนจาก Agent ทั้งงานตู้ **FCL** และ **LCL**
   - รองรับการเพิ่มข้อมูลได้ทั้ง **วางรูปภาพ (`Ctrl+V`)**, อัปโหลด **PDF / รูปภาพ**, วางข้อความแชท **LINE / Email**, หรือกรอกเอง
   - ดูรายละเอียด แก้ไขรายการ แปลงสกุลเงิน USD → THB และติ๊กเลือก 2–5 Agent เพื่อเข้าสู่หน้าเปรียบเทียบ
   - แท็บ **ประวัติงาน** ติดตามสถานะครบทั้ง 3 ขั้นตอน (`① Compare → ② Approve → ③ Quotation`) พร้อมตัวกรองงานที่เสร็จครบ 3/3

1. **① Compare Cost (`/shipments/[id]`)**
   - เปรียบเทียบต้นทุนแบบ **1 ตารางต่อ 1 Agent** (`WHT | VAT | THB | USD` + `TOTAL`) ปรับความสูงและแถวยอดรวมตรงกันทุกการ์ด
   - อัตราแลกเปลี่ยน **USD → THB แบบ Real-time** พร้อมปุ่มแปลงสกุลเงิน (ปัดขึ้นหลักร้อย `CEIL_100` หรือแม่นยำ `EXACT`)
   - ตรวจสอบความครบถ้วนของหมวดค่าใช้จ่าย (Scope Check), Export **CSV** และ **PDF (A4 Landscape)**
   - เลือก Winning Agent เพื่อส่งต่อไปยังขั้นตอนที่ ②

2. **② Sale Price Approve Request (`/shipments/[id]/selling-rate`)**
   - ฟอร์มตรงตามเอกสาร `SEA FREIGHT IMPORT` ของ Perkin พร้อมโลโก้บริษัทและช่องแก้ไขข้อมูลงานครบทุกฟิลด์
   - ตาราง 10 คอลัมน์ (`DETAIL (WHT&VAT) | COST (5 cols) | REVENUE (4 cols)`) คำนวณ `TOTAL REVENUE`, `TOTAL COST`, `DIFF ADVANCE`, `GROSS PROFIT` ด้วย `decimal.js`
   - ตรวจสอบเกณฑ์กำไรขั้นต่ำอัตโนมัติ (**CONDITION:** `GP >= 5,000 THB/JOB` และ `GP >= 25%`)
   - รองรับสถานะ Draft → Pending Approval → Approved / Returned พร้อม **Export PDF (A4 Portrait)**

3. **③ Customer Quotation PDF (`/shipments/[id]/quotation`)**
   - ฟอร์มใบเสนอราคาลูกค้าเลขที่อัตโนมัติ `YYYY.MMDDXXX` (ป้องกันเลขชนกันด้วย PostgreSQL Advisory Lock)
   - แยกข้อมูลฝั่งลูกค้าออกจากต้นทุน Agent / กำไร / Margin 100% (`Confidentiality Protected`)
   - แสดง **Live PDF Preview** รองรับภาษาไทย/อังกฤษ, รวมหมวด 4 บรรทัดอัตโนมัติ, บันทึกการส่ง (`Mark as Sent`) และสร้าง Revision (`v2`, `v3`, ...)

---

## Tech Stack (เทคโนโลยีที่ใช้พัฒนา)

| หมวดหมู่ | เทคโนโลยี / ไลบรารี | รายละเอียดการใช้งาน |
|---|---|---|
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/) | Full-stack SSR, Server Components, Route Handlers (API) |
| **Language** | [TypeScript 5.7](https://www.typescriptlang.org/) | End-to-end type safety |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) | Design tokens, WCAG 2.2 AA accessibility, responsive UI |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [Drizzle ORM 0.41](https://orm.drizzle.team/), `pg` | Relational schema (`numeric(18,4)`), RLS context (`withUserContext`), SQL migrations |
| **AI & Extraction** | Google **Gemini API** (`gemini-3.6-flash` + fallback chain), [Vercel AI SDK (`ai`, `@ai-sdk/google`)](https://sdk.vercel.ai/), [`unpdf`](https://github.com/unjs/unpdf) | ดึงรายการค่าใช้จ่ายอัตโนมัติจากรูปภาพ, PDF และแชท พร้อมตัวสำรองแบบ Deterministic |
| **PDF Generation** | [`@react-pdf/renderer`](https://react-pdf.org/) + ฟอนต์ **Sarabun** | สร้างเอกสาร PDF A4 ทั้ง 3 รูปแบบฝั่งเซิร์ฟเวอร์ (Compare Cost, Approve Request, Quotation) |
| **Financial Math** | [`decimal.js`](https://mikemcl.github.io/decimal.js/) | คำนวณการเงิน WHT / VAT / FX / Gross Profit แบบไม่มี floating-point error |
| **Real-Time FX** | Yahoo Finance (`THB=X`) + ExchangeRate-API + Frankfurter + DB Fallback | อัตราแลกเปลี่ยน USD → THB อัปเดตอัตโนมัติทุก 60 วินาที พร้อมแคชฝั่งเซิร์ฟเวอร์ |
| **Validation & Security** | [Zod](https://zod.dev/), RBAC, Magic-Byte File Validation, Audit Logs | ตรวจสอบอินพุตทุก API, ตรวจสอบประเภทไฟล์จาก Magic Bytes และบันทึก Audit Trail |
| **Testing** | [Vitest 3](https://vitest.dev/), ESLint 9 | Unit tests ครอบคลุม Pricing, Comparison, Confidentiality, Auth/RBAC, AI Extraction, Storage |
| **Hosting & Cloud DB** | [Vercel](https://vercel.com/) + [Neon Serverless Postgres](https://neon.tech/) (Singapore `sin1`) | Production hosting และ Cloud PostgreSQL |

---

## โครงสร้างโปรเจกต์

```text
├── drizzle/                    # SQL Migrations (0000 - 0004)
├── public/                     # โลโก้บริษัท (perkin-logo.jpg) และไฟล์ฟอนต์ Sarabun
├── src/
│   ├── app/
│   │   ├── (dashboard)/        # หน้าหลัก: /shipments, /suppliers, /settings/subjects
│   │   └── api/                # REST API Routes (agent-costs, shipments, rates, selling-rates, quotations, fx)
│   ├── components/             # Client Components (Compare Cost, Approve Request, Quotation, LiveFxBadge)
│   ├── domain/                 # Pure business logic (pricing calculator, comparison scope, workflow guards)
│   ├── lib/                    # AI extraction, DB/Drizzle, Auth/RBAC, PDF templates, Live FX, File storage
│   └── modules/                # Feature services & repositories
└── tests/unit/                 # Vitest unit test suites
```

---

## Environment Variables

คัดลอก `.env.example` เป็น `.env.local` สำหรับรันในเครื่อง หรือตั้งค่าใน Vercel Project Settings:

| Variable | Required | ตัวอย่าง / คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | จำเป็น | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `APP_SECRET` | จำเป็น | คีย์สุ่มความยาวอย่างน้อย 32 ตัวอักษรสำหรับเซ็น session & signed document URLs |
| `STORAGE_ROOT` | แนะนำ | `./storage` (รันในเครื่อง) หรือ `/tmp/storage` (บน Vercel) |
| `GEMINI_API_KEY` | แนะนำ | Google Gemini API key สำหรับ AI อ่านใบราคาจากรูปภาพ/PDF |
| `GEMINI_MODEL` | ไม่บังคับ | ค่าเริ่มต้น `gemini-3.6-flash` |
| `REQUIRE_AUTH` | ไม่บังคับ | `true` บังคับหน้า Login / `false` เข้าใช้งานภายในได้ทันที |
| `SEED_DEFAULT_PASSWORD` | ไม่บังคับ | รหัสผ่านตั้งต้นสำหรับบัญชีทดสอบตอนรัน `db:seed` |

---

## การติดตั้งและรันในเครื่อง (Local Development)

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. ตั้งค่า Environment Variables ใน .env.local
cp .env.example .env.local

# 3. รัน Database Migrations และ Seed ข้อมูลเริ่มต้น (38 หัวข้อ + 4 Roles)
npm run db:migrate
npm run db:seed

# (ทางเลือก) เพิ่มข้อมูลตัวอย่าง Cost Agent 3 เจ้า (COST Delta, COST msl, COST air)
npx tsx src/lib/db/seed-demo-costs.ts

# 4. รัน Development Server
npm run dev
```

เปิดใช้งานที่ `http://localhost:3000`

### คำสั่งตรวจสอบคุณภาพโค้ด

```bash
npm run typecheck   # ตรวจสอบ TypeScript (tsc --noEmit)
npm test            # รัน Unit Tests ทั้งหมด (Vitest)
npm run lint        # ตรวจสอบ ESLint
npm run build       # ทดสอบ Production Build
```

---

## การ Deploy บน Vercel + Neon Postgres

1. Import Repository เข้าสู่ **Vercel** (Framework Preset: `Next.js`)
2. เพิ่ม **Neon Serverless Postgres** ผ่านแท็บ **Storage** ของโปรเจกต์เพื่อเชื่อมต่อ `DATABASE_URL` อัตโนมัติ
3. ตั้งค่า Environment Variables (`APP_SECRET`, `STORAGE_ROOT=/tmp/storage`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.6-flash`, `REQUIRE_AUTH`)
4. รัน `npm run db:migrate` และ `npm run db:seed` ไปยัง Neon `DATABASE_URL` แล้วกด **Redeploy**
