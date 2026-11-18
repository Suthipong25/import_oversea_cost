import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. IDENTITY, SESSIONS, AUDIT & JOBS (4 tables)
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('sales_co'), // 'admin' | 'sales_co' | 'sales_manager' | 'management'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sessions_user').on(table.userId)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state').notNull(),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_entity').on(table.entityType, table.entityId),
    index('idx_audit_actor').on(table.actorId),
    index('idx_audit_created_at').on(table.createdAt),
  ]
);

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobType: text('job_type').notNull(), // 'AI_EXTRACTION' | 'DOCUMENT_PARSE'
    status: text('status').notNull().default('PENDING'), // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    idempotencyKey: text('idempotency_key').notNull().unique(),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_jobs_status').on(table.status, table.createdAt)]
);

// ============================================================================
// 2. REFERENCE DATA (4 tables)
// ============================================================================

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    companyName: text('company_name').notNull(),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    email: text('email'),
    countryCode: text('country_code').notNull().default('TH'),
    address: text('address'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_suppliers_active').on(table.isActive, table.name)]
);

export const chargeCatalog = pgTable('charge_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameTh: text('name_th'),
  category: text('category').notNull().default('Other'), // 'Ocean' | 'Origin_Local' | 'Dest_Port' | 'TH_Local_Transport' | 'Insurance_Misc' | 'Other'
  isSectionHeader: boolean('is_section_header').notNull().default(false),
  defaultWhtPercent: numeric('default_wht_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
  defaultVatPercent: numeric('default_vat_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
  isBaselineCandidate: boolean('is_baseline_candidate').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(100),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chargeAliases = pgTable(
  'charge_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chargeCatalogId: uuid('charge_catalog_id').references(() => chargeCatalog.id, { onDelete: 'set null' }),
    aliasPattern: text('alias_pattern').notNull().unique(),
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_aliases_catalog').on(table.chargeCatalogId)]
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull().default('THB'),
    rate: numeric('rate', { precision: 18, scale: 4 }).notNull(),
    source: text('source').notNull().default('Internal'),
    effectiveDate: date('effective_date').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fx_pair_date_source').on(
      table.fromCurrency,
      table.toCurrency,
      table.effectiveDate,
      table.source
    ),
  ]
);

// ============================================================================
// 3. CORE WORKFLOW: SHIPMENTS, RATES & COMPARE COST (7 tables)
// ============================================================================

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentRef: text('shipment_ref').notNull().unique(),
    customerName: text('customer_name').notNull(),
    contactPerson: text('contact_person'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    polPortCode: text('pol_port_code').notNull(),
    podPortCode: text('pod_port_code').notNull(),
    incoterm: text('incoterm'),
    commodityDescription: text('commodity_description'),
    targetEtd: date('target_etd'),
    assignedUserId: uuid('assigned_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_shipments_assigned').on(table.assignedUserId)]
);

export const shipmentContainers = pgTable(
  'shipment_containers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    containerType: text('container_type').notNull(), // e.g., '40DV', '20GP', '40HQ'
    quantity: integer('quantity').notNull().default(1),
    weightKgPerCntr: numeric('weight_kg_per_cntr', { precision: 12, scale: 2 }),
  },
  (table) => [uniqueIndex('uq_shipment_container_type').on(table.shipmentId, table.containerType)]
);

export const sourceDocuments = pgTable(
  'source_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // 'IMAGE' | 'PDF' | 'PASTED_TEXT'
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size'),
    storagePath: text('storage_path'),
    fileHashSha256: text('file_hash_sha256').notNull(),
    rawTextContent: text('raw_text_content'),
    extractionStatus: text('extraction_status').notNull().default('Uploaded'), // 'Uploaded' | 'Processing' | 'Extracted' | 'Failed'
    extractionError: text('extraction_error'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_docs_shipment').on(table.shipmentId),
    index('idx_docs_hash').on(table.fileHashSha256),
  ]
);

export const rateRecords = pgTable(
  'rate_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }),
    sourceDocumentId: uuid('source_document_id').references(() => sourceDocuments.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    shippingLineName: text('shipping_line_name'),
    rateRef: text('rate_ref'),
    polPortCode: text('pol_port_code').notNull(),
    podPortCode: text('pod_port_code').notNull(),
    modeType: text('mode_type').notNull().default('FCL'),
    containerSummary: text('container_summary').notNull().default('1×40DV'),
    serviceType: text('service_type').notNull().default('CY/CY'),
    transitTimeDays: integer('transit_time_days'),
    freeTimeDemurrageDays: integer('free_time_demurrage_days'),
    freeTimeDetentionDays: integer('free_time_detention_days'),
    paymentTerms: text('payment_terms').notNull().default('Prepaid'),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    verificationStatus: text('verification_status').notNull().default('Awaiting_Verification'), // 'Awaiting_Verification' | 'Verified' | 'Rejected' | 'Expired' | 'Superseded'
    rawAiOutput: jsonb('raw_ai_output'),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rates_shipment_status').on(table.shipmentId, table.verificationStatus),
    index('idx_rates_supplier').on(table.supplierId),
  ]
);

