import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BusinessProfileRepository } from "../business-profiles/business-profile.repository";
import { IdentityService } from "../identity/identity.service";
import { readSessionToken } from "../identity/session-cookie";
import { OrderRepository } from "./order.repository";
import type {
  FulfillmentOrder,
  OrderStatus,
  OrderVertical,
  PublicFulfillmentOrder,
} from "./order.types";
import {
  validateCreateOrder,
  validateIdempotency,
  validateOrderAction,
} from "./order.validation";

const food = new Set(["restaurant", "cafe", "bakery", "sweets", "catering", "juice_icecream"]);
const grocery = new Set(["butcher", "grocery", "fruits_vegetables", "fish_poultry_shop"]);
const customerTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  placed: ["cancelled"],
  quoted: ["merchant_confirmed", "cancelled"],
};

@Injectable()
export class OrderService {
  constructor(
    @Inject(OrderRepository) private readonly repo: OrderRepository,
    @Inject(BusinessProfileRepository) private readonly businesses: BusinessProfileRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  async create(cookie: string | undefined, value: Record<string, unknown>, keyValue: unknown): Promise<PublicFulfillmentOrder> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateCreateOrder(value);
    const key = validateIdempotency(keyValue);
    const matchesRequest = (candidate: FulfillmentOrder) => {
      const sameItems = candidate.items.length === input.items.length && candidate.items.every((item) => input.items.some((requested) => requested.productListingId === item.productListingId && requested.quantity === item.quantity));
      return sameItems
        && candidate.deliveryAddress === input.deliveryAddress
        && candidate.customerPhone === input.customerPhone
        && candidate.deliveryLatitude === input.deliveryLatitude
        && candidate.deliveryLongitude === input.deliveryLongitude
        && candidate.customerNote === input.customerNote
        && candidate.prescriptionAttested === input.prescriptionAttested;
    };
    const prior = await this.repo.findIdempotent(actor.id, key);
    if (prior) {
      if (!matchesRequest(prior)) {
        throw new BadRequestException("Idempotency-Key was already used for a different order.");
      }
      return expose(prior, "customer");
    }
    const products = await this.repo.findProducts(input.items.map((i) => i.productListingId));
    if (products.length !== input.items.length) throw new BadRequestException("One or more products are unavailable.");
    const merchantId = products[0]!.business_profile_id;
    const currency = products[0]!.currency;
    if (products.some((p) => p.business_profile_id !== merchantId || p.currency !== currency || p.status !== "active" || p.moderation_status !== "approved" || p.availability === "out_of_stock")) {
      throw new BadRequestException("All items must be available from one approved merchant and use one currency.");
    }
    if (products.some((p) => p.controlled_item)) throw new BadRequestException("Controlled pharmacy items cannot be ordered through the platform.");
    const category = products[0]!.business_category_code;
    const vertical: OrderVertical = category === "pharmacy" ? "pharmacy" : food.has(category) ? "food" : grocery.has(category) ? "grocery" : (() => { throw new BadRequestException("This merchant category is not enabled for cash fulfillment."); })();
    const itemMap = new Map(input.items.map((i) => [i.productListingId, i.quantity]));
    const items = products.map((p) => ({
      productListingId: p.id,
      titleAr: p.title_ar,
      unitPrice: Number(p.price),
      quantity: itemMap.get(p.id)!,
      requiresPrescription: p.requires_prescription,
    }));
    const prescription = items.some((i) => i.requiresPrescription);
    if (prescription && !input.prescriptionAttested) throw new BadRequestException("Prescription attestation is required; pharmacist approval remains mandatory.");
    const now = new Date().toISOString();
    const order: FulfillmentOrder = {
      id: randomUUID(), customerUserId: actor.id, merchantBusinessId: merchantId, merchantName: products[0]!.business_name,
      vertical, status: "placed", paymentMethod: "cash", paymentStatus: "pending", currency,
      subtotal: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), deliveryAddress: input.deliveryAddress,
      customerPhone: input.customerPhone, deliveryLatitude: input.deliveryLatitude, deliveryLongitude: input.deliveryLongitude,
      customerNote: input.customerNote, prescriptionAttested: input.prescriptionAttested,
      pharmacyReviewStatus: vertical === "pharmacy" ? "pending" : "not_required", items, createdAt: now, updatedAt: now,
    };
    try {
      const created = await this.repo.create(order, key);
      return expose(created, "customer");
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") {
        const winner = await this.repo.findIdempotent(actor.id, key);
        if (winner) {
          if (!matchesRequest(winner)) throw new BadRequestException("Idempotency-Key was already used for a different order.");
          return expose(winner, "customer");
        }
      }
      throw error;
    }
  }

  async mine(cookie: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return (await this.repo.listForCustomer(actor.id)).map((order) => expose(order, "customer"));
  }
  async merchant(cookie: string | undefined, businessId: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const b = await this.businesses.findById(businessId);
    if (!b || b.ownerUserId !== actor.id) throw new ForbiddenException("Access denied.");
    return (await this.repo.listForMerchant(businessId, actor.id)).map((order) => expose(order, "merchant"));
  }
  async eligibleCouriers(cookie: string | undefined, businessId: string, pageValue?: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const b = await this.businesses.findById(businessId);
    if (!b || b.ownerUserId !== actor.id || !(food.has(b.categoryCode) || grocery.has(b.categoryCode) || b.categoryCode === 'pharmacy')) throw new ForbiddenException('Access denied.');
    const page = pageValue === undefined ? 1 : Number(pageValue);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BadRequestException('page is invalid.');
    return this.repo.eligibleCouriers(b.cityCode, page);
  }
  async courier(cookie: string | undefined, businessId: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const b = await this.businesses.findById(businessId);
    if (!b || b.ownerUserId !== actor.id || b.categoryCode !== "delivery_courier") throw new ForbiddenException("Access denied.");
    return (await this.repo.listForCourier(businessId, actor.id)).map((order) => expose(order, "courier"));
  }

  async transition(cookie: string | undefined, id: string, value: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const action = validateOrderAction(value);
    const o = await this.repo.findById(id);
    if (!o) throw new NotFoundException("Order was not found.");
    const customer = o.customerUserId === actor.id;
    const merchant = o.merchantOwnerUserId === actor.id;
    const courier = o.courierOwnerUserId === actor.id;
    let options: Parameters<OrderRepository["transition"]>[3] = {};
    if (customer) {
      options = { authority: "customer" };
      if (!customerTransitions[o.status]?.includes(action.status)) throw new BadRequestException("Customer transition is not allowed.");
    } else if (merchant) {
      options = { authority: "merchant" };
      if (o.status === "placed" && action.status === "quoted") {
        if (action.deliveryFee === undefined) throw new BadRequestException("deliveryFee is required.");
        if (o.vertical === "pharmacy" && !action.pharmacyApproved) throw new BadRequestException("Pharmacist approval is required.");
        options = { ...options, deliveryFee: action.deliveryFee, pharmacyReviewStatus: o.vertical === "pharmacy" ? "approved" : "not_required" };
      } else if (o.status === "merchant_confirmed" && action.status === "courier_assigned") {
        if (!action.courierBusinessId) throw new BadRequestException("courierBusinessId is required.");
        const eligibility = await this.assertCourierEligible(action.courierBusinessId, o.merchantBusinessId);
        options = { ...options, courierBusinessId: action.courierBusinessId, ...eligibility };
      } else if (o.status === "courier_accepted" && action.status === "ready_for_pickup") {
      } else if (["placed", "quoted"].includes(o.status) && action.status === "rejected") {
        if (!action.reason) throw new BadRequestException("reason is required.");
        options = { ...options, reason: action.reason, pharmacyReviewStatus: o.vertical === "pharmacy" ? "rejected" : o.pharmacyReviewStatus };
      } else throw new BadRequestException("Merchant transition is not allowed.");
    } else if (courier) {
      options = { authority: "courier", expectedCourierBusinessId: o.courierBusinessId };
      if (o.status === "courier_assigned" && action.status === "courier_accepted") {
        options = { ...options, ...await this.assertCourierEligible(o.courierBusinessId, o.merchantBusinessId) };
      } else if (o.status === "courier_assigned" && action.status === "merchant_confirmed") {
        options = { ...options, reason: action.reason ?? "Courier declined", clearCourierBusinessId: true };
      } else if (o.status === "ready_for_pickup" && action.status === "picked_up") {
        options = { ...options, ...await this.assertCourierEligible(o.courierBusinessId, o.merchantBusinessId) };
      } else if (o.status === "picked_up" && action.status === "delivered") {
      } else throw new BadRequestException("Courier transition is not allowed.");
    } else throw new ForbiddenException("Access denied.");

    const updated = await this.repo.transition(o, action.status, actor.id, options);
    if (!updated) throw new BadRequestException("Order changed; refresh and retry.");
    return expose(updated, customer ? "customer" : merchant ? "merchant" : "courier");
  }

  private async assertCourierEligible(businessId: string | undefined, merchantBusinessId: string) {
    const [courier, merchant] = await Promise.all([
      businessId ? this.businesses.findById(businessId) : undefined,
      this.businesses.findById(merchantBusinessId),
    ]);
    if (!courier || !merchant || courier.categoryCode !== "delivery_courier" || courier.cityCode !== merchant.cityCode || courier.visibility !== "public" || courier.trustStatus !== "approved" || courier.moderationStatus !== "approved" || courier.status !== "active" || await this.repo.countApprovedMobilityDocuments(courier.id) !== 4) {
      throw new BadRequestException("Courier is not eligible.");
    }
    return { eligibleCourierBusinessId: courier.id };
  }

  async rate(cookie: string | undefined, id: string, value: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException("Order was not found.");
    if (order.customerUserId !== actor.id) throw new ForbiddenException("Only the order customer can rate it.");
    if (order.status !== "delivered") throw new BadRequestException("Ratings are available only after delivery.");
    if (value.targetType !== "merchant" && value.targetType !== "courier") throw new BadRequestException("targetType is invalid.");
    const score = Number(value.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new BadRequestException("score must be between 1 and 5.");
    const comment = value.comment === undefined ? undefined : String(value.comment).trim();
    if (comment && comment.length > 500) throw new BadRequestException("comment is too long.");
    try {
      await this.repo.rate(order, value.targetType, score, comment || undefined);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505") throw new BadRequestException("This order target was already rated.");
      throw error;
    }
  }

  async location(cookie: string | undefined, id: string, value: Record<string, unknown>) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException("Order was not found.");
    if (order.courierOwnerUserId !== actor.id) throw new ForbiddenException("Only the assigned courier can share location.");
    if (!["courier_accepted", "ready_for_pickup", "picked_up"].includes(order.status)) throw new BadRequestException("Location sharing is not active for this order.");
    const latitude = Number(value.latitude), longitude = Number(value.longitude), accuracy = value.accuracy === undefined ? undefined : Number(value.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000))) {
      throw new BadRequestException("Location is invalid.");
    }
    if (!await this.repo.recordLocation(order, actor.id, latitude, longitude, accuracy)) throw new BadRequestException("Order changed; refresh and retry.");
  }

  async tracking(cookie: string | undefined, id: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const tracking = await this.repo.trackingForActor(id, actor.id);
    if (!tracking) throw new NotFoundException("Order was not found.");
    if (!tracking.authorized) throw new ForbiddenException("Access denied.");
    return { status: tracking.status, location: tracking.location };
  }
}

function expose(o: FulfillmentOrder, viewer: "customer" | "merchant" | "courier"): PublicFulfillmentOrder {
  const { customerUserId: _c, merchantOwnerUserId: _m, courierOwnerUserId: _d, ...result } = o;
  const safe: Record<string, unknown> = { ...result };
  const accepted = ["courier_accepted", "ready_for_pickup", "picked_up", "delivered"].includes(o.status);
  if (viewer !== "merchant") delete safe.customerPhone;
  if (viewer === "courier" && accepted) safe.customerPhone = o.customerPhone;
  if (!accepted || viewer === "merchant") delete safe.courierPhone;
  if (viewer !== "courier") delete safe.merchantPhone;
  return safe as PublicFulfillmentOrder;
}
