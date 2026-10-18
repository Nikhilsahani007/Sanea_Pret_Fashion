/**
 * Every database object written by hand in the migrations. Prisma does not
 * model these, and its drift check does not notice if one is dropped
 * (phase-6-plan.md, compatibility check 2), so tests check this list against
 * the migration SQL and, once a database exists, against the live catalogue.
 */

export const HANDWRITTEN_EXTENSIONS = ["citext"] as const;

export const HANDWRITTEN_FUNCTIONS = ["reject_append_only_change"] as const;

/** Append-only tables (D-057): UPDATE/DELETE row trigger plus TRUNCATE trigger. */
export const APPEND_ONLY_TABLES = ["stock_movement", "audit_log"] as const;

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
