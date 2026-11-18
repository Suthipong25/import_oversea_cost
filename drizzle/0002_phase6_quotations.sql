-- Perkin FreightRate — Migration 0002: Phase 6 Isolated Customer Quotation Domain
-- CONFIDENTIALITY BY DESIGN:
-- quotation_items has ZERO foreign keys or columns referencing supplier/agent costs, markup, margin, or gross profit.

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  selling_rate_id UUID NOT NULL REFERENCES selling_rates(id),
  quotation_number TEXT NOT NULL UNIQUE,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Approved', 'Sent', 'Waiting_for_Customer', 'Accepted', 'Rejected', 'Revision_Requested', 'Expired', 'Cancelled')),
  customer_name TEXT NOT NULL,
  customer_contact TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  pol_port_code TEXT NOT NULL,
  pod_port_code TEXT NOT NULL,
  container_summary TEXT NOT NULL,
  commodity_description TEXT,
  transit_time_text TEXT,
  free_time_text TEXT,
  service_type TEXT NOT NULL DEFAULT 'CY/CY',
  payment_terms TEXT NOT NULL DEFAULT 'Credit 30 Days',
  valid_until DATE NOT NULL,
  terms_and_conditions TEXT,
  remarks TEXT,
  assigned_sales_rep_id UUID NOT NULL REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  sent_channel TEXT CHECK (sent_channel IS NULL OR sent_channel IN ('EMAIL', 'LINE', 'HAND_DELIVERY', 'OTHER')),
  sent_recipient TEXT,
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotations_shipment ON quotations(shipment_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);

CREATE TABLE IF NOT EXISTS quotation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Approved', 'Sent', 'Superseded', 'Accepted', 'Rejected', 'Expired', 'Cancelled')),
  subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  discount_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 7.00,
  vat_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  grand_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  currency TEXT NOT NULL DEFAULT 'THB',
  snapshot_payload JSONB NOT NULL,
  change_summary TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_quotation_version_num UNIQUE (quotation_id, version_number)
);

-- STRICTLY CUSTOMER-FACING TABLE: No supplier, no buying cost, no markup, no margin, no profit!
CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_version_id UUID NOT NULL REFERENCES quotation_versions(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL DEFAULT 1,
  description_en TEXT NOT NULL,
  description_th TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1.00,
  charge_unit_text TEXT NOT NULL DEFAULT 'Per Shipment',
  unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  currency TEXT NOT NULL DEFAULT 'THB',
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotation_items_ver ON quotation_items(quotation_version_id, item_order);
