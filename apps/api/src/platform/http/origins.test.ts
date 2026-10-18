import { describe, expect, it } from "vitest";

import { isAdminPath } from "./origins.ts";

describe("isAdminPath", () => {
  // Express matches routes case-insensitively, so classification must too.
  it.each([
    "/api/v1/admin",
    "/api/v1/admin/",
    "/api/v1/admin/orders",
    "/API/V1/ADMIN",
    "/API/V1/ADMIN/orders",
    "/Api/V1/Admin/orders",
    "/api/v1/aDmIn",
  ])("treats %s as admin", (path) => {
    expect(isAdminPath(path)).toBe(true);
  });

  it.each([
    "/api/v1/administrator",
    "/API/V1/ADMINISTRATOR",
    "/api/v1/admin-other",
    "/API/V1/ADMIN-OTHER/orders",
    "/api/v1/adminx/orders",
    "/api/v1/health",
    "/api/v1/products/admin",
    "/admin",
  ])("treats %s as public", (path) => {
    expect(isAdminPath(path)).toBe(false);
  });
});
