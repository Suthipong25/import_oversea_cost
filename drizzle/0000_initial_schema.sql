-- Perkin FreightRate — Migration 0000: Initial Core Schema (15 Tables)
-- Pure PostgreSQL 15+ (Compatible with Perkin On-Premise pgAdmin Server)
-- Money precision: numeric(18, 4) everywhere. No floating point for money.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sales_co' CHECK (role IN ('admin', 'sales_co', 'sales_manager', 'management')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 3. audit_logs (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  previous_state JSONB,
  new_state JSONB NOT NULL,
  reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);

-- Prevent UPDATE or DELETE on audit_logs (tamper-evident append-only guarantee)
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE and DELETE are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- 4. processing_jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('AI_EXTRACTION', 'DOCUMENT_PARSE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  result JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON processing_jobs(status, created_at);

-- 5. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  country_code TEXT NOT NULL DEFAULT 'TH',
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active, name);

-- 6. charge_catalog (data-driven Compare Cost subjects)
CREATE TABLE IF NOT EXISTS charge_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_th TEXT,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('Ocean', 'Origin_Local', 'Dest_Port', 'TH_Local_Transport', 'Insurance_Misc', 'Other')),
  is_section_header BOOLEAN NOT NULL DEFAULT false,
  default_wht_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  default_vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  is_baseline_candidate BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. charge_aliases
CREATE TABLE IF NOT EXISTS charge_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_catalog_id UUID REFERENCES charge_catalog(id) ON DELETE SET NULL,
  alias_pattern TEXT NOT NULL UNIQUE,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aliases_catalog ON charge_aliases(charge_catalog_id);

-- 8. exchange_rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL DEFAULT 'THB',
  rate NUMERIC(18, 4) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'Internal',
  effective_date DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fx_pair_date_source UNIQUE (from_currency, to_currency, effective_date, source)
);

-- 9. shipments
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_ref TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  pol_port_code TEXT NOT NULL,
  pod_port_code TEXT NOT NULL,
  incoterm TEXT,
  commodity_description TEXT,
  target_etd DATE,
  assigned_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_assigned ON shipments(assigned_user_id);

-- 10. shipment_containers (supports multi-container inquiries like 1x40 DV + 1x20 GP)
CREATE TABLE IF NOT EXISTS shipment_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  container_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg_per_cntr NUMERIC(12, 2),
  CONSTRAINT uq_shipment_container_type UNIQUE (shipment_id, container_type)
);

-- 11. source_documents
CREATE TABLE IF NOT EXISTS source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('IMAGE', 'PDF', 'PASTED_TEXT')),
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT,
  file_hash_sha256 TEXT NOT NULL,
  raw_text_content TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'Uploaded' CHECK (extraction_status IN ('Uploaded', 'Processing', 'Extracted', 'Failed')),
  extraction_error TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_shipment ON source_documents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_docs_hash ON source_documents(file_hash_sha256);

-- 12. rate_records
CREATE TABLE IF NOT EXISTS rate_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  source_document_id UUID REFERENCES source_documents(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  shipping_line_name TEXT,
  rate_ref TEXT,
  pol_port_code TEXT NOT NULL,
  pod_port_code TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'CY/CY',
  transit_time_days INTEGER,
  free_time_demurrage_days INTEGER,
  free_time_detention_days INTEGER,
  payment_terms TEXT NOT NULL DEFAULT 'Prepaid',
  valid_from DATE,
  valid_to DATE,
  verification_status TEXT NOT NULL DEFAULT 'Awaiting_Verification'
    CHECK (verification_status IN ('Awaiting_Verification', 'Verified', 'Rejected', 'Expired', 'Superseded')),
  raw_ai_output JSONB,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rates_shipment_status ON rate_records(shipment_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_rates_supplier ON rate_records(supplier_id);

-- 13. rate_charges (supports WHT, VAT, Amount THB, Amount USD, and 4 cell states)
CREATE TABLE IF NOT EXISTS rate_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_record_id UUID NOT NULL REFERENCES rate_records(id) ON DELETE CASCADE,
  charge_catalog_id UUID REFERENCES charge_catalog(id),
  raw_charge_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  container_type_ref TEXT,
  cell_status TEXT NOT NULL DEFAULT 'QUOTED' CHECK (cell_status IN ('QUOTED', 'NOT_APPLICABLE', 'INCLUDED', 'MISSING')),
  amount NUMERIC(18, 4),
  currency TEXT,
  amount_usd NUMERIC(18, 4),
  amount_thb NUMERIC(18, 4),
  fx_rate_used NUMERIC(18, 4),
  wht_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  wht_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  vat_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  charge_unit TEXT NOT NULL DEFAULT 'PER_SHIPMENT',
  is_included BOOLEAN NOT NULL DEFAULT false,
  is_excluded BOOLEAN NOT NULL DEFAULT false,
  source_page INTEGER,
  source_text_snippet TEXT,
  confidence_score NUMERIC(4, 3),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_charges_rate ON rate_charges(rate_record_id);
CREATE INDEX IF NOT EXISTS idx_rate_charges_catalog ON rate_charges(charge_catalog_id);

-- 14. cost_comparisons
CREATE TABLE IF NOT EXISTS cost_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Supplier_Selected', 'Needs_Review')),
  selected_rate_record_id UUID REFERENCES rate_records(id),
  selected_by UUID REFERENCES users(id),
  selected_at TIMESTAMPTZ,
  selection_reason TEXT,
  comparison_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comparisons_shipment ON cost_comparisons(shipment_id, is_active);

-- 15. cost_comparison_items
CREATE TABLE IF NOT EXISTS cost_comparison_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_comparison_id UUID NOT NULL REFERENCES cost_comparisons(id) ON DELETE CASCADE,
  rate_record_id UUID NOT NULL REFERENCES rate_records(id),
  is_selected BOOLEAN NOT NULL DEFAULT false,
  total_wht_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_vat_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_amount_thb NUMERIC(18, 4),
  total_amount_usd NUMERIC(18, 4),
  is_fully_comparable BOOLEAN NOT NULL DEFAULT false,
  scope_completeness_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparability_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_comparison_rate UNIQUE (cost_comparison_id, rate_record_id)
);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) FOR NON-SUPERUSER APPLICATION ROLES
-- ============================================================================
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipments_access_policy ON shipments;
CREATE POLICY shipments_access_policy ON shipments
  USING (
    current_setting('app.user_role', true) IN ('admin', 'sales_manager', 'management')
    OR assigned_user_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS rate_records_access_policy ON rate_records;
CREATE POLICY rate_records_access_policy ON rate_records
  USING (
    current_setting('app.user_role', true) IN ('admin', 'sales_manager', 'management')
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = rate_records.shipment_id
        AND s.assigned_user_id::text = current_setting('app.user_id', true)
    )
  );
