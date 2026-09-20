import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabasePool } from "../database/database.pool";
import type {
  FulfillmentOrder,
  FulfillmentOrderEvent,
  OrderItem,
  OrderStatus,
  OrderVertical,
} from "./order.types";

interface ProductOrderRow extends Record<string, unknown> {
  id: string;
  business_profile_id: string;
  owner_user_id: string;
  business_name: string;
  business_category_code: string;
  title_ar: string;
  price: string;
  currency: "SYP" | "USD";
  availability: string;
  status: string;
  moderation_status: string;
  requires_prescription: boolean;
  controlled_item: boolean;
}
interface OrderRow extends Record<string, unknown> {
  id: string;
  customer_user_id: string;
  merchant_business_id: string;
  merchant_owner_user_id: string;
  merchant_name: string;
  pickup_address: string | null;
  merchant_phone: string | null;
  courier_business_id: string | null;
  courier_owner_user_id: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  vertical: OrderVertical;
  status: OrderStatus;
  payment_method: "cash";
  payment_status: "pending" | "cash_collected";
  currency: "SYP" | "USD";
  subtotal: string;
  promo_code: string | null;
  discount_amount: string;
  delivery_fee: string | null;
  total: string | null;
  delivery_address: string;
  customer_phone: string;
  delivery_latitude: string | null;
  delivery_longitude: string | null;
  customer_note: string | null;
  prescription_attested: boolean;
  pharmacy_review_status: FulfillmentOrder["pharmacyReviewStatus"];
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}
interface FoodPromotionRow extends Record<string, unknown> {
  id: string;
  code: string;
  name_ar: string;
  merchant_business_id: string;
  discount_type: "percentage" | "fixed";
  percentage_off: number | null;
  fixed_amount: string | null;
  currency: "SYP" | "USD";
  minimum_subtotal: string;
  maximum_discount: string | null;
  active: boolean;
  valid_from: Date;
  valid_until: Date;
  max_redemptions: number | null;
  per_user_limit: number;
}
interface ItemRow extends Record<string, unknown> {
  order_id: string;
  product_listing_id: string;
  title_ar: string;
  unit_price: string;
  quantity: number;
  requires_prescription: boolean;
}
interface EventRow extends Record<string, unknown> {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  occurred_at: Date;
}

const projection = `o.*, merchant.owner_user_id AS merchant_owner_user_id, merchant.name AS merchant_name,
 merchant.address_ar AS pickup_address, merchant.phone AS merchant_phone,
 courier.owner_user_id AS courier_owner_user_id, courier.name AS courier_name, courier.phone AS courier_phone`;

interface FoodPromotionPricingInput {
  readonly userId: string;
  readonly merchantBusinessId: string;
  readonly vertical: OrderVertical;
  readonly currency: "SYP" | "USD";
  readonly subtotal: number;
  readonly promoCode?: string;
}

interface CreatePromotionExpectation {
  readonly promoCode?: string;
  readonly expectedSubtotal?: number;
  readonly expectedDiscountAmount?: number;
}

interface ResolvedFoodPromotionQuote {
  readonly merchantBusinessId: string;
  readonly vertical: OrderVertical;
  readonly currency: "SYP" | "USD";
  readonly subtotal: number;
  readonly discountAmount: number;
  readonly discountedSubtotal: number;
  readonly promotion?: { readonly id: string; readonly code: string; readonly nameAr: string };
}

const statusMessages: Record<OrderStatus, readonly [string, string]> = {
  placed: ['طلب جديد', 'تم إنشاء الطلب.'], quoted: ['تم تسعير الطلب', 'أرسل المتجر السعر ورسوم التوصيل.'],
  merchant_confirmed: ['تم تأكيد الطلب', 'أكد الزبون الطلب وأصبح جاهزاً للمتابعة.'], courier_assigned: ['مهمة توصيل جديدة', 'تم إسناد طلب توصيل إليك. اقبله أو ارفضه.'],
  courier_accepted: ['قُبلت مهمة التوصيل', 'وافق المندوب على توصيل الطلب.'], ready_for_pickup: ['الطلب جاهز للاستلام', 'يمكن للمندوب استلام الطلب الآن.'],
  picked_up: ['الطلب في الطريق', 'استلم المندوب الطلب وبدأ التوصيل.'], delivered: ['تم تسليم الطلب', 'اكتملت رحلة الطلب بنجاح.'],
  rejected: ['تعذر قبول الطلب', 'رفض المتجر الطلب. راجع التفاصيل.'], cancelled: ['أُلغي الطلب', 'تم إلغاء الطلب.'],
};

