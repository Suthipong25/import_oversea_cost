# Perkin FreightRate - Product Requirements Document (PRD)
**Version:** 2.0  
**Status:** DRAFT (Awaiting Company Data for TBD Items)  
**Client:** Perkin Logistics (Thailand) Co., Ltd.  
**System:** Perkin FreightRate - Internal Freight-Forwarding Quotation & Workflow Automation Platform

---

## 1. Product Overview & Purpose

Perkin FreightRate is an internal enterprise web application tailored for the Sales Co. (Sales Coordinator / Freight Forwarding Sales Operations) team at Perkin Logistics (Thailand) Co., Ltd.

### The Business Problem
Currently, freight quotation workflows suffer from severe operational friction:
- **Dispersed Rate Inputs:** Supplier and shipping line rates arrive via fragmented channels (LINE chat screenshots, email PDF attachments, WhatsApp messages, scanned rate sheets).
- **Manual Data Re-entry:** Staff manually re-type rates, charges, and port details into spreadsheets or isolated systems multiple times.
- **Error-Prone Comparison:** Comparing 2 to 5 suppliers involves mental or manual spreadsheet arithmetic across differing currencies (USD, THB, CNY, EUR), non-standard charge names (OFR vs Ocean Freight vs Basic Freight), and inconsistent charge units (Per Container, Per BL, Per CBM).
- **Pricing Calculation Mistakes:** Manual application of markups, margin percentages, and VAT can result in commercially damaging pricing errors or sub-cost quotes.
- **Risk of Internal Cost Leakage:** Generating customer quotations by copying from internal worksheets introduces the catastrophic risk of exposing supplier identities, internal cost breakdowns, and profit margins to customers.
- **Handover Friction:** Converting an accepted quotation into an operational booking requires re-typing the entire transaction, leading to discrepancies between what was quoted and what was booked.

### The Solution
Perkin FreightRate automates the end-to-end commercial lifecycle:
$$\text{Supplier/Agent Rate Ingestion} \rightarrow \text{AI Draft Extraction} \rightarrow \text{Human Verification} \rightarrow \text{Normalized Cost Comparison} \rightarrow \text{Governed Selling Rate Calculation} \rightarrow \text{Confidential Quotation PDF} \rightarrow \text{Acceptance Tracking} \rightarrow \text{Single-Click Booking Handover}$$

**It is an internal workflow automation platform, not a public rate comparison website.**

---

## 2. Stakeholders & User Personas

| Role | Primary Responsibilities | Core System Needs |
|---|---|---|
| **Sales Co. (Coordinator)** | Ingests supplier rates, verifies AI extractions, compares supplier options, computes selling prices, generates & sends quotations, records customer acceptance, creates booking records. | Fast split-screen verification, intuitive comparison matrix, automated margin math, single-click quotation PDF generation, zero re-keying into bookings. |
| **Sales Manager** | Reviews quotations and selling rates requiring commercial approval (low margin, high discount, below-cost), monitors sales team pipeline, maintains reference data. | Clear approval queue with maker-checker enforcement, margin visibility, audit trail of pricing decisions, configurable thresholds. |
| **Management / Executive** | Monitors corporate profitability, gross margins, conversion rates, and supplier competitiveness. | Executive dashboards, aggregated financial analytics, strict RBAC ensuring staff view only authorized commercial metrics. |
| **System Administrator** | Manages user accounts, configures roles and permissions, maintains dynamic reference data (`charge_catalog`, `charge_units`, `exchange_rates`, `pricing_rules`). | Comprehensive audit logs, reference data management screens, system health and processing job oversight. |

---

## 3. Non-Negotiable Business Rules

