# Perkin FreightRate - Register of Open Questions & TBD Decisions
**Version:** 2.0  
**Status:** DRAFT (Awaiting Formal Confirmation from Perkin Logistics Management)  
**System:** Perkin FreightRate - Logistics Automation Platform

---

## 1. Overview of Open Questions & Default Assumptions

In accordance with Section 2 (Rule 10) of the Master Prompt: **"Do not assume undocumented business rules. Mark every assumption and every open item as TBD (awaiting company data). Do not invent business data."**

This document consolidates every unconfirmed business rule, missing reference data set, and financial threshold. For every item, a **Safe Default Behavior** has been specified in code to ensure development can proceed without risking commercial integrity.

---

## 2. Priority Register of TBD Items

| Ref # | Category | Topic & Description | Impact on System | Safe Default Implemented Until Decided |
|---|---|---|---|---|
| **TBD-01** | Comparison | **Comparison Subjects & Total Cost Definition (Partially Answered):**<br/>Sample CSV received (29 items across Delta, MSL, Air) confirming unified row structure (`WHT`, `VAT`, `Amount_THB`, `Amount_USD`) and 5 charge groups. Need confirmation if additional templates exist (e.g., Air Freight / Export / LCL). | Dynamic `charge_catalog` & comparison matrix layout | Seeded with the 29 confirmed sea-import subjects across 5 groups (`Ocean`, `Origin_Local`, `Dest_Port`, `TH_Local_Transport`, `Insurance_Misc`), plus dynamic addition of unmapped items. |
| **TBD-02** | Comparison | **Charge Units & Conversion Rules (Partially Answered):**<br/>Sample CSV confirms `Per Container`, `Per HBL`, `Per HAWB`, `Per Day (min days)`, `Per Hour (free hrs + overtime)`. Confirm conversion rules for time/usage-based charges (`Chassis rental min 2 days`, `Live load 2 hrs free`). | Automated comparison totals & validation guards | `charge_units` seeded with confirmed units. Time/overtime charges accept manual estimated quantity or unit count during verification. |
| **TBD-03** | AI Extraction | **Rate Document Samples:**<br/>Need 5 to 10 masked representative samples of LINE screenshots, carrier PDFs, and text quotes from main shipping lines. | AI extraction prompt tuning, golden test fixtures, and accuracy benchmarks | AI extraction schema handles arbitrary line items; golden tests use synthetic mock samples. |
| **TBD-04** | Finance | **Exchange Rate Policy & THB Rounding Rule:**<br/>In the sample CSV, USD $\rightarrow$ THB conversion appears around `33.00 THB/USD` with upward rounding to nearest 100 THB (e.g., `$151.89` $\rightarrow$ `5,100 THB`, `$2,295` $\rightarrow$ `75,800 THB`). Confirm official FX source and whether rounding to nearest 100 THB is a standard rule. | Multi-currency comparison & pricing calculation | Editable `exchange_rates` table + configurable `fx_rounding_rule` (`EXACT`, `CEIL_100_THB`, `ROUND_10_THB`). Default: `EXACT` until confirmed. |
| **TBD-05** | Governance | **Approval Thresholds & Auto-Markup (Clarified):**<br/>Confirmed: Do **not** auto-add default markup or enforce a `10%` margin approval block yet — **Sales staff manually enter their own markup/selling price**. Confirm later if/when Manager approval thresholds should be turned on. | `pricing_rules` and maker-checker validation | `require_margin_approval = false`, `min_gross_margin_percent = null`, `min_markup_percent = null` (no auto-markup, no forced approval gate). Configurable in Settings anytime. |
| **TBD-06** | Finance | **WHT & VAT Treatment per Charge Category:**<br/>Sample CSV shows `WHT = 55.0` (1% on `1x40 TRANSPORTATION CHARGE` 5,500 THB) while `1x20 TRANSPORTATION CHARGE` had blank WHT. Confirm WHT rates (1% transport, 3% service) and VAT rules (0% vs 7%) per charge, and whether WHT is included in selling cost basis or tracked purely as tax cashflow. | `charge_catalog` default tax flags, cost total & selling rate calculator | Track `WHT` and `VAT` as explicit columns per line item (`default_wht_percent`, `default_vat_percent`). WHT is summed in `Total WHT` separately from `Total Cost THB` (matching the CSV!). |
| **TBD-07** | Commercial | **Quotation Document Template & Numbering:**<br/>Official Perkin Logistics logo, letterhead layout, bank account details, quotation numbering sequence format, standard terms & conditions. | `@react-pdf/renderer` template design | Numbering format `PK-QT-YYYYMM-XXXX`. Clean corporate template with placeholder branding and standard logistics liability clauses. |
| **TBD-08** | Commercial | **Expired Rate Handling & Quotation Expiry:**<br/>If a supplier rate expires before a customer accepts, should the system strictly block quotation generation or only display a prominent warning? | Transition guards & cascade invalidation | Strict Block by default. Cannot quote using expired rates. Manual quotation expiry with automated reminder badges. |
| **TBD-09** | Commercial | **Partial Acceptance & Multi-Option Quotes:**<br/>Can a customer accept partial line items from a quotation? Can one shipment inquiry maintain multiple active conflicting quotations? | Quotation versioning & booking conversion | Whole-quotation acceptance only by default. Exactly one active quotation per shipment. Partial acceptance creates Revision vN+1. |
| **TBD-10** | Localization | **Default UI Language & Core Routes:**<br/>Preferred primary language for UI (Thai or English)? What are the top 10 origin/destination ports and ocean carriers for initial seeding? | UI localization (`next-intl`) and seed data | English UI with bilingual Thai/English customer quotation PDF. Seeded with major Thai ports (`THBKK`, `THLCH`) and Asian/US trade hubs. |
| **TBD-11** | Comparison | **Mix-and-Match Multi-Supplier Selection (Split Buying):**<br/>In the sample CSV, Delta quoted Ocean Freight without US Pickup, while MSL quoted US Pickup without Ocean Freight. Does Perkin ever select **Supplier A for Ocean Freight + Supplier B for Origin Pickup/Local** in one shipment, or must one supplier cover the whole job? | Comparison selection model & booking handover | Currently 1 winning supplier per comparison (MVP). Architecture keeps `rate_charges` modular so per-section supplier selection can be enabled if required. |

---

## 3. Recommended Actions & Information Request to Client

To finalize the system configuration, please provide:
1. **Existing Comparison Spreadsheets:** 2 or 3 anonymized Excel worksheets currently used by Sales Co. to compare freight rates.
2. **Quotation Samples:** 1 official Perkin Logistics quotation PDF sent to a client (pricing masked).
3. **Approved Approvers List:** Staff names and email addresses mapped to roles (`Sales Co.`, `Sales Manager`, `Management`).
4. **Accounting Tax Memo:** Brief confirmation from accounting regarding VAT handling for ocean freight vs. local handling charges.
