-- Phase 7: Perkin Real Document Form Fields (② Sale Price Approve Request + ③ Quotation)
-- Minimal, additive JSONB + numeric columns matching Perkin Logistics' actual paper forms.

ALTER TABLE selling_rates
  ADD COLUMN IF NOT EXISTS document_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE selling_rate_charges
  ADD COLUMN IF NOT EXISTS cost_wht_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS cost_vat_thb NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS cost_amount_usd NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS cost_foreign_curr_usd NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS revenue_wht_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS revenue_amount_usd NUMERIC(18, 4);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS document_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