1. **Manual Rate Ingestion (No Carrier/Email Integration in MVP):** Staff supply rates manually via image uploads, PDF uploads, or pasted chat text.
2. **AI Extracts, Never Fabricates:** AI extracts structured data verbatim from source artifacts. Unknown values must be returned as `null`. AI output is strictly a provisional draft, never approved financial data.
3. **Mandatory Human Verification:** Extracted data cannot be used in comparisons or pricing calculations until verified and signed off by a human staff member.
4. **Human Supplier Choice (2 to 5 Suppliers):** The system compares 2 to 5 suppliers per opportunity. The system **never auto-selects** the lowest cost; supplier selection is an explicit human decision.
5. **No False Equivalencies or Silent Conversions:** Never compare different charge units or currencies as if they were identical. If a fair total cannot be computed, the comparison matrix must clearly mark the total as incomplete. No silent currency conversions.
6. **Strict Customer Data Confidentiality:** Customer-facing quotations and PDFs must **never** disclose supplier identity, internal costs, gross profit, margin %, markup %, or internal operational notes.
7. **Acceptance Prerequisite for Booking:** An internal booking record can **only** be created from an accepted quotation. Exactly one booking per accepted quotation (`UNIQUE(quotation_id)`).
8. **End-to-End Audit Traceability:** Every rate, surcharge, and condition must trace back directly to its source document, page number, and original extracted text snippet.
9. **Untrusted Uploads & Prompt Injection Defense:** Uploaded files and pasted text are untrusted user data. The system wraps them as data payloads, never follows embedded instructions, and validates all output with Zod.
10. **Zero Undocumented Assumptions:** All unconfirmed business rules, charge names, and thresholds are labeled as `TBD (awaiting company data)`. No business figures or rules are invented.

---

## 4. Scope & System Boundaries

### In-Scope (MVP)
- Centralized Shipment Workspace per customer opportunity.
- Multi-format rate ingestion: Images (PNG, JPG), PDFs (text-layer and scanned), and pasted chat text.
- AI-assisted extraction with split-screen human verification.
- Dynamic data-driven charge catalog, alias resolution, and unit conversion.
- 2 to 5 supplier side-by-side cost comparison with comparability guards.
- Selling rate calculator with decimal precision, markup/margin validation, and maker-checker approval workflows.
- Professional bilingual (Thai / English) customer quotation generation with `@react-pdf/renderer`.
- Quotation revision tracking with strict version immutability ($v1 \rightarrow v2 \rightarrow vN$).
- Customer acceptance recording with supporting proof attachments.
- One-click booking conversion preserving commercial and cost baselines.
- Executive KPI dashboard, workflow timeline, and role-based access control.

### Out-of-Scope (Explicit MVP Non-Goals)
- Direct carrier API integrations (e.g., INTTRA, Maersk API, ONE API).
- Direct email inbox scraping or automated email dispatching.
- Public customer portal or customer self-service logins.
- Electronic signature integrations (DocuSign, Adobe Sign).
- Operational freight execution (bill of lading issuance, customs clearance filings, GPS container tracking).
- Accounting ledger integration (SAP, QuickBooks, Express).

---

## 5. Functional Module Requirements

### M1. Supplier/Agent and Rate Input Center
- **Supplier Directory:** Manage freight forwarders, shipping lines, and overseas co-loaders.
  - Fields: `name`, `company_name`, `contact_person`, `phone`, `email` (stored for reference), `country_code`, `address`, `notes`, `is_active`.
- **Tri-Modal Input Interface:**
  1. *Image Ingestion:* Multi-image upload (drag-and-drop, file picker, clipboard paste `Ctrl+V`), image thumbnail preview, full-screen lightbox.
  2. *PDF Ingestion:* Text-layer PDFs and scanned raster PDFs, multi-page support, PDF preview canvas.
  3. *Raw Text / Chat Area:* Monospaced rich text area for pasting unstructured LINE, WhatsApp, WeChat, or email text snippets.
- **Ingestion Validation:** MIME type validation via magic bytes, SHA-256 hash generation for duplicate file detection.

