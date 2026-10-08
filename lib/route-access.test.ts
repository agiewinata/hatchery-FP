/**
 * Regression tests for the proxy's path matching.
 *
 * The bug these exist to prevent: `"/sellers/mira".startsWith("/seller")` is
 * true, so a raw prefix check sent every PUBLIC artist portfolio to the login
 * page. Caught only by loading the page signed out.
 */
import { describe, expect, it } from "vitest";

import { isAuthPage, isPrivatePath, isUnderPrefix } from "./route-access";

describe("public paths must stay public", () => {
  it.each([
    "/sellers/mira-santoso",
    "/sellers/deni-pratama",
    "/sellers",
    "/products",
    "/products/sleeping-fox-acrylic-charm",
    "/",
    "/login",
    "/register",
  ])("%s is NOT private", (path) => {
    expect(isPrivatePath(path)).toBe(false);
  });

  it("the plural /sellers tree is distinct from the singular /seller tree", () => {
    // This single assertion is the whole bug.
    expect(isPrivatePath("/sellers/anyone")).toBe(false);
    expect(isPrivatePath("/seller/dashboard")).toBe(true);
  });
});

describe("private paths must stay private", () => {
  it.each([
    "/account",
    "/account/orders",
    "/account/orders/KM-20261006-7F3A",
    "/seller",
    "/seller/start",
    "/seller/dashboard",
    "/seller/dashboard/products/new",
    "/admin",
    "/admin/production",
    "/admin/sellers",
  ])("%s IS private", (path) => {
    expect(isPrivatePath(path)).toBe(true);
  });
});

describe("prefix matching respects segment boundaries", () => {
  it("matches the prefix itself", () => {
    expect(isUnderPrefix("/seller", "/seller")).toBe(true);
  });

  it("matches a child segment", () => {
    expect(isUnderPrefix("/seller/dashboard", "/seller")).toBe(true);
  });

  it("does NOT match a longer sibling word", () => {
    expect(isUnderPrefix("/sellers", "/seller")).toBe(false);
    expect(isUnderPrefix("/sellerprofile", "/seller")).toBe(false);
    expect(isUnderPrefix("/sellers/mira", "/seller")).toBe(false);
  });

  it("does not match a prefix appearing later in the path", () => {
    expect(isUnderPrefix("/products/admin-pick", "/admin")).toBe(false);
    expect(isUnderPrefix("/x/account", "/account")).toBe(false);
  });
});

describe("auth pages", () => {
  it.each(["/login", "/register", "/forgot-password"])("%s is an auth page", (path) => {
    expect(isAuthPage(path)).toBe(true);
  });

  it("reset-password is NOT treated as an auth page", () => {
    // A signed-in user following a reset link must still reach the form;
    // bouncing them home would make the link useless.
    expect(isAuthPage("/reset-password")).toBe(false);
  });

  it("does not match sub-paths", () => {
    expect(isAuthPage("/login/other")).toBe(false);
  });
});

describe("the studio tree", () => {
  it.each(["/studio", "/studio/designs", "/studio/designs/abc123"])(
    "%s is private",
    (path) => {
      expect(isPrivatePath(path)).toBe(true);
    },
  );

  it("does not swallow neighbouring paths that merely share the prefix", () => {
    // The /seller vs /sellers bug, one tree over. A prefix must end on a
    // segment boundary or every public page under a similar name disappears
    // behind a login wall - and a login page looks like it is working.
    expect(isPrivatePath("/studiolike")).toBe(false);
    expect(isPrivatePath("/studios")).toBe(false);
    expect(isPrivatePath("/studio-guide")).toBe(false);
  });

  it("keeps shared designs public, which is why they live outside /studio", () => {
    // Shared links sit at /designs/<slug>, deliberately NOT under /studio. Had
    // they lived at /studio/shared/..., adding /studio to PRIVATE_PREFIXES
    // would have sent every shared link to /login.
    expect(isPrivatePath("/designs/foxy-charm-a1b2c3")).toBe(false);
    expect(isPrivatePath("/designs")).toBe(false);
  });
});
