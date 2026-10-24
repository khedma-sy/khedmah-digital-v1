export interface RestaurantPushMessage {
  token: string;
  title: string;
  body: string;
  orderId: string;
  status: string;
}

export interface FirebaseMessagingPort {
  send(message: unknown): Promise<string>;
}

function safeText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`${field} is invalid.`);
  return text;
}

export interface RestaurantPushSendOptions {
  /**
   * A trusted, deployment-configured HTTPS origin for the merchant frontend.
   * Never populate this from the incoming request's Host or user-supplied URLs.
   * Without an approved origin, omit the FCM click link rather than sending a relative URL.
   */
  webAppOrigin?: string | null;
}

function secureMerchantLink(origin: string | null | undefined, orderId: string): string | undefined {
  if (!origin?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(origin.trim());
  } catch {
    throw new Error('Restaurant push webAppOrigin must be an HTTPS origin.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Restaurant push webAppOrigin must be an HTTPS origin.');
  }
  const link = new URL('/orders/merchant', parsed.origin);
  link.searchParams.set('orderId', orderId);
  return link.toString();
}

export async function sendRestaurantPush(
  messaging: FirebaseMessagingPort,
  input: RestaurantPushMessage,
  options: RestaurantPushSendOptions = {},
): Promise<{ messageId: string }> {
  const token = safeText(input.token, 'token', 20, 4096);
  const title = safeText(input.title, 'title', 1, 120);
  const body = safeText(input.body, 'body', 1, 500);
  const orderId = safeText(input.orderId, 'orderId', 1, 100);
  const status = safeText(input.status, 'status', 1, 64);

  const clickLink = secureMerchantLink(options.webAppOrigin, orderId);

  const messageId = await messaging.send({
    token,
    notification: { title, body },
    data: {
      orderId,
      status,
      vertical: 'food',
    },
    ...(clickLink ? { webpush: { fcmOptions: { link: clickLink } } } : {}),
  });
  if (typeof messageId !== 'string' || !messageId.trim()) throw new Error('Push sender returned an invalid message id.');
  return { messageId: messageId.trim() };
}