export const rateCharges = pgTable(
  'rate_charges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rateRecordId: uuid('rate_record_id')
      .notNull()
      .references(() => rateRecords.id, { onDelete: 'cascade' }),
    chargeCatalogId: uuid('charge_catalog_id').references(() => chargeCatalog.id),
    rawChargeName: text('raw_charge_name').notNull(),
    category: text('category').notNull().default('Other'),
    containerTypeRef: text('container_type_ref'),
    cellStatus: text('cell_status').notNull().default('QUOTED'), // 'QUOTED' | 'NOT_APPLICABLE' | 'INCLUDED' | 'MISSING'
    amount: numeric('amount', { precision: 18, scale: 4 }),
    currency: text('currency'),
    amountUsd: numeric('amount_usd', { precision: 18, scale: 4 }),
    amountThb: numeric('amount_thb', { precision: 18, scale: 4 }),
    fxRateUsed: numeric('fx_rate_used', { precision: 18, scale: 4 }),
    whtPercent: numeric('wht_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
    whtAmount: numeric('wht_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    vatPercent: numeric('vat_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
    vatAmount: numeric('vat_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    chargeUnit: text('charge_unit').notNull().default('PER_SHIPMENT'),
    isIncluded: boolean('is_included').notNull().default(false),
    isExcluded: boolean('is_excluded').notNull().default(false),
    sourcePage: integer('source_page'),
    sourceTextSnippet: text('source_text_snippet'),
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 }),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_rate_charges_rate').on(table.rateRecordId),
    index('idx_rate_charges_catalog').on(table.chargeCatalogId),
  ]
);

export const costComparisons = pgTable(
  'cost_comparisons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('Open'), // 'Open' | 'Supplier_Selected' | 'Needs_Review'
    selectedRateRecordId: uuid('selected_rate_record_id').references(() => rateRecords.id),
    selectedBy: uuid('selected_by').references(() => users.id),
    selectedAt: timestamp('selected_at', { withTimezone: true }),
    selectionReason: text('selection_reason'),
    comparisonNotes: text('comparison_notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_comparisons_shipment').on(table.shipmentId, table.isActive)]
);