### M2. AI Extraction and Verification Center
- **Extraction Targets:**
  - *Shipment Metadata:* POL (Port of Loading), POD (Port of Discharge), Place of Receipt, Place of Delivery, Container Type (20GP, 40GP, 40HQ, 45HQ, Reefer, Open Top, TBD), Quantity, Commodity Description, Service Type (CY/CY, CFS/CFS, Door/Door, TBD).
  - *Rate Charges:* Ocean Freight (O/F), BAF, CAF, PSS, GRI, Origin THC, Destination THC, Documentation Fee, Seal Fee, Handling, Customs Clearance, and Unmapped "Other" charges.
  - *Terms & Validity:* Currency (USD, THB, CNY, EUR, TBD), Amount, Charge Unit, Validity From/Until dates, Transit Time (days), Free Time (Demurrage / Detention days), Payment Terms (Prepaid / Collect), Included / Excluded charge notes.
- **Split-Screen Verification Workspace:**
  - *Left Pane:* High-fidelity source document viewer with zoom ($50\% - 300\%$), rotation, page pagination, and source text snippet bounding highlights.
  - *Right Pane:* Structured editable form organized by metadata, container details, charge items table, and terms.
  - *Visual Confidence & Conflict Badges:* Green (high confidence), Amber (low confidence / ambiguous), Red (missing mandatory field / conflicting dates).
  - *Charge Mapping Widget:* Disambiguation interface allowing staff to map uncataloged charges to standard catalog items or create new aliases.
- **Audit Persistence:** Stores both the raw, untouched AI extraction JSON and the human-edited, verified record with user ID and timestamp.

### M3. Cost Comparison Engine
- **Side-by-Side Matrix:** Select and compare 2 to 5 verified supplier rates for a given shipment opportunity.
- **Dynamic Subject Normalization:** Charges aligned dynamically by `charge_catalog_id`.
- **Comparability Engine & Guards:**
  - Base Freight Total: Computed only if charge units match.
  - Visual Badges: Green highlight on lowest comparable cost line; red/amber on highest or non-comparable lines.
  - Non-Comparable Section: Clearly segregates charges with mismatched units (e.g., Per Container vs Per BL vs Per CBM) or unmapped items.
  - Excluded Charges Warnings: Explicitly calls out terms like "THC Destination Excluded" or "Subject to GRI at actual".
- **Currency Handling:** Displays original quoting currency alongside converted reporting currency (THB/USD) using the active snapshot from `exchange_rates`.
- **Explicit Supplier Selection:** Staff must click "Select as Cost Basis" to advance to pricing. Zero automatic selection.

### M4. Selling Rate Calculator
- **Cost Importation:** Pulls verified cost items from the selected supplier.
- **Pricing Configuration:**
  - Additional internal costs (trucking, local handling, customs brokerage).
  - Markup application: Fixed amount per container/shipment OR Percentage markup.
  - Custom line-item selling rates.
  - Customer discount deduction (percentage or fixed).
  - Configurable VAT rate (default 7% TBD, toggleable per charge type).
- **Financial Metric Outputs (Decimal Precision):**
  $$\text{Selling Price} = \text{Cost} \times (1 + \text{Markup \%}) + \text{Additional Selling Charges} - \text{Discount}$$
  $$\text{Gross Profit (GP)} = \text{Selling Price (excl. VAT)} - \text{Total Cost (excl. VAT)}$$
  $$\text{Gross Margin \%} = \left(\frac{\text{Gross Profit}}{\text{Selling Price (excl. VAT)}}\right) \times 100$$
  $$\text{Markup \%} = \left(\frac{\text{Selling Price (excl. VAT)} - \text{Total Cost}}{\text{Total Cost}}\right) \times 100$$
- **Confidentiality:** Gross profit, markup %, and margin % are strictly restricted to authorized roles (Sales Co., Sales Manager, Management). Never exposed to customer payloads.
- **Snapshot Immutability:** Approving a selling rate locks a complete snapshot of input costs, exchange rates, and pricing formulas.

