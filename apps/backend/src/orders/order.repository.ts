import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabasePool } from "../database/database.pool";
import type {
  FulfillmentOrder,
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
  courier_business_id: string | null;
  courier_owner_user_id: string | null;
  courier_name: string | null;
  vertical: OrderVertical;
  status: OrderStatus;
  payment_method: "cash";
  payment_status: "pending" | "cash_collected";
  currency: "SYP" | "USD";
  subtotal: string;
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
interface ItemRow extends Record<string, unknown> {
  order_id: string;
  product_listing_id: string;
  title_ar: string;
  unit_price: string;
  quantity: number;
  requires_prescription: boolean;
}

const projection = `o.*, merchant.owner_user_id AS merchant_owner_user_id, merchant.name AS merchant_name,
 courier.owner_user_id AS courier_owner_user_id, courier.name AS courier_name`;

@Injectable()
export class OrderRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async findProducts(ids: readonly string[]): Promise<ProductOrderRow[]> {
    return this.db.query<ProductOrderRow>(
      `SELECT p.id,p.business_profile_id,p.owner_user_id,b.name AS business_name,b.category_code AS business_category_code,p.title_ar,p.price,p.currency,p.availability,p.status,p.moderation_status,p.requires_prescription,p.controlled_item FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.id = ANY($1::text[])`,
      [ids],
    );
  }

  async create(
    order: FulfillmentOrder,
    idempotencyKey: string,
  ): Promise<FulfillmentOrder> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO fulfillment_orders (id,customer_user_id,merchant_business_id,vertical,status,payment_method,payment_status,currency,subtotal,delivery_address,customer_phone,delivery_latitude,delivery_longitude,customer_note,prescription_attested,pharmacy_review_status,idempotency_key,created_at,updated_at) VALUES ($1,$2,$3,$4,'placed','cash','pending',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
        [
          order.id,
          order.customerUserId,
          order.merchantBusinessId,
          order.vertical,
          order.currency,
          order.subtotal,
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
          [
            randomUUID(),
            order.id,
            item.productListingId,
            item.titleAr,
            item.unitPrice,
            item.quantity,
            item.requiresPrescription,
          ],
        );
      await client.query(
        `INSERT INTO fulfillment_order_events (id,order_id,actor_user_id,from_status,to_status,occurred_at) VALUES ($1,$2,$3,NULL,'placed',$4)`,
        [randomUUID(), order.id, order.customerUserId, order.createdAt],
      );
    });
    return (await this.findById(order.id))!;
  }

  async findById(id: string): Promise<FulfillmentOrder | undefined> {
    const [row] = await this.db.query<OrderRow>(
      `SELECT ${projection} FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id WHERE o.id=$1`,
      [id],
    );
    if (!row) return undefined;
    const items = await this.itemsFor([id]);
    return map(row, items.get(id) ?? []);
  }
  async findIdempotent(customer: string, key: string) {
    const [row] = await this.db.query<{ id: string } & Record<string, unknown>>(
      `SELECT id FROM fulfillment_orders WHERE customer_user_id=$1 AND idempotency_key=$2`,
      [customer, key],
    );
    return row ? this.findById(row.id) : undefined;
  }
  async listForCustomer(id: string) {
    return this.list(`o.customer_user_id=$1`, [id]);
  }
  async listForMerchant(id: string) {
    return this.list(`o.merchant_business_id=$1`, [id]);
  }
  async listForCourier(id: string) {
    return this.list(`o.courier_business_id=$1`, [id]);
  }
  private async list(where: string, params: unknown[]) {
    const rows = await this.db.query<OrderRow>(
      `SELECT ${projection} FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,
      params,
    );
    const items = await this.itemsFor(rows.map((r) => r.id));
    return rows.map((r) => map(r, items.get(r.id) ?? []));
  }
  private async itemsFor(ids: string[]) {
    const grouped = new Map<string, OrderItem[]>();
    if (!ids.length) return grouped;
    const rows = await this.db.query<ItemRow>(
      `SELECT order_id,product_listing_id,title_ar,unit_price,quantity,requires_prescription FROM fulfillment_order_items WHERE order_id=ANY($1::text[]) ORDER BY id`,
      [ids],
    );
    for (const r of rows) {
      const value = {
        productListingId: r.product_listing_id,
        titleAr: r.title_ar,
        unitPrice: Number(r.unit_price),
        quantity: r.quantity,
        requiresPrescription: r.requires_prescription,
      };
      grouped.set(r.order_id, [...(grouped.get(r.order_id) ?? []), value]);
    }
    return grouped;
  }

  async transition(
    order: FulfillmentOrder,
    next: OrderStatus,
    actor: string,
    options: {
      deliveryFee?: number;
      courierBusinessId?: string;
      reason?: string;
      pharmacyReviewStatus?: FulfillmentOrder["pharmacyReviewStatus"];
    } = {},
  ): Promise<FulfillmentOrder | undefined> {
    const now = new Date().toISOString();
    const changed = await this.db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE fulfillment_orders SET status=$3,delivery_fee=COALESCE($4,delivery_fee),total=CASE WHEN $4::numeric IS NOT NULL THEN subtotal+$4 ELSE total END,courier_business_id=CASE WHEN $5::text IS NOT NULL THEN $5 ELSE courier_business_id END,pharmacy_review_status=COALESCE($6,pharmacy_review_status),rejection_reason=CASE WHEN $3 IN ('rejected','cancelled') THEN $7 ELSE rejection_reason END,payment_status=CASE WHEN $3='delivered' THEN 'cash_collected' ELSE payment_status END,quoted_at=CASE WHEN $3='quoted' THEN $8 ELSE quoted_at END,confirmed_at=CASE WHEN $3='merchant_confirmed' THEN $8 ELSE confirmed_at END,delivered_at=CASE WHEN $3='delivered' THEN $8 ELSE delivered_at END,closed_at=CASE WHEN $3 IN ('delivered','rejected','cancelled') THEN $8 ELSE closed_at END,updated_at=$8 WHERE id=$1 AND status=$2 RETURNING id`,
        [
          order.id,
          order.status,
          next,
          options.deliveryFee ?? null,
          options.courierBusinessId ?? null,
          options.pharmacyReviewStatus ?? null,
          options.reason ?? null,
          now,
        ],
      );
      if (!result.rowCount) return false;
      await client.query(
        `INSERT INTO fulfillment_order_events(id,order_id,actor_user_id,from_status,to_status,reason,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          order.id,
          actor,
          order.status,
          next,
          options.reason ?? null,
          now,
        ],
      );
      return true;
    });
    return changed ? this.findById(order.id) : undefined;
  }

  async rate(
    order: FulfillmentOrder,
    targetType: "merchant" | "courier",
    score: number,
    comment?: string,
  ) {
    const target =
      targetType === "merchant"
        ? order.merchantBusinessId
        : order.courierBusinessId;
    if (!target) throw new Error("RATING_TARGET_MISSING");
    await this.db.query(
      `INSERT INTO fulfillment_order_ratings(id,order_id,customer_user_id,target_type,target_business_id,score,comment) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        order.id,
        order.customerUserId,
        targetType,
        target,
        score,
        comment ?? null,
      ],
    );
  }
  async recordLocation(
    order: FulfillmentOrder,
    latitude: number,
    longitude: number,
    accuracy?: number,
  ) {
    await this.db.query(
      `INSERT INTO fulfillment_order_location_updates(id,order_id,courier_business_id,latitude,longitude,accuracy_meters,recorded_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (order_id) DO UPDATE SET courier_business_id=EXCLUDED.courier_business_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_meters=EXCLUDED.accuracy_meters,recorded_at=EXCLUDED.recorded_at`,
      [
        randomUUID(),
        order.id,
        order.courierBusinessId,
        latitude,
        longitude,
        accuracy ?? null,
      ],
    );
  }
  async latestLocation(orderId: string) {
    const [row] = await this.db.query<
      {
        latitude: string;
        longitude: string;
        accuracy_meters: string | null;
        recorded_at: Date;
      } & Record<string, unknown>
    >(
      `SELECT latitude,longitude,accuracy_meters,recorded_at FROM fulfillment_order_location_updates WHERE order_id=$1 ORDER BY recorded_at DESC LIMIT 1`,
      [orderId],
    );
    return row
      ? {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          accuracyMeters:
            row.accuracy_meters === null
              ? undefined
              : Number(row.accuracy_meters),
          recordedAt: row.recorded_at.toISOString(),
        }
      : undefined;
  }
}

function map(r: OrderRow, items: OrderItem[]): FulfillmentOrder {
  return {
    id: r.id,
    customerUserId: r.customer_user_id,
    merchantBusinessId: r.merchant_business_id,
    merchantOwnerUserId: r.merchant_owner_user_id,
    merchantName: r.merchant_name,
    courierBusinessId: r.courier_business_id ?? undefined,
    courierOwnerUserId: r.courier_owner_user_id ?? undefined,
    courierName: r.courier_name ?? undefined,
    vertical: r.vertical,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    currency: r.currency,
    subtotal: Number(r.subtotal),
    deliveryFee: r.delivery_fee === null ? undefined : Number(r.delivery_fee),
    total: r.total === null ? undefined : Number(r.total),
    deliveryAddress: r.delivery_address,
    customerPhone: r.customer_phone,
    deliveryLatitude:
      r.delivery_latitude === null ? undefined : Number(r.delivery_latitude),
    deliveryLongitude:
      r.delivery_longitude === null ? undefined : Number(r.delivery_longitude),
    customerNote: r.customer_note ?? undefined,
    prescriptionAttested: r.prescription_attested,
    pharmacyReviewStatus: r.pharmacy_review_status,
    rejectionReason: r.rejection_reason ?? undefined,
    items,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
