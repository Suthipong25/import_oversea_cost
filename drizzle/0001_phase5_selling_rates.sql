-- Perkin FreightRate — Migration 0001: Phase 5 Selling Rates & Sale Price Approve Request
-- Strict numeric(18, 4) precision for all financial columns.

CREATE TABLE IF NOT EXISTS selling_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  cost_comparison_id UUID NOT NULL REFERENCES cost_comparisons(id) ON DELETE CASCADE,
  selected_rate_record_id UUID NOT NULL REFERENCES rate_records(id),
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Pending_Approval', 'Approved', 'Returned', 'Needs_Review')),
  total_cost_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_selling_before_vat NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  discount_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  net_selling_excl_vat NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  gross_profit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  markup_percent NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  gross_margin_percent NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 7.00,
  vat_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  grand_total_selling NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  snapshot_data JSONB,
  request_notes TEXT,
  approval_requested_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_selling_rates_shipment ON selling_rates(shipment_id, is_active);

CREATE TABLE IF NOT EXISTS selling_rate_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selling_rate_id UUID NOT NULL REFERENCES selling_rates(id) ON DELETE CASCADE,
  charge_catalog_id UUID REFERENCES charge_catalog(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  cost_amount_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  selling_amount_thb NUMERIC(18, 4),
  charge_unit TEXT NOT NULL DEFAULT 'PER_SHIPMENT',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1.00,
  is_vat_applicable BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_selling_rate_charges_rate ON selling_rate_charges(selling_rate_id, display_order);

-- RLS Policy for internal confidential pricing tables
ALTER TABLE selling_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS selling_rates_access_policy ON selling_rates;
CREATE POLICY selling_rates_access_policy ON selling_rates
  USING (
    current_setting('app.user_role', true) IN ('admin', 'sales_manager', 'management')
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = selling_rates.shipment_id
        AND s.assigned_user_id::text = current_setting('app.user_id', true)
    )
  );
