# Perkin FreightRate - API Specification & Interface Contracts
**Version:** 2.0  
**Status:** DRAFT (Awaiting Company Data for TBD Items)  
**Protocol:** HTTPS RESTful JSON / Next.js Server Actions  
**Auth:** Supabase Cookie Session (`Bearer / Cookie`)  
**Validation:** Zod 3.x Enforced on all inputs

---

## 1. Global API Conventions

### 1.1 Response Envelope Structure
All API responses follow a strict, unified envelope format:

#### Success Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 85,
    "total_pages": 5
  }
}
```

#### Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more input fields are invalid.",
    "details": [
      {
        "field": "valid_to",
        "issue": "valid_to date cannot be earlier than valid_from date"
      }
    ],
    "timestamp": "2026-11-18T00:55:00.000Z"
  }
}
```

### 1.2 Standard Error Codes
| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication session |
| `FORBIDDEN` | 403 | Insufficient RBAC role permissions |
| `NOT_FOUND` | 404 | Resource not found or inaccessible |
| `VALIDATION_FAILED` | 422 | Zod schema validation error |
| `INVALID_STATE_TRANSITION` | 409 | Entity state machine guard rejected transition |
| `CONFIDENTIALITY_VIOLATION`| 500 | Architecture safety guard prevented internal cost leak |
| `MAKER_CHECKER_BLOCKED` | 403 | Creator cannot approve their own financial record |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled system exception |

---

## 2. API Endpoints Catalog

### 2.1 Identity & Session
#### `GET /api/auth/me`
- **Description:** Returns profile, role, and permission tokens for authenticated staff.
- **Permissions:** Authenticated User
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": "c6a2b8e3-8fa9-4b2e-a342-6e279b90875b",
      "email": "somchai.s@perkin.co.th",
      "full_name": "Somchai Saetang",
      "role": "sales_co",
      "permissions": [
        "rates:create",
        "rates:verify",
        "comparisons:execute",
        "selling_rates:create",
        "quotations:send",
        "bookings:create"
      ]
    }
  }
  ```

---

### 2.2 Shipment Management
#### `GET /api/shipments`
- **Description:** Filterable, paginated list of shipment opportunities.
- **Query Params:**
  - `page`: integer (default 1)
  - `limit`: integer (default 20, max 100)
  - `search`: string (matches `shipment_ref`, `customer_name`)
  - `status`: string (derived status filter)
  - `assigned_to`: uuid
  - `sort_by`: string (`created_at`, `target_etd`)
  - `sort_order`: `'asc'` | `'desc'`

#### `POST /api/shipments`
- **Description:** Initializes a new shipment opportunity.
- **Permissions:** `sales_co`, `sales_manager`, `admin`
- **Request Body (Zod Validated):**
  ```json
  {
    "customer_name": "Siam Tyre Manufacturing Co., Ltd.",
    "contact_person": "K. Anan",
    "contact_phone": "+66-81-234-5678",
    "contact_email": "anan@siamtyre.com",
    "pol_port_code": "THLCH",
    "pod_port_code": "CNSHA",
    "container_type": "40HQ",
    "quantity": 2,
    "commodity_description": "Radial Automotive Tyres",
    "target_etd": "2026-12-05"
  }
  ```

---

### 2.3 M1 Rate Document Ingestion
#### `POST /api/shipments/:id/documents`
- **Description:** Ingests rate documents (multipart/form-data for files, or JSON for pasted text). Dispatches extraction job.
- **Permissions:** `sales_co`, `sales_manager`, `admin`
- **Request Payload:**
  - `file`: Binary (PDF, PNG, JPG $\le 20\text{MB}$) OR `pasted_text`: String ($\le 50,000$ chars)
  - `supplier_id`: UUID (optional if identified upfront)
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "document_id": "8f8b3c91-2a1d-44a6-9812-78d10b7b1209",
      "file_name": "OOCL_Quotation_CNSHA_THLCH.pdf",
      "extraction_job_id": "5f643209-17ef-417b-84e5-9c9f22037bb2",
      "status": "Processing"
    }
  }
  ```

