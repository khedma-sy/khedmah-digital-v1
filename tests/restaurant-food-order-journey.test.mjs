import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("restaurant food order journey is multi-item, cash-only, and rating-aware", async () => {
  const [menu, checkout, service, ratings, businesses] = await Promise.all([
    read("apps/frontend/app/restaurants/[businessId]/page.tsx"),
    read("apps/frontend/app/orders/checkout/page.tsx"),
    read("apps/backend/src/orders/order.service.ts"),
    read("backend/migrations/versions/026_cash_fulfillment_orders.sql"),
    read("apps/backend/src/business-profiles/business-profile.repository.ts"),
  ]);
  assert.match(menu, /سلة الطلب/);
  assert.match(checkout, /items: items\.map/);
  assert.match(
    service,
    /All items must be available from one approved merchant/,
  );
  assert.match(ratings, /fulfillment_order_ratings/);
  assert.match(ratings, /payment_method = 'cash'/);
  assert.match(businesses, /AVG\(r\.score\)/);
  assert.match(businesses, /rating_count/);
});