async function insertNotification(client: PoolClient, input: { userId: string; orderId: string; status: OrderStatus; vertical: OrderVertical; eventType: 'order.created' | 'order.status_changed'; title: string; body: string; transitionEventId?: string; fromStatus?: OrderStatus; reason?: string; }) {
  await client.query(
    `INSERT INTO platform_notifications (id,user_id,event_key,event_type,reference_type,reference_id,title,body,metadata)
     VALUES($1,$2,$3,$4,'order',$5,$6,$7,$8::jsonb)
     ON CONFLICT(user_id,event_key) DO NOTHING`,
    [randomUUID(), input.userId, `${input.orderId}:${input.transitionEventId ?? input.status}:${input.userId}`, input.eventType, input.orderId, input.title, input.body, JSON.stringify({ status: input.status, vertical: input.vertical, ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}), ...(input.reason ? { reason: input.reason } : {}) })],
  );
}

@Injectable()
export class OrderRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  private async promotionQuote(
    source: DatabasePool | PoolClient,
    input: FoodPromotionPricingInput,
    lock: boolean,
  ): Promise<ResolvedFoodPromotionQuote> {
    const base: ResolvedFoodPromotionQuote = {
      merchantBusinessId: input.merchantBusinessId,
      vertical: input.vertical,
      currency: input.currency,
      subtotal: input.subtotal,
      discountAmount: 0,
      discountedSubtotal: input.subtotal,
    };
    if (!input.promoCode) return base;
    if (input.vertical !== "food")
      throw new BadRequestException("Food promotion is unavailable for this basket.");
    const query = async <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
      source instanceof DatabasePool
        ? source.query<T>(sql, params)
        : (await source.query<T>(sql, params)).rows;
    const promotions = await query<FoodPromotionRow>(
      `SELECT * FROM food_promo_codes
       WHERE merchant_business_id=$1 AND code=$2${lock ? " FOR UPDATE" : ""}`,
      [input.merchantBusinessId, input.promoCode],
    );
    const promotion = promotions[0];
    const now = new Date();
    if (!promotion || !promotion.active || promotion.merchant_business_id !== input.merchantBusinessId
      || promotion.currency !== input.currency || promotion.valid_from > now || promotion.valid_until <= now
      || input.subtotal < Number(promotion.minimum_subtotal)) {
      throw new BadRequestException("Food promotion is unavailable for this basket.");
    }
    const userClaims = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM food_promo_claims
       WHERE promo_id=$1 AND user_id=$2 AND status IN ('applied','redeemed')`,
      [promotion.id, input.userId],
    );
    if (Number(userClaims[0]?.count ?? 0) >= promotion.per_user_limit)
      throw new ConflictException("Food promotion redemption limit was reached.");
    if (promotion.max_redemptions !== null) {
      const totalClaims = await query<{ count: string }>(
        `SELECT count(*)::text AS count FROM food_promo_claims
         WHERE promo_id=$1 AND status IN ('applied','redeemed')`,
        [promotion.id],
      );
      if (Number(totalClaims[0]?.count ?? 0) >= promotion.max_redemptions)
        throw new ConflictException("Food promotion redemption limit was reached.");
    }
    let discount = promotion.discount_type === "percentage"
      ? input.subtotal * Number(promotion.percentage_off) / 100
      : Number(promotion.fixed_amount);
    if (promotion.maximum_discount !== null)
      discount = Math.min(discount, Number(promotion.maximum_discount));
    discount = Math.round(discount * 100) / 100;
    if (discount <= 0 || discount >= input.subtotal)
      throw new BadRequestException("Food promotion is unavailable for this basket.");
    return {
      ...base,
      discountAmount: discount,
      discountedSubtotal: Math.round((input.subtotal - discount) * 100) / 100,
      promotion: { id: promotion.id, code: promotion.code, nameAr: promotion.name_ar },
    };
  }

  quoteFoodPromotion(input: FoodPromotionPricingInput) {
    return this.promotionQuote(this.db, input, false).then(({ promotion, ...quote }) => ({
      ...quote,
      promotion: promotion ? { code: promotion.code, nameAr: promotion.nameAr } : undefined,
    }));
  }

  async findProducts(ids: readonly string[]): Promise<ProductOrderRow[]> {
    return this.db.query<ProductOrderRow>(
      `SELECT p.id,p.business_profile_id,p.owner_user_id,b.name AS business_name,b.category_code AS business_category_code,p.title_ar,p.price,p.currency,p.availability,p.status,p.moderation_status,p.requires_prescription,p.controlled_item
       FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id
       WHERE p.id = ANY($1::text[])
         AND b.visibility='public' AND b.moderation_status='approved'
         AND b.trust_status='approved' AND b.status='active'`,
      [ids],
    );
  }

  async countApprovedMobilityDocuments(businessProfileId: string): Promise<number> {
    const [row] = await this.db.query<{ count: string } & Record<string, unknown>>(
      `SELECT COUNT(*)::text AS count
       FROM (
         SELECT DISTINCT ON (document_type) document_type,status
         FROM mobility_document_reviews
         WHERE business_profile_id=$1
           AND document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
         ORDER BY document_type,created_at DESC,media_asset_id DESC
       ) latest
       WHERE latest.status='approved'`,
      [businessProfileId],
    );
    return Number(row?.count ?? 0);
  }

  async eligibleCouriers(cityCode: string, page: number) {
    const eligibility = `FROM business_profiles b
      WHERE b.category_code='delivery_courier' AND b.city_code=$1
        AND b.visibility='public' AND b.status='active'
        AND b.availability='available'
        AND b.trust_status='approved' AND b.moderation_status='approved'
        AND NOT EXISTS (
          SELECT 1 FROM fulfillment_orders active_job
          WHERE active_job.courier_business_id=b.id
            AND active_job.status IN ('courier_assigned','courier_accepted','ready_for_pickup','picked_up')
        )
        AND (SELECT COUNT(*) FROM (
          SELECT DISTINCT ON (document_type) document_type,status
          FROM mobility_document_reviews WHERE business_profile_id=b.id
            AND document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
          ORDER BY document_type,created_at DESC,media_asset_id DESC
        ) latest WHERE latest.status='approved')=4`;
    const [count] = await this.db.query<{total:string}>(`SELECT COUNT(*)::text AS total ${eligibility}`, [cityCode]);
    const rows = await this.db.query<{id:string;name:string;city_code:string}>(
      `SELECT b.id,b.name,b.city_code ${eligibility} ORDER BY b.name,b.id LIMIT 20 OFFSET $2`, [cityCode,(page-1)*20]);
    return {couriers:rows.map(b=>({id:b.id,name:b.name,cityCode:b.city_code})),total:Number(count?.total??0),page,limit:20};
  }

  async create(
    order: FulfillmentOrder,
    idempotencyKey: string,
    expectation: CreatePromotionExpectation = {},
  ): Promise<FulfillmentOrder> {
    const orderId = await this.db.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`fulfillment-request:${order.customerUserId}:${idempotencyKey}`],
      );
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM fulfillment_orders
         WHERE customer_user_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [order.customerUserId, idempotencyKey],
      );
      if (replay.rows[0]) return replay.rows[0].id;

      const currentProducts = await client.query<ProductOrderRow>(
        `SELECT p.id,p.business_profile_id,p.owner_user_id,b.name AS business_name,
           b.category_code AS business_category_code,p.title_ar,p.price,p.currency,
           p.availability,p.status,p.moderation_status,p.requires_prescription,p.controlled_item
         FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id
         WHERE p.id=ANY($1::text[])
           AND b.visibility='public' AND b.moderation_status='approved'
           AND b.trust_status='approved' AND b.status='active'
         ORDER BY p.id FOR KEY SHARE OF p,b`,
        [[...order.items.map((item) => item.productListingId)].sort()],
      );
      if (currentProducts.rows.length !== order.items.length)
        throw new ConflictException("Basket changed; review the order again.");
      const byId = new Map(currentProducts.rows.map((product) => [product.id, product]));
      const currentCategory = currentProducts.rows[0]?.business_category_code;
      const currentVertical: OrderVertical | undefined = currentCategory === "pharmacy"
        ? "pharmacy"
        : ["restaurant", "cafe", "bakery", "sweets", "catering", "juice_icecream"].includes(currentCategory ?? "")
          ? "food"
          : ["butcher", "grocery", "fruits_vegetables", "fish_poultry_shop"].includes(currentCategory ?? "")
            ? "grocery"
            : undefined;
      const unchanged = order.items.every((item) => {
        const current = byId.get(item.productListingId);
        return current
          && current.business_profile_id === order.merchantBusinessId
          && current.currency === order.currency
          && current.status === "active"
          && current.moderation_status === "approved"
          && current.availability !== "out_of_stock"
          && !current.controlled_item
          && current.title_ar === item.titleAr
          && Number(current.price) === item.unitPrice
          && current.requires_prescription === item.requiresPrescription;
      });
      if (!unchanged || currentVertical !== order.vertical)
        throw new ConflictException("Basket changed; review the order again.");

      const quote = await this.promotionQuote(client, {
        userId: order.customerUserId,
        merchantBusinessId: order.merchantBusinessId,
        vertical: order.vertical,
        currency: order.currency,
        subtotal: order.subtotal,
        promoCode: expectation.promoCode,
      }, true);
      if (expectation.promoCode && (expectation.expectedSubtotal !== quote.subtotal
        || expectation.expectedDiscountAmount !== quote.discountAmount)) {
        throw new ConflictException("Food promotion quote changed; review it again.");
      }

      await client.query(
        `INSERT INTO fulfillment_orders (
           id,customer_user_id,merchant_business_id,vertical,status,payment_method,payment_status,
           currency,subtotal,food_promo_id,promo_code,discount_amount,delivery_address,
           customer_phone,delivery_latitude,delivery_longitude,customer_note,prescription_attested,
           pharmacy_review_status,idempotency_key,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,'placed','cash','pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)`,
        [
          order.id,
          order.customerUserId,
          order.merchantBusinessId,
          order.vertical,
          order.currency,
          order.subtotal,
          quote.promotion?.id ?? null,
          quote.promotion?.code ?? null,
          quote.discountAmount,
          order.deliveryAddress,
          order.customerPhone,
          order.deliveryLatitude ?? null,
          order.deliveryLongitude ?? null,
          order.customerNote ?? null,
          order.prescriptionAttested,
          order.pharmacyReviewStatus,
          idempotencyKey,
          order.createdAt,
        ],
      );
      for (const item of order.items)
        await client.query(
          `INSERT INTO fulfillment_order_items (id,order_id,product_listing_id,title_ar,unit_price,quantity,requires_prescription) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), order.id, item.productListingId, item.titleAr, item.unitPrice, item.quantity, item.requiresPrescription],
        );
      if (quote.promotion) {
        await client.query(
          `INSERT INTO food_promo_claims(
             id,promo_id,order_id,user_id,merchant_business_id,code_snapshot,
             subtotal_snapshot,discount_amount,currency,status,applied_at
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'applied',$10)`,
          [randomUUID(), quote.promotion.id, order.id, order.customerUserId,
            order.merchantBusinessId, quote.promotion.code, order.subtotal,
            quote.discountAmount, order.currency, order.createdAt],
        );
      }
      await client.query(
        `INSERT INTO fulfillment_order_events (id,order_id,actor_user_id,from_status,to_status,occurred_at) VALUES ($1,$2,$3,NULL,'placed',$4)`,
        [randomUUID(), order.id, order.customerUserId, order.createdAt],
      );
      await client.query(
        `INSERT INTO audit_logs(id,event_type,actor_user_id,correlation_id,occurred_at)
         VALUES($1,'fulfillment.order.created',$2,$3,$4)`,
        [randomUUID(), order.customerUserId, order.id, order.createdAt],
      );
      const merchant = await client.query<{ owner_user_id: string }>(`SELECT owner_user_id FROM business_profiles WHERE id=$1`, [order.merchantBusinessId]);
      if (merchant.rows[0]) await insertNotification(client, {
        userId: merchant.rows[0].owner_user_id, orderId: order.id, status: 'placed', vertical: order.vertical,
        eventType: 'order.created', title: 'طلب جديد',
        body: order.vertical === 'food' ? 'وصل طلب طعام جديد. افتحه للمراجعة والقبول.' : 'وصل طلب جديد. افتحه للمراجعة.',
      });
      return order.id;
    });
    return (await this.findById(orderId))!;
  }

  async findById(id: string): Promise<FulfillmentOrder | undefined> {
    const [row] = await this.db.query<OrderRow>(
      `SELECT ${projection} FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id WHERE o.id=$1`,
      [id],
    );
    if (!row) return undefined;
    const [items, events] = await Promise.all([this.itemsFor([id]), this.eventsFor([id])]);
    return map(row, items.get(id) ?? [], events.get(id) ?? []);
  }
  async findIdempotent(customer: string, key: string) {
    const [row] = await this.db.query<{ id: string } & Record<string, unknown>>(
      `SELECT id FROM fulfillment_orders WHERE customer_user_id=$1 AND idempotency_key=$2`,
      [customer, key],
    );
    return row ? this.findById(row.id) : undefined;
  }
  async listForCustomer(id: string) { return this.list(`o.customer_user_id=$1`, [id]); }
  async listForMerchant(id: string, ownerUserId: string) { return this.list(`o.merchant_business_id=$1 AND merchant.owner_user_id=$2`, [id, ownerUserId]); }
  async listForCourier(id: string, ownerUserId: string) { return this.list(`o.courier_business_id=$1 AND courier.owner_user_id=$2`, [id, ownerUserId]); }
  private async list(where: string, params: unknown[]) {
    const rows = await this.db.query<OrderRow>(
      `SELECT ${projection} FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`, params,
    );
    const ids = rows.map((r) => r.id);
    const [items, events] = await Promise.all([this.itemsFor(ids), this.eventsFor(ids)]);
    return rows.map((r) => map(r, items.get(r.id) ?? [], events.get(r.id) ?? []));
  }
  private async itemsFor(ids: string[]) {
    const grouped = new Map<string, OrderItem[]>();
    if (!ids.length) return grouped;
    const rows = await this.db.query<ItemRow>(
      `SELECT order_id,product_listing_id,title_ar,unit_price,quantity,requires_prescription FROM fulfillment_order_items WHERE order_id=ANY($1::text[]) ORDER BY id`, [ids],
    );
    for (const r of rows) {
      const value = { productListingId: r.product_listing_id, titleAr: r.title_ar, unitPrice: Number(r.unit_price), quantity: r.quantity, requiresPrescription: r.requires_prescription };
      grouped.set(r.order_id, [...(grouped.get(r.order_id) ?? []), value]);
    }
    return grouped;
  }

  private async eventsFor(ids: string[]) {
    const grouped = new Map<string, FulfillmentOrderEvent[]>();
    if (!ids.length) return grouped;
    const rows = await this.db.query<EventRow>(
      `SELECT id,order_id,from_status,to_status,reason,occurred_at
       FROM fulfillment_order_events
       WHERE order_id=ANY($1::text[])
       ORDER BY occurred_at,id`,
      [ids],
    );
    for (const row of rows) {
      const value: FulfillmentOrderEvent = {
        id: row.id,
        fromStatus: row.from_status ?? undefined,
        toStatus: row.to_status,
        reason: row.reason ?? undefined,
        occurredAt: row.occurred_at.toISOString(),
      };
      grouped.set(row.order_id, [...(grouped.get(row.order_id) ?? []), value]);
    }
    return grouped;
  }

  async transition(order: FulfillmentOrder, next: OrderStatus, actor: string, options: { authority?: "customer" | "merchant" | "courier"; deliveryFee?: number; courierBusinessId?: string; clearCourierBusinessId?: boolean; reason?: string; pharmacyReviewStatus?: FulfillmentOrder["pharmacyReviewStatus"]; eligibleCourierBusinessId?: string; expectedCourierBusinessId?: string; requireCourierAvailability?: boolean; } = {}): Promise<FulfillmentOrder | undefined> {
    const now = new Date().toISOString();
    const changed = await this.db.transaction(async (client) => {
      const protectedBusinessIds = [...new Set([
        order.merchantBusinessId,
        options.eligibleCourierBusinessId,
        options.expectedCourierBusinessId,
      ].filter((id): id is string => Boolean(id)))].sort();
      await client.query(
        `SELECT id FROM business_profiles WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,
        [protectedBusinessIds],
      );
      const formerCourierOwner = options.clearCourierBusinessId && order.courierBusinessId
        ? (await client.query<{ owner_user_id: string }>(
            `SELECT owner_user_id FROM business_profiles WHERE id=$1`,
            [order.courierBusinessId],
          )).rows[0]?.owner_user_id
        : undefined;
      const promoClaims = await client.query<{ id: string; status: "applied" | "redeemed" | "released" }>(
        `SELECT claim.id,claim.status FROM food_promo_claims claim
         JOIN food_promo_codes promo ON promo.id=claim.promo_id
         WHERE claim.order_id=$1 FOR UPDATE OF promo,claim`,
        [order.id],
      );
      if (options.eligibleCourierBusinessId) {
        await client.query(
          `SELECT id FROM media_assets
           WHERE owner_type='business_profile' AND owner_id=$1
             AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
           ORDER BY id FOR UPDATE`,
          [options.eligibleCourierBusinessId],
        );
      }
      const result = await client.query(
        `UPDATE fulfillment_orders SET status=$3,delivery_fee=COALESCE($4,delivery_fee),total=CASE WHEN $4::numeric IS NOT NULL THEN subtotal-discount_amount+$4 ELSE total END,courier_business_id=CASE WHEN $9::boolean THEN NULL WHEN $5::text IS NOT NULL THEN $5 ELSE courier_business_id END,pharmacy_review_status=COALESCE($6,pharmacy_review_status),rejection_reason=CASE WHEN $3 IN ('rejected','cancelled') THEN $7 ELSE rejection_reason END,payment_status=CASE WHEN $3='delivered' THEN 'cash_collected' ELSE payment_status END,quoted_at=CASE WHEN $3='quoted' THEN $8 ELSE quoted_at END,confirmed_at=CASE WHEN $2='quoted' AND $3='merchant_confirmed' THEN $8 ELSE confirmed_at END,delivered_at=CASE WHEN $3='delivered' THEN $8 ELSE delivered_at END,closed_at=CASE WHEN $3 IN ('delivered','rejected','cancelled') THEN $8 ELSE closed_at END,updated_at=$8
         WHERE id=$1 AND status=$2
           AND (
             ($13::text='customer' AND customer_user_id=$12)
             OR ($13::text='merchant' AND EXISTS (SELECT 1 FROM business_profiles live_merchant WHERE live_merchant.id=fulfillment_orders.merchant_business_id AND live_merchant.owner_user_id=$12))
             OR ($13::text='courier' AND EXISTS (SELECT 1 FROM business_profiles live_courier WHERE live_courier.id=fulfillment_orders.courier_business_id AND live_courier.owner_user_id=$12))
           )
           AND ($11::text IS NULL OR courier_business_id=$11)
           AND ($10::text IS NULL OR (
             (($5::text IS NOT NULL AND $5=$10) OR ($5::text IS NULL AND courier_business_id=$10))
             AND EXISTS (
             SELECT 1 FROM business_profiles eligible
             WHERE eligible.id=$10 AND eligible.category_code='delivery_courier'
               AND eligible.city_code=(SELECT merchant.city_code FROM business_profiles merchant WHERE merchant.id=fulfillment_orders.merchant_business_id)
               AND eligible.visibility='public' AND eligible.status='active'
               AND (NOT $14::boolean OR eligible.availability='available')
               AND eligible.trust_status='approved' AND eligible.moderation_status='approved'
               AND NOT EXISTS (
                 SELECT 1 FROM fulfillment_orders active_job
                 WHERE active_job.courier_business_id=eligible.id
                   AND active_job.id<>fulfillment_orders.id
                   AND active_job.status IN ('courier_assigned','courier_accepted','ready_for_pickup','picked_up')
               )
               AND (SELECT COUNT(*) FROM (
                 SELECT DISTINCT ON (document_type) document_type,status
                 FROM mobility_document_reviews WHERE business_profile_id=eligible.id
                   AND document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
                 ORDER BY document_type,created_at DESC,media_asset_id DESC
               ) latest WHERE latest.status='approved')=4
             )
           ))
         RETURNING id`,
        [order.id, order.status, next, options.deliveryFee ?? null, options.courierBusinessId ?? null, options.pharmacyReviewStatus ?? null, options.reason ?? null, now, options.clearCourierBusinessId ?? false, options.eligibleCourierBusinessId ?? null, options.expectedCourierBusinessId ?? null, actor, options.authority ?? null, options.requireCourierAvailability ?? true],
      );
      if (!result.rowCount) return false;
      if (options.clearCourierBusinessId) {
        await client.query(
          `DELETE FROM fulfillment_order_location_updates WHERE order_id=$1`,
          [order.id],
        );
      }
      if (order.discountAmount > 0) {
        const claim = promoClaims.rows[0];
        if (!claim) throw new Error("FOOD_PROMOTION_CLAIM_MISSING");
        if (next === "cancelled" || next === "rejected") {
          if (claim.status !== "released") {
            const released = await client.query(
              `UPDATE food_promo_claims
               SET status='released',redeemed_at=NULL,released_at=$2
               WHERE id=$1 AND status IN ('applied','redeemed')`,
              [claim.id, now],
            );
            if (released.rowCount !== 1) throw new Error("FOOD_PROMOTION_RELEASE_STATE_INVALID");
          }
        } else if (order.status === "quoted" && next === "merchant_confirmed") {
          const redeemed = await client.query(
            `UPDATE food_promo_claims SET status='redeemed',redeemed_at=$2
             WHERE id=$1 AND status='applied'`,
            [claim.id, now],
          );
          if (redeemed.rowCount !== 1) throw new Error("FOOD_PROMOTION_REDEMPTION_STATE_INVALID");
        }
      }
      const transitionEventId = randomUUID();
      await client.query(
        `INSERT INTO fulfillment_order_events(id,order_id,actor_user_id,from_status,to_status,reason,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [transitionEventId, order.id, actor, order.status, next, options.reason ?? null, now],
      );
      await client.query(
        `INSERT INTO audit_logs(id,event_type,actor_user_id,correlation_id,occurred_at)
         VALUES($1,'fulfillment.order.status_changed',$2,$3,$4)`,
        [randomUUID(), actor, `${order.id}:${order.status}:${next}`, now],
      );
      const parties = await client.query<{ customer_user_id: string; merchant_owner_user_id: string; courier_owner_user_id: string | null; vertical: OrderVertical }>(
        `SELECT o.customer_user_id,merchant.owner_user_id AS merchant_owner_user_id,courier.owner_user_id AS courier_owner_user_id,o.vertical
         FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id
         LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id WHERE o.id=$1`, [order.id],
      );
      const party = parties.rows[0];
      if (party) {
        const [title, body] = options.clearCourierBusinessId
          ? options.authority === 'merchant'
            ? ['تم سحب مهمة التوصيل', 'أعادت المنشأة المهمة لاختيار مندوب آخر.']
            : ['جاري اختيار مندوب آخر', 'اعتذر المندوب الحالي عن المهمة، ويجري إسناد الطلب إلى مندوب آخر.']
          : statusMessages[next];
        const recipients = new Set([party.customer_user_id, party.merchant_owner_user_id, party.courier_owner_user_id, formerCourierOwner].filter((id): id is string => Boolean(id) && id !== actor));
        for (const userId of recipients) await insertNotification(client, { userId, orderId: order.id, status: next, vertical: party.vertical, eventType: 'order.status_changed', title, body, transitionEventId, fromStatus: order.status, reason: options.reason });
      }
      return true;
    });
    return changed ? this.findById(order.id) : undefined;
  }

  async rate(order: FulfillmentOrder, targetType: "merchant" | "courier", score: number, comment?: string) {
    const target = targetType === "merchant" ? order.merchantBusinessId : order.courierBusinessId;
    if (!target) throw new Error("RATING_TARGET_MISSING");
    await this.db.query(
      `INSERT INTO fulfillment_order_ratings(id,order_id,customer_user_id,target_type,target_business_id,score,comment) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), order.id, order.customerUserId, targetType, target, score, comment ?? null],
    );
  }
  async recordLocation(order: FulfillmentOrder, actorUserId: string, latitude: number, longitude: number, accuracy?: number) {
    if (!order.courierBusinessId) return false;
    return this.db.transaction(async (client) => {
      await client.query(`SELECT id FROM business_profiles WHERE id=$1 FOR UPDATE`, [order.courierBusinessId]);
      const result = await client.query<{ id: string }>(
        `INSERT INTO fulfillment_order_location_updates(id,order_id,courier_business_id,latitude,longitude,accuracy_meters,recorded_at)
         SELECT $1,o.id,o.courier_business_id,$5,$6,$7,NOW()
         FROM fulfillment_orders o JOIN business_profiles courier ON courier.id=o.courier_business_id
         WHERE o.id=$2 AND courier.owner_user_id=$3 AND o.courier_business_id=$4
           AND o.status IN ('courier_accepted','ready_for_pickup','picked_up')
         ON CONFLICT (order_id) DO UPDATE SET courier_business_id=EXCLUDED.courier_business_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,recorded_at=EXCLUDED.recorded_at
         RETURNING id`,
        [randomUUID(), order.id, actorUserId, order.courierBusinessId, latitude, longitude, accuracy ?? null],
      );
      return result.rowCount === 1;
    });
  }
  async trackingForActor(orderId: string, actorUserId: string) {
    const [row] = await this.db.query<{ status: OrderStatus; authorized: boolean; latitude: string | null; longitude: string | null; accuracy_meters: string | null; recorded_at: Date | null; } & Record<string, unknown>>(
      `SELECT o.status,
         COALESCE(o.customer_user_id=$2 OR merchant.owner_user_id=$2 OR courier.owner_user_id=$2,false) AS authorized,
         location.latitude,location.longitude,location.accuracy_meters,location.recorded_at
       FROM fulfillment_orders o
       JOIN business_profiles merchant ON merchant.id=o.merchant_business_id
       LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id
       LEFT JOIN LATERAL (
         SELECT latitude,longitude,accuracy_meters,recorded_at
         FROM fulfillment_order_location_updates WHERE order_id=o.id
           AND courier_business_id=o.courier_business_id
       ) location ON o.status IN ('courier_accepted','ready_for_pickup','picked_up')
         AND (o.customer_user_id=$2 OR merchant.owner_user_id=$2 OR courier.owner_user_id=$2)
       WHERE o.id=$1`, [orderId, actorUserId],
    );
    if (!row) return undefined;
    return {
      status: row.status,
      authorized: row.authorized,
      location: row.latitude === null || row.longitude === null || row.recorded_at === null ? undefined : {
        latitude: Number(row.latitude), longitude: Number(row.longitude),
        accuracyMeters: row.accuracy_meters === null ? undefined : Number(row.accuracy_meters),
        recordedAt: row.recorded_at.toISOString(),
      },
    };
  }
}