#### `GET /api/documents/:id/signed-url`
- **Description:** Generates a short-lived (15-minute) signed URL for the split-screen PDF/image preview.
- **Permissions:** Assigned Sales Co., Sales Manager, Admin
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "signed_url": "https://xyz.supabase.co/storage/v1/object/sign/rates/2026/11/abc.pdf?token=...",
      "expires_in_seconds": 900
    }
  }
  ```

---

### 2.4 M2 AI Extraction & Verification
#### `GET /api/rates/:id/extraction-draft`
- **Description:** Fetches the raw AI extraction alongside catalog alias mappings for split-screen verification.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "rate_record_id": "7d9b32fa-10bb-4ce7-bb91-536f981e7d01",
      "source_document_id": "8f8b3c91-2a1d-44a6-9812-78d10b7b1209",
      "metadata": {
        "supplier_name": "OOCL Thailand",
        "shipping_line": "Orient Overseas Container Line",
        "pol_port_code": "CNSHA",
        "pod_port_code": "THLCH",
        "container_type": "40HQ",
        "valid_to": "2026-11-30",
        "transit_time_days": 6,
        "free_time_demurrage_days": 14
      },
      "charges": [
        {
          "id": "e81d764a-2f08-410c-99c5-a6e4d41eb31a",
          "raw_charge_name": "Basic Ocean Freight",
          "matched_catalog_code": "OFR",
          "category": "Ocean",
          "amount": "1250.0000",
          "currency": "USD",
          "charge_unit": "PER_CONTAINER",
          "confidence_score": 0.98,
          "source_page": 1,
          "source_text_snippet": "Basic Ocean Freight: USD 1,250 / 40'HQ"
        },
        {
          "id": "a92c10b4-3d19-482a-bc91-d820f182c199",
          "raw_charge_name": "Port Security Surcharge",
          "matched_catalog_code": null,
          "category": "Other",
          "amount": "25.0000",
          "currency": "USD",
          "charge_unit": "PER_CONTAINER",
          "confidence_score": 0.72,
          "is_unmapped": true
        }
      ]
    }
  }
  ```

#### `PUT /api/rates/:id/verify`
- **Description:** Human staff submits verified rate data, resolving charge mappings.
- **Permissions:** Assigned Sales Co., Sales Manager, Admin
- **Request Body (Zod Validated):**
  ```json
  {
    "supplier_id": "99b78a10-23ce-4e1b-b461-1200ab9388fc",
    "shipping_line_name": "OOCL",
    "rate_ref": "QT-SHA-BKK-0988",
    "valid_from": "2026-11-01",
    "valid_to": "2026-11-30",
    "transit_time_days": 6,
    "free_time_demurrage_days": 14,
    "charges": [
      {
        "charge_catalog_id": "5512b912-3211-47bb-a901-7162bca98101",
        "raw_charge_name": "Basic Ocean Freight",
        "category": "Ocean",
        "amount": "1250.0000",
        "currency": "USD",
        "charge_unit": "PER_CONTAINER",
        "is_included": false
      },
      {
        "charge_catalog_id": "6623c023-4322-48cc-b012-8273cdb09212",
        "raw_charge_name": "Port Security Surcharge",
        "category": "Surcharge",
        "amount": "25.0000",
        "currency": "USD",
        "charge_unit": "PER_CONTAINER",
        "save_alias": true
      }
    ]
  }
  ```
- **Response:** `{ "success": true, "data": { "verification_status": "Verified" } }`

---

### 2.5 M3 Cost Comparison Engine
#### `POST /api/shipments/:id/comparisons`
- **Description:** Generates a side-by-side comparison for 2 to 5 verified rate records.
- **Request Body:**
  ```json
  {
    "rate_record_ids": [
      "7d9b32fa-10bb-4ce7-bb91-536f981e7d01",
      "9f1b44eb-21cc-4df8-cc92-647fa92e8e02",
      "b02c55fc-32dd-4ef9-dd03-758ab03f9f03"
    ]
  }
  ```

#### `POST /api/comparisons/:id/select-supplier`
- **Description:** Human explicitly selects the commercial supplier cost basis.
- **Request Body:**
  ```json
  {
    "selected_rate_record_id": "7d9b32fa-10bb-4ce7-bb91-536f981e7d01",
    "selection_reason": "Fastest transit time (6 days) and 14 days demurrage free time"
  }
  ```