export const costComparisonItems = pgTable(
  'cost_comparison_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    costComparisonId: uuid('cost_comparison_id')
      .notNull()
      .references(() => costComparisons.id, { onDelete: 'cascade' }),
    rateRecordId: uuid('rate_record_id')
      .notNull()
      .references(() => rateRecords.id),
    isSelected: boolean('is_selected').notNull().default(false),
    totalWhtThb: numeric('total_wht_thb', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    totalVatThb: numeric('total_vat_thb', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    totalAmountThb: numeric('total_amount_thb', { precision: 18, scale: 4 }),
    totalAmountUsd: numeric('total_amount_usd', { precision: 18, scale: 4 }),
    isFullyComparable: boolean('is_fully_comparable').notNull().default(false),
    scopeCompletenessJson: jsonb('scope_completeness_json').notNull().default({}),
    comparabilityNotes: text('comparability_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_comparison_rate').on(table.costComparisonId, table.rateRecordId)]
);

// ============================================================================
// 4. PHASE 5: SELLING RATES & SALE PRICE APPROVE REQUEST (2 tables)
// ============================================================================

export const sellingRates = pgTable(
  'selling_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    costComparisonId: uuid('cost_comparison_id')
      .notNull()
      .references(() => costComparisons.id, { onDelete: 'cascade' }),
    selectedRateRecordId: uuid('selected_rate_record_id')
      .notNull()
      .references(() => rateRecords.id),
    currency: text('currency').notNull().default('THB'),
    status: text('status').notNull().default('Draft'), // 'Draft' | 'Pending_Approval' | 'Approved' | 'Returned' | 'Needs_Review'
    totalCostThb: numeric('total_cost_thb', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    totalSellingBeforeVat: numeric('total_selling_before_vat', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    netSellingExclVat: numeric('net_selling_excl_vat', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    grossProfit: numeric('gross_profit', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    markupPercent: numeric('markup_percent', { precision: 10, scale: 4 })
      .notNull()
      .default('0.0000'),
    grossMarginPercent: numeric('gross_margin_percent', { precision: 10, scale: 4 })
      .notNull()
      .default('0.0000'),
    vatPercent: numeric('vat_percent', { precision: 5, scale: 2 }).notNull().default('7.00'),
    vatAmount: numeric('vat_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    grandTotalSelling: numeric('grand_total_selling', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    snapshotData: jsonb('snapshot_data'),
    documentMeta: jsonb('document_meta').notNull().default({}),
    requestNotes: text('request_notes'),
    approvalRequestedAt: timestamp('approval_requested_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_selling_rates_shipment').on(table.shipmentId, table.isActive)]
);

export const sellingRateCharges = pgTable(
  'selling_rate_charges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellingRateId: uuid('selling_rate_id')
      .notNull()
      .references(() => sellingRates.id, { onDelete: 'cascade' }),
    chargeCatalogId: uuid('charge_catalog_id').references(() => chargeCatalog.id),
    description: text('description').notNull(),
    category: text('category').notNull().default('Other'),
    costAmountThb: numeric('cost_amount_thb', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    costWhtThb: numeric('cost_wht_thb', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    costVatThb: numeric('cost_vat_thb', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    costAmountUsd: numeric('cost_amount_usd', { precision: 18, scale: 4 }),
    costForeignCurrUsd: numeric('cost_foreign_curr_usd', { precision: 18, scale: 4 }),
    sellingAmountThb: numeric('selling_amount_thb', { precision: 18, scale: 4 }),
    revenueWhtPercent: numeric('revenue_wht_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0.00'),
    revenueAmountUsd: numeric('revenue_amount_usd', { precision: 18, scale: 4 }),
    chargeUnit: text('charge_unit').notNull().default('PER_SHIPMENT'),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1.00'),
    isVatApplicable: boolean('is_vat_applicable').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_selling_rate_charges_rate').on(table.sellingRateId, table.displayOrder),
  ]
);

// ============================================================================
// 5. PHASE 6: ISOLATED CUSTOMER QUOTATION DOMAIN (3 tables — zero internal costs)
// ============================================================================

export const quotations = pgTable(
  'quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    sellingRateId: uuid('selling_rate_id')
      .notNull()
      .references(() => sellingRates.id),
    quotationNumber: text('quotation_number').notNull().unique(),
    currentVersion: integer('current_version').notNull().default(1),
    status: text('status').notNull().default('Draft'),
    customerName: text('customer_name').notNull(),
    customerContact: text('customer_contact'),
    customerEmail: text('customer_email'),
    customerPhone: text('customer_phone'),
    customerAddress: text('customer_address'),
    polPortCode: text('pol_port_code').notNull(),
    podPortCode: text('pod_port_code').notNull(),
    containerSummary: text('container_summary').notNull(),
    commodityDescription: text('commodity_description'),
    transitTimeText: text('transit_time_text'),
    freeTimeText: text('free_time_text'),
    serviceType: text('service_type').notNull().default('CY/CY'),
    paymentTerms: text('payment_terms').notNull().default('Credit 30 Days'),
    validUntil: date('valid_until').notNull(),
    termsAndConditions: text('terms_and_conditions'),
    remarks: text('remarks'),
    documentMeta: jsonb('document_meta').notNull().default({}),
    assignedSalesRepId: uuid('assigned_sales_rep_id')
      .notNull()
      .references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentChannel: text('sent_channel'),
    sentRecipient: text('sent_recipient'),
    sentBy: uuid('sent_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quotations_shipment').on(table.shipmentId),
    index('idx_quotations_status').on(table.status),
  ]
);

export const quotationVersions = pgTable(
  'quotation_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull().default(1),
    status: text('status').notNull().default('Draft'),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 })
      .notNull()
      .default('0.0000'),
    vatPercent: numeric('vat_percent', { precision: 5, scale: 2 }).notNull().default('7.00'),
    vatAmount: numeric('vat_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    grandTotal: numeric('grand_total', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    currency: text('currency').notNull().default('THB'),
    snapshotPayload: jsonb('snapshot_payload').notNull(),
    changeSummary: text('change_summary'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_quotation_version_num').on(table.quotationId, table.versionNumber)]
);

export const quotationItems = pgTable(
  'quotation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationVersionId: uuid('quotation_version_id')
      .notNull()
      .references(() => quotationVersions.id, { onDelete: 'cascade' }),
    itemOrder: integer('item_order').notNull().default(1),
    descriptionEn: text('description_en').notNull(),
    descriptionTh: text('description_th'),
    quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull().default('1.00'),
    chargeUnitText: text('charge_unit_text').notNull().default('Per Shipment'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0.0000'),
    currency: text('currency').notNull().default('THB'),
    isTaxable: boolean('is_taxable').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_quotation_items_ver').on(table.quotationVersionId, table.itemOrder)]
);