function map(r: OrderRow, items: OrderItem[], events: FulfillmentOrderEvent[]): FulfillmentOrder {
  return {
    id: r.id,
    customerUserId: r.customer_user_id,
    merchantBusinessId: r.merchant_business_id,
    merchantOwnerUserId: r.merchant_owner_user_id,
    merchantName: r.merchant_name,
    pickupAddress: r.pickup_address ?? undefined,
    merchantPhone: r.merchant_phone ?? undefined,
    courierBusinessId: r.courier_business_id ?? undefined,
    courierOwnerUserId: r.courier_owner_user_id ?? undefined,
    courierName: r.courier_name ?? undefined,
    courierPhone: r.courier_phone ?? undefined,
    vertical: r.vertical,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    currency: r.currency,
    subtotal: Number(r.subtotal),
    promoCode: r.promo_code ?? undefined,
    discountAmount: Number(r.discount_amount),
    deliveryFee: r.delivery_fee === null ? undefined : Number(r.delivery_fee),
    total: r.total === null ? undefined : Number(r.total),
    deliveryAddress: r.delivery_address,
    customerPhone: r.customer_phone,
    deliveryLatitude: r.delivery_latitude === null ? undefined : Number(r.delivery_latitude),
    deliveryLongitude: r.delivery_longitude === null ? undefined : Number(r.delivery_longitude),
    customerNote: r.customer_note ?? undefined,
    prescriptionAttested: r.prescription_attested,
    pharmacyReviewStatus: r.pharmacy_review_status,
    rejectionReason: r.rejection_reason ?? undefined,
    items,
    events,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
