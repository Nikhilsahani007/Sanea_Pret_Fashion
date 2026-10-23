// Navigation by role (security-design.md §4, phase-8-ui-plan.md §3.3). Hiding a
// link is a convenience only: every route is still checked by the API.
// Screens from later phases (inventory, orders, content, staff, audit) are
// added with those phases; no link points at a screen that does not exist.
import { can, type AdminRole, type Permission } from "@sanea/shared";

export type NavItem = {
  to: string;
  label: string;
  permission: Permission;
  /** Current only on this exact path, not on paths below it. */
  end?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/products", label: "Products", permission: "products.view" },
  {
    to: "/inventory",
    label: "Inventory",
    permission: "products.view",
    end: true,
  },
  {
    to: "/inventory/movements",
    label: "Stock movements",
    permission: "inventory.adjust",
  },
  { to: "/content", label: "Content", permission: "content.edit" },
  {
    to: "/categories",
    label: "Categories",
    permission: "products.editContent",
  },
  {
    to: "/collections",
    label: "Collections",
    permission: "products.editContent",
  },
  { to: "/colours", label: "Colours", permission: "products.editContent" },
  {
    to: "/size-charts",
    label: "Size charts",
    permission: "products.editContent",
  },
  { to: "/media", label: "Media library", permission: "products.editContent" },
];

export function navFor(role: AdminRole): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CATALOGUE_EDITOR: "Catalogue editor",
  FULFILMENT: "Fulfilment",
};