---

### 2.6 M4 Selling Rate Calculator
#### `PUT /api/selling-rates/:id`
- **Description:** Updates pricing parameters and recalculates margins deterministically.
- **Request Body:**
  ```json
  {
    "currency": "THB",
    "markup_type": "PERCENTAGE",
    "markup_value": "15.0000",
    "discount_amount": "0.0000",
    "vat_percent": "7.00",
    "additional_internal_costs": [
      {
        "description": "Port Customs Clearance Coordination",
        "amount": "1500.0000",
        "currency": "THB"
      }
    ]
  }
  ```
- **Response Data:**
  ```json
  {
    "base_cost_amount": "88500.0000",
    "total_selling_price": "103275.0000",
    "gross_profit": "13275.0000",
    "markup_percent": "15.0000",
    "gross_margin_percent": "12.8535",
    "vat_amount": "7229.2500",
    "grand_total_selling": "110504.2500",
    "requires_manager_approval": false,
    "status": "Approved"
  }
  ```

#### `POST /api/selling-rates/:id/approve`
- **Description:** Sales Manager signs off on sub-threshold selling rates.
- **Permissions:** `sales_manager`, `management`, `admin`
- **Maker-Checker Rule:** Blocked if `actor_id == selling_rate.created_by`.

---

### 2.7 M5 Quotation & Customer PDF
#### `POST /api/selling-rates/:id/quotations`
- **Description:** Transforms approved selling rate into customer-facing quotation v1.
- **Request Body:**
  ```json
  {
    "customer_name": "Siam Tyre Manufacturing Co., Ltd.",
    "customer_contact": "K. Anan",
    "customer_email": "anan@siamtyre.com",
    "valid_until": "2026-11-30",
    "terms_and_conditions": "1. Rates subject to port storage after 14 free days.\n2. Payment terms 30 days."
  }
  ```

#### `GET /api/quotations/:id/pdf`
- **Description:** Streams the customer-facing bilingual PDF rendered via `@react-pdf/renderer`.
- **Confidentiality Check:** Fails immediately if internal cost or supplier tables are joined.
- **Headers:** `Content-Type: application/pdf`, `Content-Disposition: inline; filename="PK-QT-202611-0001-v1.pdf"`

#### `POST /api/quotations/:id/send`
- **Description:** Records manual transmission of the quotation to the customer.
- **Request Body:**
  ```json
  {
    "sent_channel": "EMAIL",
    "recipient_email": "anan@siamtyre.com",
    "notes": "Sent official quotation v1 with company profile"
  }
  ```

#### `POST /api/quotations/:id/revisions`
- **Description:** Creates `Version N+1` for counter-offers, marking old version as `Superseded`.

---

### 2.8 M6 Customer Acceptance & M7 Booking Handover
#### `POST /api/quotations/:id/acceptance`
- **Description:** Records customer acceptance with verification of the exact version accepted.
- **Request Body:**
  ```json
  {
    "quotation_version_id": "5b4c10a2-19de-4f7b-9912-3482cd981a01",
    "decision": "Accepted",
    "decision_date": "2026-11-20",
    "customer_signer_name": "K. Anan",
    "customer_po_number": "PO-STM-2026-089",
    "proof_attachment_path": "proofs/2026/11/po-stm-089.pdf"
  }
  ```

#### `POST /api/quotations/:id/book`
- **Description:** Converts accepted quotation into an internal booking record.
- **Request Body:**
  ```json
  {
    "carrier_booking_ref": "OOCL-BK-991283",
    "shipping_line_name": "OOCL",
    "vessel_name": "OOCL BANGKOK",
    "voyage_number": "V.042N",
    "etd": "2026-12-05",
    "eta": "2026-12-11",
    "cargo_closing_date": "2026-12-03T17:00:00.000Z",
    "operational_notes": "Shipper requires origin fumigation certificate."
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "booking_id": "11ab22cd-33ef-44ab-55cd-66ef77ab88cd",
      "booking_number": "PK-BK-202611-0001",
      "status": "Created"
    }
  }
  ```
