export interface RestaurantCartItem {
  readonly productId: string;
  readonly quantity: number;
}

export interface RestaurantCart {
  readonly businessProfileId: string;
  readonly items: readonly RestaurantCartItem[];
}

const key = (businessProfileId: string) =>
  `khedmah:restaurant-cart:${businessProfileId}`;

export function readRestaurantCart(businessProfileId: string): RestaurantCart {
  if (typeof window === "undefined") return { businessProfileId, items: [] };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(key(businessProfileId)) ?? "{}",
    ) as Partial<RestaurantCart>;
    if (
      parsed.businessProfileId !== businessProfileId ||
      !Array.isArray(parsed.items)
    )
      throw new Error("invalid cart");
    const items = parsed.items
      .filter(
        (item): item is RestaurantCartItem =>
          Boolean(item) &&
          typeof item.productId === "string" &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 50,
      )
      .slice(0, 20);
    return { businessProfileId, items };
  } catch {
    return { businessProfileId, items: [] };
  }
}

export function writeRestaurantCart(cart: RestaurantCart): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key(cart.businessProfileId),
    JSON.stringify(cart),
  );
}

export function clearRestaurantCart(businessProfileId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(businessProfileId));
}

export function changeRestaurantCartItem(
  cart: RestaurantCart,
  productId: string,
  change: number,
): RestaurantCart {
  const current =
    cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
  const quantity = Math.max(0, Math.min(50, current + change));
  const other = cart.items.filter((item) => item.productId !== productId);
  const items = quantity ? [...other, { productId, quantity }] : other;
  if (items.length > 20) return cart;
  return { ...cart, items };
}
