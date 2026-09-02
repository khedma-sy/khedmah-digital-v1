export type OrderVertical = "food" | "grocery" | "pharmacy";
export type OrderStatus =
  | "placed"
  | "quoted"
  | "merchant_confirmed"
  | "courier_assigned"
  | "courier_accepted"
  | "ready_for_pickup"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "cancelled";

export interface OrderItem {
  readonly productListingId: string;
  readonly titleAr: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly requiresPrescription: boolean;
}

export interface FulfillmentOrder {
  readonly id: string;
  readonly customerUserId: string;
  readonly merchantBusinessId: string;
  readonly merchantOwnerUserId?: string;
  readonly merchantName?: string;
  readonly courierBusinessId?: string;
  readonly courierOwnerUserId?: string;
  readonly courierName?: string;
  readonly vertical: OrderVertical;
  readonly status: OrderStatus;
  readonly paymentMethod: "cash";
  readonly paymentStatus: "pending" | "cash_collected";
  readonly currency: "SYP" | "USD";
  readonly subtotal: number;
  readonly deliveryFee?: number;
  readonly total?: number;
  readonly deliveryAddress: string;
  readonly customerPhone: string;
  readonly deliveryLatitude?: number;
  readonly deliveryLongitude?: number;
  readonly customerNote?: string;
  readonly prescriptionAttested: boolean;
  readonly pharmacyReviewStatus:
    "not_required" | "pending" | "approved" | "rejected";
  readonly rejectionReason?: string;
  readonly items: readonly OrderItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicFulfillmentOrder = Omit<
  FulfillmentOrder,
  "customerUserId" | "merchantOwnerUserId" | "courierOwnerUserId"
>;
