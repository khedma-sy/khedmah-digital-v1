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

function safeText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is invalid.`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} is invalid.`);
  return text;
}

export async function sendRestaurantPush(
  messaging: FirebaseMessagingPort,
  input: RestaurantPushMessage,
): Promise<{ messageId: string }> {
  const token = safeText(input.token, 'token', 4096);
  const title = safeText(input.title, 'title', 120);
  const body = safeText(input.body, 'body', 500);
  const orderId = safeText(input.orderId, 'orderId', 100);
  const status = safeText(input.status, 'status', 64);

  const messageId = await messaging.send({
    token,
    notification: { title, body },
    data: {
      orderId,
      status,
      vertical: 'food',
    },
    webpush: {
      fcmOptions: { link: `/orders/merchant?orderId=${encodeURIComponent(orderId)}` },
    },
  });
  if (typeof messageId !== 'string' || !messageId.trim()) throw new Error('Push sender returned an invalid message id.');
  return { messageId: messageId.trim() };
}
