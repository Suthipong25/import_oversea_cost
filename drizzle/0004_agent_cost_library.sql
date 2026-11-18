-- Phase 8: Standalone Cost Agent Library ("รายการ Cost Agent")
-- Allows saving Agent cost quotes independently (shipment_id IS NULL) for both FCL and LCL,
-- inspecting/editing them, and selecting 2-5 Agent costs to launch ① Compare Cost -> ② Approve -> ③ Quotation.

ALTER TABLE source_documents
  ALTER COLUMN shipment_id DROP NOT NULL;

ALTER TABLE rate_records
  ALTER COLUMN shipment_id DROP NOT NULL;

ALTER TABLE rate_records
  ADD COLUMN IF NOT EXISTS mode_type TEXT NOT NULL DEFAULT 'FCL',
  ADD COLUMN IF NOT EXISTS container_summary TEXT NOT NULL DEFAULT '1×40DV';

CREATE INDEX IF NOT EXISTS idx_rates_standalone
  ON rate_records (created_at DESC)
  WHERE shipment_id IS NULL;