### M5. Customer Quotation Management
- **Quotation Header Details:** System-generated Quotation Number (format TBD: e.g., `PK-QT-YYYYMM-XXXX`), Quotation Date, Valid Until Date, Assigned Sales Rep, Customer Name, Contact Person, POL, POD, Commodity, Container Type & Quantity, Transit Time, Free Time, Payment Terms, Remarks.
- **Customer Line Items Table:**
  - Description (English and/or Thai).
  - Quantity & Unit (e.g., 2 x 40'HQ, 1 BL).
  - Unit Price & Line Amount.
  - Currency.
  - Subtotal, Applicable Discounts, VAT, Grand Total.
- **Strict Customer Isolation:** `quotation_items` table is physically isolated from internal cost records.
- **Bilingual PDF Generator:** Powered by `@react-pdf/renderer` with official Thai font support (Noto Sans Thai / Sarabun), Perkin Logistics branding, and configurable terms & conditions.
- **Transmission Logging:** Staff manually record quotation send date, recipient email/channel (LINE/Email/In-Person), and staff notes.
- **Revision Lifecycle:** Editing a sent quotation triggers "Create Revision", generating `Version N+1` and marking `Version N` as `Superseded`.

### M6. Customer Acceptance Center
- **Acceptance Recording:** Staff record customer commercial decision:
  - Status: `Accepted`, `Rejected`, or `Revision Requested`.
  - Confirmation of exact quotation version accepted.
  - Decision Date, Recording Staff ID, and Customer Feedback Notes.
  - Supporting Document Upload: Purchase Order (PO), signed quotation scan, or chat confirmation screenshot.
- **Commercial Validation:** Accepted quotations transition the opportunity into booking-ready status.

### M7. Internal Booking Conversion
- **One-Click Handover:** Transforms an `Accepted` quotation into an operational `Booking Record`.
- **Data Inheritance:** Automatically inherits Customer details, POL, POD, Container specs, Commodity, Shipping Line, Accepted Selling Price, and Verified Cost Basis.
- **Operational Data Ingestion:** Staff input Carrier Booking Number, Vessel / Voyage Name, Estimated Time of Departure (ETD), Estimated Time of Arrival (ETA), Closing Date, and Assigned Operations Staff.
- **Integrity Guard:** Strict database constraint `UNIQUE(quotation_id)` guarantees zero duplicate bookings for a single quotation.

### M8. Dashboard, Analytics & Workflow Timeline
- **Pipeline KPI Cards:** Active Quotations, Rates Awaiting Verification, Comparisons In-Progress, Quotations Pending Approval, Quotations Sent, Quotations Accepted, Bookings Created.
- **Analytical Charts:** Monthly Sales Revenue, Monthly Gross Profit (role-gated), Quotation Conversion Rate ($\% \text{ Accepted}$), Win/Loss by Route & Carrier.
- **Unified Shipment Timeline:** Visual audit log detailing every action on the opportunity:
  1. Rate document uploaded by User A at Timestamp.
  2. Rate extracted by AI (Model X) at Timestamp.
  3. Rate verified by User A at Timestamp.
  4. Comparison executed and Supplier B selected at Timestamp.
  5. Selling rate approved by Sales Manager at Timestamp.
  6. Quotation v1 generated and sent at Timestamp.
  7. Customer acceptance recorded with PO attachment at Timestamp.
  8. Booking PK-BK-202611-001 created at Timestamp.

---

## 6. Success Metrics & Key Performance Indicators (KPIs)

| Metric | Baseline (Manual) | Target (Perkin FreightRate) |
|---|---|---|
| **Rate Verification Time** | 15 - 25 minutes per document | $< 3$ minutes per document |
| **Quotation Turnaround Time** | 2 - 4 hours per customer inquiry | $< 15$ minutes end-to-end |
| **Calculation Error Rate** | Estimated 3 - 5% of manual quotes | $0\%$ (guaranteed by deterministic decimal engine) |
| **Accidental Cost Leakage** | Continuous human risk | **Zero Risk** (architectural table separation) |
| **Booking Re-keying Time** | 10 - 15 minutes per booking | $< 30$ seconds (automated conversion) |
