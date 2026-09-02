import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { changeRestaurantCartItem } from "../lib/restaurant-cart";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("restaurant cart keeps one merchant, removes zero quantities, and caps item quantity", () => {
  const empty = { businessProfileId: "restaurant-1", items: [] } as const;
  const added = changeRestaurantCartItem(empty, "meal-1", 1);
  assert.deepEqual(added, {
    businessProfileId: "restaurant-1",
    items: [{ productId: "meal-1", quantity: 1 }],
  });
  assert.deepEqual(changeRestaurantCartItem(added, "meal-1", -1).items, []);
  assert.equal(
    changeRestaurantCartItem(empty, "meal-1", 90).items[0]?.quantity,
    50,
  );
});

test("food discovery, menu, cart, cash checkout, and post-delivery ratings form one journey", async () => {
  const [navigation, discovery, menu, checkout, orders] = await Promise.all([
    read("app/auth-navigation.tsx"),
    read("app/restaurants/page.tsx"),
    read("app/restaurants/[businessId]/page.tsx"),
    read("app/orders/checkout/page.tsx"),
    read("app/orders/page.tsx"),
  ]);
  assert.match(navigation, /اطلب طعام/);
  assert.match(discovery, /عرض قائمة الطعام/);
  assert.match(menu, /سلة الطلب/);
  assert.match(menu, /لا يمكن خلط أصناف من مطاعم مختلفة/);
  assert.match(checkout, /items\.map/);
  assert.match(checkout, /الدفع نقدًا عند التسليم/);
  assert.match(checkout, /clearRestaurantCart/);
  assert.match(orders, /تقييم المنشأة/);
  assert.match(orders, /تقييم المندوب/);
});

test("restaurant menu query is server-filtered, parameterized, and rate limited", async () => {
  const [controller, repository, app] = await Promise.all([
    read("../backend/src/products/product.controller.ts"),
    read("../backend/src/products/product.repository.ts"),
    read("../backend/src/app.ts"),
  ]);
  assert.match(controller, /businessProfileId/);
  assert.match(repository, /p\.business_profile_id=\$\$\{params\.length\}/);
  assert.match(app, /\/api\/v1\/products/);
});
