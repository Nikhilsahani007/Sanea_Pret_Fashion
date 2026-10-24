/**
 * Every database object written by hand in the migrations. Prisma does not
 * model these, and its drift check does not notice if one is dropped
 * (phase-6-plan.md, compatibility check 2), so tests check this list against
 * the migration SQL and, once a database exists, against the live catalogue.
 */

export const HANDWRITTEN_EXTENSIONS = [
  "citext",
  "pg_trgm",
  // Phase 15 (revised, D-167): equality in the GST rule exclusion constraint.
  "btree_gist",
] as const;

export const HANDWRITTEN_FUNCTIONS = [
  "reject_append_only_change",
  // Phase 8: rebuilds a product's full-text search document.
  "refresh_product_search",
] as const;

/** Expression indexes Prisma cannot model (Phase 8 search). */
export const HANDWRITTEN_INDEXES = [
  { table: "product", name: "product_name_trgm_idx" },
  // Phase 15 (revised, D-167): one open price band per GST rule (partial).
  { table: "gst_rule_slab", name: "gst_rule_slab_open_band_idx" },
] as const;

/** Exclusion constraints Prisma cannot model (Phase 15 GST rules, D-167). */
export const HANDWRITTEN_EXCLUSIONS = [
  { table: "gst_rule", name: "gst_rule_no_overlap_excl" },
] as const;

/** Sequences Prisma cannot model (Phase 15 order numbers, D-115). */
export const HANDWRITTEN_SEQUENCES = ["order_number_seq"] as const;

/** Append-only tables (D-057): UPDATE/DELETE row trigger plus TRUNCATE trigger. */
export const APPEND_ONLY_TABLES = [
  "stock_movement",
  "audit_log",
  // Phase 15: order status history.
  "order_status_event",
  // Phase 16: internal order notes.
  "order_note",
] as const;

export const HANDWRITTEN_TRIGGERS = APPEND_ONLY_TABLES.flatMap((table) => [
  { table, name: `${table}_append_only` },
  { table, name: `${table}_no_truncate` },
]);

export const HANDWRITTEN_CHECKS = [
  { table: "category", name: "category_not_own_parent_check" },
  { table: "collection", name: "collection_schedule_check" },
  { table: "product", name: "product_short_description_length_check" },
  { table: "product", name: "product_published_at_check" },
  { table: "colour", name: "colour_swatch_hex_check" },
  { table: "product_variant", name: "product_variant_price_check" },
  { table: "product_variant", name: "product_variant_compare_at_price_check" },
  { table: "product_image", name: "product_image_alt_check" },
  { table: "media_asset", name: "media_asset_dimensions_check" },
  { table: "inventory_level", name: "inventory_level_on_hand_check" },
  { table: "inventory_level", name: "inventory_level_reserved_check" },
  {
    table: "inventory_level",
    name: "inventory_level_low_stock_threshold_check",
  },
  { table: "inventory_level", name: "inventory_level_version_check" },
  { table: "stock_movement", name: "stock_movement_reason_check" },
  { table: "stock_movement", name: "stock_movement_delta_check" },
  { table: "stock_movement", name: "stock_movement_reference_check" },
  { table: "stock_reservation", name: "stock_reservation_quantity_check" },
  { table: "stock_reservation", name: "stock_reservation_expiry_check" },
  { table: "admin_user", name: "admin_user_failed_login_count_check" },
  { table: "admin_session", name: "admin_session_token_hash_check" },
  { table: "admin_session", name: "admin_session_expiry_check" },
  { table: "content_block", name: "content_block_published_check" },
  { table: "page", name: "page_verification_required_check" },
  { table: "page", name: "page_verified_by_check" },
  { table: "page", name: "page_rehma_requires_verification_check" },
  { table: "navigation_item", name: "navigation_item_target_check" },
  // Phase 7 (admin authentication)
  { table: "admin_user", name: "admin_user_mfa_required_check" },
  { table: "admin_user", name: "admin_user_mfa_key_check" },
  { table: "admin_user", name: "admin_user_mfa_last_used_step_check" },
  { table: "admin_invite", name: "admin_invite_token_hash_check" },
  { table: "admin_invite", name: "admin_invite_expiry_check" },
  { table: "admin_invite", name: "admin_invite_outcome_check" },
  { table: "admin_invite", name: "admin_invite_pending_mfa_check" },
  { table: "admin_recovery_code", name: "admin_recovery_code_hash_check" },
  // Phase 11 (guest cart)
  { table: "cart", name: "cart_token_hash_check" },
  { table: "cart", name: "cart_expiry_check" },
  { table: "cart_item", name: "cart_item_quantity_check" },
  // Phase 13 (enquiries)
  { table: "enquiry", name: "enquiry_consent_check" },
  { table: "enquiry", name: "enquiry_contact_check" },
  { table: "enquiry", name: "enquiry_phone_check" },
  { table: "enquiry", name: "enquiry_text_check" },
  { table: "enquiry", name: "enquiry_source_check" },
  // Phase 15 (orders, payments, GST rules)
  { table: "order", name: "order_number_check" },
  { table: "order", name: "order_amounts_check" },
  { table: "order", name: "order_total_check" },
  { table: "order", name: "order_currency_check" },
  { table: "order", name: "order_phone_check" },
  { table: "order", name: "order_cod_fee_check" },
  { table: "order", name: "order_access_token_hash_check" },
  { table: "order", name: "order_attention_check" },
  { table: "order", name: "order_gst_supply_check" },
  { table: "order", name: "order_tax_supply_check" },
  { table: "order_item", name: "order_item_quantity_check" },
  { table: "order_item", name: "order_item_amounts_check" },
  { table: "order_item", name: "order_item_gst_rates_check" },
  { table: "order_item", name: "order_item_gst_amounts_check" },
  { table: "payment", name: "payment_amount_check" },
  { table: "payment", name: "payment_method_status_check" },
  { table: "refund", name: "refund_amount_check" },
  { table: "refund", name: "refund_reason_check" },
  { table: "shipment", name: "shipment_text_check" },
  { table: "gst_rule_slab", name: "gst_rule_slab_rates_check" },
  { table: "gst_rule_slab", name: "gst_rule_slab_bound_check" },
  { table: "gst_rule", name: "gst_rule_effective_check" },
  { table: "gst_rule", name: "gst_rule_hsn_prefix_check" },
  // Phase 16 (admin operations)
  { table: "order_note", name: "order_note_body_check" },
  { table: "notification", name: "notification_template_check" },
  { table: "notification", name: "notification_error_check" },
] as const;

/** Reference rows inserted by the migration (D-029, D-058), in order. */
export const APPROVED_SIZES = [
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "Free Size",
] as const;
