/**
 * Khedmah journey domain. All authoritative policy, actor, clock, evidence and
 * persistence ports are injected. The bundled browser application is simulation
 * only: never trust its actors, policy, memory store, totals or proof in production.
 */
export type Kind = 'food' | 'delivery' | 'taxi' | 'roadside';
export type Role = 'customer' | 'merchant' | 'courier' | 'driver' | 'technician' | 'operator';
export type Method = 'courier' | 'merchant' | 'pickup';
export type Phase = 'submitted' | 'accepted' | 'preparing' | 'ready' | 'handed_over' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';
export type DeliveryPhase = 'not_requested' | 'requested' | 'assigned' | 'at_pickup' | 'in_transit' | 'at_destination' | 'delivered' | 'cancelled';
export interface Actor { id: string; role: Role }
export interface Address { area: string; detail: string; latitude?: number; longitude?: number }
export interface Item { id: string; merchantId: string; title: string; priceMinor: number; available: boolean; version: number }
export interface Provider { id: string; role: Role; merchantId?: string; verified: boolean; active: boolean; zone: string; kinds: Kind[] }
export interface Policy {
  id: string; currency: string; zone: string; maxParcelKg: number; quoteTtlMs: number;
  foodDeliveryMinor: number; parcelBaseMinor: number; parcelPerKmMinor: number;
  taxiBaseMinor: number; taxiPerKmMinor: number; taxiWaitPerMinuteMinor: number; taxiMinimumMinor: number;
  roadsideInspectionMinor: number; maxAmountMinor: number;
}
export interface QuoteRequest {
  kind: Kind; zone: string; pickup: Address; dropoff?: Address; method?: Method;
  items?: { id: string; quantity: number }[]; parcelKg?: number;
  parcelType?: 'documents' | 'sealed_food' | 'general_goods'; roadsideType?: 'battery' | 'tire' | 'tow';
}
export interface TrustedRoute { distanceMeters: number; verified: boolean; reference?: { id: string; revision: string; source: string; expiresAt: number } }
export interface TaxiAssignment { vehicleId: string; driverRevision: string; vehicleRevision: string }
export interface Quote {
  id: string; customerId: string; kind: Kind; currency: string; policyId: string;
  request: QuoteRequest; fingerprint: string; merchantId?: string;
  lines: { id: string; title: string; quantity: number; unitMinor: number; version: number }[];
  subtotalMinor: number; deliveryMinor: number; totalMinor: number;
  farePolicy?: Pick<Policy, 'taxiBaseMinor' | 'taxiPerKmMinor' | 'taxiWaitPerMinuteMinor' | 'taxiMinimumMinor' | 'maxAmountMinor'>;
  routeReference?: TrustedRoute['reference'];
  distanceMeters?: number; expiresAt: number; priceBasis: 'fixed' | 'metered' | 'inspection_only';
}
export interface Issue { id: string; openedBy: string; reason: string; open: boolean }
export interface Order {
  id: string; customerId: string; kind: Kind; merchantId?: string; method: Method;
  phase: Phase; delivery: { state: DeliveryPhase; providerId?: string };
  quote: Quote; version: number; createdAt: number; updatedAt: number;
  cash: { expectedMinor: number; collectedMinor: number; status: 'uncollected' | 'collected' | 'discrepancy' | 'settled' };
  rating?: number; issues: Issue[];
  taxiAssignment?: TaxiAssignment;
  rideStartedAt?: number; rideStartEventId?: string;
}
export type Action = 'accept_food' | 'reject_food' | 'prepare' | 'ready' | 'accept_job' | 'arrive_pickup'
  | 'pickup' | 'arrive_destination' | 'deliver' | 'confirm_pickup' | 'start_ride' | 'finish_ride'
  | 'start_assistance' | 'finish_assistance' | 'cancel' | 'report_issue' | 'resolve_issue'
  | 'record_cash' | 'settle_cash' | 'rate' | 'release_job';
export interface Command { action: Action; expectedVersion: number; requestId: string; amountMinor?: number; rating?: number; reason?: string; issueId?: string }
export interface TrustedEvidence {
  pickupVerified?: boolean; dropoffVerified?: boolean; arrivalVerified?: boolean;
  rideConsentVerified?: boolean; completedWorkVerified?: boolean;
  tripMeters?: number; waitSeconds?: number; meterVerified?: boolean;
}
export interface Event { id: string; orderId: string; version: number; actorId: string; action: string; occurredAt: number }
export class JourneyError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name = 'JourneyError'; }
}
function requireThat(value: unknown, code: string, message: string, status = 400): asserts value {
  if (!value) throw new JourneyError(code, status, message);
}
function text(value: unknown, max: number, field: string): string {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max,
    'INVALID_INPUT', `حقل ${field} غير صالح.`);
  return value.trim();
}
function integer(value: unknown, min: number, max: number, field: string): number {
  requireThat(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max,
    'INVALID_NUMBER', `قيمة ${field} غير صالحة.`);
  return value as number;
}
function object(value: unknown): asserts value is Record<string, unknown> {
  requireThat(!!value && typeof value === 'object' && !Array.isArray(value), 'INVALID_INPUT', 'بيانات الطلب غير صالحة.');
}
function key(value: unknown): string {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value), 'INVALID_KEY', 'مفتاح المحاولة غير صالح.');
  return value;
}
function address(value: unknown): Address {
  object(value);
  const result: Address = { area: text(value.area, 80, 'المنطقة'), detail: text(value.detail, 300, 'العنوان') };
  if (value.latitude !== undefined || value.longitude !== undefined) {
    requireThat(typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
      && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180,
      'INVALID_COORDINATES', 'إحداثيات العنوان غير صالحة.');
    result.latitude = value.latitude; result.longitude = value.longitude;
  }
  return result;
}
/** Integer-only fare arithmetic. Preserve the quote's tariff, never the driver's amount. */
export function taxiFare(policy: NonNullable<Quote['farePolicy']>, meters: number, seconds: number): number {
  integer(meters, 0, 500_000, 'مسافة الرحلة'); integer(seconds, 0, 86_400, 'الانتظار');
  for (const k of ['taxiBaseMinor','taxiPerKmMinor','taxiWaitPerMinuteMinor','taxiMinimumMinor','maxAmountMinor'] as const) integer(policy[k], 0, Number.MAX_SAFE_INTEGER, 'التعرفة');
  const ceil = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;
  const actual = BigInt(policy.taxiBaseMinor) + ceil(BigInt(meters) * BigInt(policy.taxiPerKmMinor), 1000n)
    + ceil(BigInt(seconds) * BigInt(policy.taxiWaitPerMinuteMinor), 60n);
  const total = actual > BigInt(policy.taxiMinimumMinor) ? actual : BigInt(policy.taxiMinimumMinor);
  requireThat(total <= BigInt(policy.maxAmountMinor), 'INVALID_NUMBER', 'الأجرة تتجاوز الحد المعتمد.');
  return Number(total);
}

const terminal = (order: Order) => ['completed', 'cancelled', 'rejected'].includes(order.phase);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined)
    .sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export interface DatabaseState {
  quotes: Record<string, Quote>; orders: Record<string, Order>;
  receipts: Record<string, { fingerprint: string; orderId: string }>;
  consumedQuotes: Record<string, string>;
  events: Event[];
}
export interface Store { transaction<T>(work: (state: DatabaseState) => Promise<T> | T): Promise<T> }
/** Test/simulation adapter. Serializes competing writes and rolls back failed work. */
export class MemoryStore implements Store {
  private state: DatabaseState = { quotes: {}, orders: {}, receipts: {}, consumedQuotes: {}, events: [] };
  private tail: Promise<void> = Promise.resolve();
  async transaction<T>(work: (state: DatabaseState) => Promise<T> | T): Promise<T> {
    const run = this.tail.then(async () => {
      const draft = structuredClone(this.state);
      const result = await work(draft);
      this.state = draft;
      return structuredClone(result);
    });
    this.tail = run.then(() => {}, () => {});
    return run;
  }
}
export interface Ports {
  store: Store; clock: () => number; nextId: () => string;
  policy: () => Policy; menu: () => Item[]; providers: () => Provider[];
}
export class JourneyService {
  constructor(private readonly ports: Ports) {}
  private policy(): Policy {
    const p = this.ports.policy();
    text(p.id, 80, 'نسخة التسعير'); text(p.currency, 8, 'العملة'); text(p.zone, 80, 'النطاق');
    integer(p.maxAmountMinor, 1, Number.MAX_SAFE_INTEGER, 'حد المبلغ');
    integer(p.quoteTtlMs, 1, 3_600_000, 'مدة صلاحية السعر');
    for (const field of ['foodDeliveryMinor','parcelBaseMinor','parcelPerKmMinor','taxiBaseMinor','taxiPerKmMinor','taxiWaitPerMinuteMinor','taxiMinimumMinor','roadsideInspectionMinor'] as const) integer(p[field], 0, p.maxAmountMinor, field);
    requireThat(Number.isFinite(p.maxParcelKg) && p.maxParcelKg > 0, 'INVALID_POLICY', 'إعداد وزن الطرد غير صالح.', 503);
    return p;
  }
  private actor(actor: Actor): void {
    object(actor); text(actor.id, 100, 'الحساب');
    requireThat(['customer','merchant','courier','driver','technician','operator'].includes(actor.role), 'FORBIDDEN', 'الدور غير مخول.', 403);
  }
  private provider(actor: Actor, order: Order, role: Role): Provider {
    requireThat(actor.role === role, 'FORBIDDEN', 'هذا الإجراء غير متاح لدورك.', 403);
    const provider = this.ports.providers().find(p => p.id === actor.id && p.role === role);
    requireThat(provider?.verified && provider.active && provider.zone === order.quote.request.zone
      && provider.kinds.includes(order.kind), 'PROVIDER_NOT_ELIGIBLE', 'مقدم الخدمة غير معتمد أو غير متاح لهذا النطاق.', 403);
    return provider;
  }
  private merchant(actor: Actor, order: Order): void {
    const provider = this.provider(actor, order, 'merchant');
    requireThat(order.kind === 'food' && provider.merchantId === order.merchantId, 'FORBIDDEN', 'هذا الطلب لا يخص مطعمك.', 403);
  }
  private assigned(actor: Actor, order: Order): void {
    const role = order.kind === 'taxi' ? 'driver' : order.kind === 'roadside' ? 'technician'
      : order.kind === 'food' && order.method === 'merchant' ? 'merchant' : 'courier';
    const p = this.provider(actor, order, role);
    requireThat(order.delivery.providerId === actor.id && (role !== 'merchant' || p.merchantId === order.merchantId),
      'FORBIDDEN', 'المهمة ليست مسندة إلى حسابك.', 403);
  }
  private visible(actor: Actor, order: Order): boolean {
    if (actor.role === 'operator') return true;
    if (actor.role === 'customer') return order.customerId === actor.id;
    const provider = this.ports.providers().find(p => p.id === actor.id && p.role === actor.role);
    if (!provider?.verified || !provider.active) return false;
    if (actor.role === 'merchant') return order.kind === 'food' && provider.merchantId === order.merchantId;
    return order.delivery.providerId === actor.id;
  }
  async quote(actor: Actor, value: unknown, route?: TrustedRoute): Promise<Quote> {
    this.actor(actor); requireThat(actor.role === 'customer', 'FORBIDDEN', 'التسعير مخصص للعميل.', 403);
    object(value); const p = this.policy();
    requireThat(['food','delivery','taxi','roadside'].includes(String(value.kind)), 'INVALID_KIND', 'نوع الخدمة غير مدعوم.');
    const kind = value.kind as Kind;
    requireThat(value.zone === p.zone, 'OUTSIDE_COVERAGE', 'هذه المنطقة خارج نطاق التشغيل الحالي.', 422);
    const req: QuoteRequest = { kind, zone: p.zone, pickup: address(value.pickup) };
    if (kind === 'food') {
      requireThat(['courier','merchant','pickup'].includes(String(value.method)), 'INVALID_METHOD', 'اختر طريقة الاستلام.');
      req.method = value.method as Method;
    } else req.method = 'courier';
    if (kind !== 'roadside' && req.method !== 'pickup') req.dropoff = address(value.dropoff);
    if (['taxi','delivery'].includes(kind)) {
      requireThat(canonical(req.pickup) !== canonical(req.dropoff), 'SAME_ADDRESS', 'حدد وجهة مختلفة عن نقطة الانطلاق.');
      requireThat(route?.verified, 'ROUTE_UNAVAILABLE', 'تعذر اعتماد المسافة. لا يمكن تأكيد سعر تخميني.', 503);
      integer(route.distanceMeters, 1, 500_000, 'مسافة الطريق');
    }
    let lines: Quote['lines'] = [], merchantId: string | undefined;
    let subtotal = 0, delivery = 0, basis: Quote['priceBasis'] = 'fixed';
    if (kind === 'food') {
      requireThat(Array.isArray(value.items) && value.items.length >= 1 && value.items.length <= 30, 'EMPTY_CART', 'السلة فارغة أو تتجاوز الحد.');
      const seen = new Set<string>();
      lines = value.items.map(raw => {
        object(raw); const id = text(raw.id, 100, 'الصنف');
        requireThat(!seen.has(id), 'DUPLICATE_ITEM', 'اجمع كمية الصنف في سطر واحد.'); seen.add(id);
        const quantity = integer(raw.quantity, 1, 20, 'الكمية');
        const item = this.ports.menu().find(item => item.id === id);
        requireThat(item?.available, 'ITEM_UNAVAILABLE', 'صنف في سلتك لم يعد متاحًا.', 409);
        integer(item.priceMinor, 0, p.maxAmountMinor, 'سعر الصنف');
        if (!merchantId) merchantId = item.merchantId;
        requireThat(merchantId === item.merchantId, 'MIXED_MERCHANTS', 'السلة الحالية لمطعم واحد. أكملها قبل بدء سلة أخرى.', 409);
        return { id, quantity, title: item.title, unitMinor: item.priceMinor, version: item.version };
      });
      req.items = lines.map(({id,quantity}) => ({id,quantity})).sort((a,b) => a.id.localeCompare(b.id));
      requireThat(this.ports.providers().some(provider => provider.role === 'merchant' && provider.merchantId === merchantId
        && provider.verified && provider.active && provider.zone === p.zone && provider.kinds.includes('food')),
        'RESTAURANT_CLOSED', 'المطعم غير متاح لاستقبال الطلبات.', 409);
      subtotal = lines.reduce((sum,line) => sum + line.unitMinor * line.quantity, 0);
      delivery = req.method === 'pickup' ? 0 : p.foodDeliveryMinor;
    } else if (kind === 'delivery') {
      requireThat(typeof value.parcelKg === 'number' && Number.isFinite(value.parcelKg) && value.parcelKg > 0 && value.parcelKg <= p.maxParcelKg,
        'PARCEL_LIMIT', 'وزن الطرد خارج الحد المدعوم.');
      requireThat(['documents','sealed_food','general_goods'].includes(String(value.parcelType)), 'PARCEL_NOT_SUPPORTED', 'نوع الغرض غير مدعوم.');
      req.parcelKg = value.parcelKg; req.parcelType = value.parcelType as QuoteRequest['parcelType'];
      delivery = p.parcelBaseMinor + Math.ceil(route!.distanceMeters * p.parcelPerKmMinor / 1000);
    } else if (kind === 'taxi') {
      subtotal = taxiFare(p, route!.distanceMeters, 0);
      basis = 'metered';
    } else {
      requireThat(['battery','tire','tow'].includes(String(value.roadsideType)), 'UNSUPPORTED_ASSISTANCE', 'نوع المساعدة غير مدعوم.');
      req.roadsideType = value.roadsideType as QuoteRequest['roadsideType'];
      subtotal = p.roadsideInspectionMinor; basis = 'inspection_only';
    }
    const total = integer(subtotal + delivery, 0, p.maxAmountMinor, 'الإجمالي');
    const quote: Quote = { id: this.ports.nextId(), customerId: actor.id, kind, currency: p.currency, policyId: p.id,
      request: req, fingerprint: canonical(req), merchantId, lines, subtotalMinor: subtotal, deliveryMinor: delivery,
      totalMinor: total, expiresAt: this.ports.clock() + p.quoteTtlMs, priceBasis: basis,
      distanceMeters: route?.distanceMeters,
      farePolicy: kind === 'taxi' ? { taxiBaseMinor: p.taxiBaseMinor, taxiPerKmMinor: p.taxiPerKmMinor, taxiWaitPerMinuteMinor: p.taxiWaitPerMinuteMinor, taxiMinimumMinor: p.taxiMinimumMinor, maxAmountMinor: p.maxAmountMinor } : undefined };
    return this.ports.store.transaction(state => { requireThat(!state.quotes[quote.id], 'ID_COLLISION', 'تعارض معرف المحاولة.', 409); state.quotes[quote.id] = quote; return quote; });
  }
  async place(actor: Actor, quoteId: string, requestId: string): Promise<Order> {
    this.actor(actor); requireThat(actor.role === 'customer', 'FORBIDDEN', 'إنشاء الطلب مخصص للعميل.', 403);
    key(requestId); text(quoteId, 100, 'عرض السعر');
    return this.ports.store.transaction(state => {
      const receiptKey = JSON.stringify(['place', actor.id, requestId]);
      const receipt = state.receipts[receiptKey];
      if (receipt) {
        requireThat(receipt.fingerprint === quoteId, 'IDEMPOTENCY_CONFLICT', 'هذه المحاولة تخص عرض سعر آخر. راجع الطلب الموجود.', 409);
        const saved = state.orders[receipt.orderId];
        requireThat(saved, 'ARCHIVED_ORDER', 'الطلب مؤرشف؛ لن يُنشأ طلب بديل بهذه المحاولة.', 409);
        return saved;
      }
      const quote = state.quotes[quoteId];
      requireThat(quote && quote.customerId === actor.id, 'NOT_FOUND', 'عرض السعر غير متاح لحسابك.', 404);
      const consumed = state.consumedQuotes[quoteId];
      if (consumed) {
        const saved = state.orders[consumed];
        requireThat(saved, 'ARCHIVED_ORDER', 'الطلب مؤرشف؛ لا تعاد عملية الإنشاء.', 409);
        state.receipts[receiptKey] = {fingerprint: quoteId, orderId: saved.id}; return saved;
      }
      requireThat(this.ports.clock() < quote.expiresAt, 'QUOTE_EXPIRED', 'انتهت صلاحية السعر. أعد تسعير الطلب.', 409);
      const currentPolicy = this.policy();
      requireThat(quote.currency === currentPolicy.currency && quote.request.zone === currentPolicy.zone, 'PRICE_CHANGED', 'تغيرت العملة أو منطقة التشغيل.', 409);
      if (quote.kind === 'taxi') requireThat(quote.farePolicy && Object.entries(quote.farePolicy).every(([k,v]) => currentPolicy[k as keyof Policy] === v), 'PRICE_CHANGED', 'تغيرت التعرفة؛ أعد التسعير.', 409);
      if (quote.kind === 'food' && quote.request.method !== 'pickup') requireThat(quote.deliveryMinor === currentPolicy.foodDeliveryMinor, 'PRICE_CHANGED', 'تغير رسم التوصيل؛ أعد التسعير.', 409);
      requireThat(quote.policyId === currentPolicy.id, 'PRICE_CHANGED', 'تغيرت سياسة التسعير. راجع السعر الجديد.', 409);
      for (const line of quote.lines) {
        const item = this.ports.menu().find(item => item.id === line.id);
        requireThat(item?.available && item.version === line.version && item.priceMinor === line.unitMinor
          && item.merchantId === quote.merchantId, 'MENU_CHANGED', 'تغير توفر أو سعر صنف. راجع سلتك قبل التأكيد.', 409);
      }
      if (quote.kind === 'food') requireThat(this.ports.providers().some(p => p.role === 'merchant' && p.merchantId === quote.merchantId
        && p.verified && p.active && p.zone === quote.request.zone), 'RESTAURANT_CLOSED', 'المطعم متوقف مؤقتًا.', 409);
      const now = this.ports.clock();
      const order: Order = { id: this.ports.nextId(), customerId: actor.id, kind: quote.kind, merchantId: quote.merchantId,
        method: quote.request.method ?? 'courier', phase: 'submitted',
        delivery: { state: quote.kind === 'food' ? 'not_requested' : 'requested' }, quote,
        version: 1, createdAt: now, updatedAt: now,
        cash: { expectedMinor: quote.totalMinor, collectedMinor: 0, status: 'uncollected' }, issues: [] };
      requireThat(!state.orders[order.id], 'ID_COLLISION', 'تعارض معرف الطلب.', 409);
      state.orders[order.id] = order;
      state.consumedQuotes[quoteId] = order.id;
      state.receipts[receiptKey] = { fingerprint: quoteId, orderId: order.id };
      state.events.push({ id: `${order.id}:1`, orderId: order.id, version: 1, actorId: actor.id, action: 'placed', occurredAt: now });
      return order;
    });
  }
  async command(actor: Actor, orderId: string, command: Command, evidence: TrustedEvidence = {}): Promise<Order> {
    this.actor(actor); object(command); key(command.requestId); text(orderId, 100, 'الطلب');
    integer(command.expectedVersion, 1, Number.MAX_SAFE_INTEGER, 'نسخة الطلب');
    const fingerprint = canonical({ orderId, ...command });
    return this.ports.store.transaction(state => {
      const order = state.orders[orderId];
      requireThat(order, 'NOT_FOUND', 'الطلب غير موجود.', 404);
      const receiptKey = JSON.stringify(['command', actor.id, actor.role, command.requestId]);
      const receipt = state.receipts[receiptKey];
      if (receipt) {
        requireThat(receipt.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT', 'المفتاح مستخدم لإجراء مختلف.', 409);
        requireThat(this.visible(actor, order), 'FORBIDDEN', 'الطلب لم يعد متاحًا لحسابك.', 403);
        return order;
      }
      // Check read visibility before exposing the version, except a eligible provider claiming a job.
      if (command.action !== 'accept_job') requireThat(this.visible(actor, order), 'NOT_FOUND', 'الطلب غير متاح لحسابك.', 404);
      if (command.action === 'accept_job') {
        const role = order.kind === 'taxi' ? 'driver' : order.kind === 'roadside' ? 'technician'
          : order.kind === 'food' && order.method === 'merchant' ? 'merchant' : 'courier';
        const p = this.provider(actor, order, role);
        if (role === 'merchant') requireThat(p.merchantId === order.merchantId, 'FORBIDDEN', 'المهمة لا تخص مطعمك.', 403);
      }
      requireThat(order.version === command.expectedVersion, 'VERSION_CONFLICT', 'تغير الطلب في مكان آخر. حمّل النسخة الحالية قبل الإجراء.', 409);
      const phase = (values: Phase[]) => requireThat(values.includes(order.phase), 'INVALID_TRANSITION', 'الإجراء غير متاح في الحالة الحالية.', 409);
      const delivery = (values: DeliveryPhase[]) => requireThat(values.includes(order.delivery.state), 'INVALID_TRANSITION', 'حالة التوصيل لا تسمح بهذا الإجراء.', 409);
      switch (command.action) {
        case 'accept_food':
          this.merchant(actor, order); phase(['submitted']); order.phase = 'accepted';
          if (order.method !== 'pickup') order.delivery.state = 'requested';
          break;
        case 'reject_food':
          this.merchant(actor, order); phase(['submitted']); text(command.reason, 500, 'سبب الرفض');
          order.phase = 'rejected'; order.delivery.state = 'cancelled'; break;
        case 'prepare': this.merchant(actor, order); phase(['accepted']); order.phase = 'preparing'; break;
        case 'ready': this.merchant(actor, order); phase(['preparing']); order.phase = 'ready'; break;
        case 'accept_job': {
          delivery(['requested']); requireThat(!terminal(order) && !order.delivery.providerId, 'ALREADY_ASSIGNED', 'المهمة مسندة أو منتهية.', 409);
          requireThat(!Object.values(state.orders).some(o => o.delivery.providerId === actor.id && !terminal(o)
            && !['delivered','cancelled'].includes(o.delivery.state)), 'PROVIDER_BUSY', 'لديك مهمة نشطة. أكملها قبل قبول أخرى.', 409);
          order.delivery.providerId = actor.id; order.delivery.state = 'assigned';
          if (order.kind !== 'food') order.phase = 'accepted'; break;
        }
        case 'arrive_pickup':
          this.assigned(actor, order); delivery(['assigned']);
          requireThat(evidence.arrivalVerified, 'ARRIVAL_UNVERIFIED', 'يلزم تأكيد الوصول من مصدر موثوق.', 409);
          order.delivery.state = 'at_pickup'; break;
        case 'pickup':
          this.assigned(actor, order); requireThat(['food','delivery'].includes(order.kind), 'INVALID_TRANSITION', 'استخدم إجراء بدء الرحلة المناسب.', 409);
          delivery(['at_pickup']); if (order.kind === 'food') phase(['ready']);
          requireThat(evidence.pickupVerified, 'PICKUP_UNVERIFIED', 'يلزم إثبات استلام الغرض.', 409);
          order.phase = 'handed_over'; order.delivery.state = 'in_transit'; break;
        case 'arrive_destination':
          this.assigned(actor, order); requireThat(['food','delivery'].includes(order.kind), 'INVALID_TRANSITION', 'نوع الرحلة غير مناسب.', 409);
          delivery(['in_transit']); requireThat(evidence.arrivalVerified, 'ARRIVAL_UNVERIFIED', 'يلزم تأكيد الوصول.', 409);
          order.delivery.state = 'at_destination'; break;
        case 'deliver':
          this.assigned(actor, order); requireThat(['food','delivery'].includes(order.kind), 'INVALID_TRANSITION', 'نوع الرحلة غير مناسب.', 409);
          delivery(['at_destination']); requireThat(evidence.dropoffVerified, 'DELIVERY_UNVERIFIED', 'يلزم إثبات التسليم الصحيح.', 409);
          order.phase = 'completed'; order.delivery.state = 'delivered'; break;
        case 'confirm_pickup':
          this.merchant(actor, order); phase(['ready']); requireThat(order.method === 'pickup', 'INVALID_METHOD', 'هذا الطلب للتوصيل.', 409);
          requireThat(evidence.dropoffVerified, 'DELIVERY_UNVERIFIED', 'يلزم إثبات استلام العميل.', 409);
          order.phase = 'completed'; order.delivery.state = 'delivered'; break;
        case 'start_ride':
          this.assigned(actor, order); requireThat(order.kind === 'taxi', 'INVALID_TRANSITION', 'الطلب ليس رحلة تكسي.', 409);
          delivery(['at_pickup']); phase(['accepted']);
          requireThat(evidence.rideConsentVerified, 'RIDER_CONSENT_REQUIRED', 'لا يبدأ العداد قبل تحقق صعود الراكب وموافقته.', 409);
          order.phase = 'in_progress'; order.delivery.state = 'in_transit';
          order.rideStartedAt = this.ports.clock(); order.rideStartEventId = `${order.id}:${order.version + 1}`; break;
        case 'finish_ride': {
          this.assigned(actor, order); requireThat(order.kind === 'taxi', 'INVALID_TRANSITION', 'الطلب ليس رحلة تكسي.', 409); phase(['in_progress']);
          requireThat(evidence.meterVerified && evidence.dropoffVerified, 'METER_UNVERIFIED', 'يلزم قياس معتمد وإثبات نهاية الرحلة.', 409);
          const p = order.quote.farePolicy; requireThat(p, 'FARE_POLICY_UNAVAILABLE', 'نسخة التسعير الأصلية غير متاحة.', 503);
          const meters = integer(evidence.tripMeters, 0, 500_000, 'مسافة الرحلة');
          const seconds = integer(evidence.waitSeconds, 0, 86_400, 'زمن الانتظار');
          order.cash.expectedMinor = taxiFare(p, meters, seconds);
          order.phase = 'completed'; order.delivery.state = 'delivered'; break;
        }
        case 'start_assistance':
          this.assigned(actor, order); requireThat(order.kind === 'roadside', 'INVALID_TRANSITION', 'الطلب ليس مساعدة طريق.', 409);
          delivery(['at_pickup']); phase(['accepted']); order.phase = 'in_progress'; break;
        case 'finish_assistance':
          this.assigned(actor, order); requireThat(order.kind === 'roadside', 'INVALID_TRANSITION', 'الطلب ليس مساعدة طريق.', 409); phase(['in_progress']);
          requireThat(evidence.completedWorkVerified, 'WORK_UNVERIFIED', 'يلزم تأكيد العميل إنجاز المعاينة.', 409);
          order.phase = 'completed'; order.delivery.state = 'delivered'; break;
        case 'cancel':
          requireThat(actor.role === 'customer' && actor.id === order.customerId, 'FORBIDDEN', 'الإلغاء المباشر للعميل فقط.', 403);
          phase(order.kind === 'taxi' ? ['submitted','accepted'] : ['submitted']);
          delivery(order.kind === 'taxi' ? ['requested','assigned','at_pickup'] : ['not_requested','requested']);
          order.phase = 'cancelled'; order.delivery.state = 'cancelled'; break;
        case 'release_job':
          this.assigned(actor, order); requireThat(order.kind === 'taxi', 'INVALID_TRANSITION', 'المهمة ليست رحلة تكسي.', 409);
          phase(['accepted']); delivery(['assigned','at_pickup']); text(command.reason, 500, 'سبب الانسحاب');
          order.delivery = { state: 'requested' }; order.phase = 'submitted'; break;
        case 'report_issue':
          requireThat(!['cancelled','rejected'].includes(order.phase), 'INVALID_TRANSITION', 'هذا الطلب مغلق.', 409);
          order.issues.push({id: this.ports.nextId(), openedBy: actor.id, reason: text(command.reason, 500, 'المشكلة'), open: true}); break;
        case 'resolve_issue': {
          requireThat(actor.role === 'operator', 'FORBIDDEN', 'حل المشكلة للمشرف فقط.', 403);
          const issue = order.issues.find(i => i.id === command.issueId && i.open);
          requireThat(issue, 'ISSUE_NOT_FOUND', 'المشكلة غير مفتوحة.', 404);
          text(command.reason, 500, 'ملاحظة الحل'); issue.open = false; break;
        }
        case 'record_cash':
          if (order.kind === 'food' && order.method === 'pickup') this.merchant(actor, order); else this.assigned(actor, order);
          phase(['completed']);
          requireThat(order.cash.status === 'uncollected', 'CASH_ALREADY_RECORDED', 'تم تسجيل التحصيل؛ يلزم مراجعة المشرف لأي تصحيح.', 409);
          order.cash.collectedMinor = integer(command.amountMinor, 0, this.policy().maxAmountMinor, 'النقد المستلم');
          order.cash.status = order.cash.collectedMinor === order.cash.expectedMinor ? 'collected' : 'discrepancy'; break;
        case 'settle_cash':
          requireThat(actor.role === 'operator', 'FORBIDDEN', 'التسوية للمشرف فقط.', 403); phase(['completed']);
          requireThat(order.cash.status === 'collected' && !order.issues.some(issue => issue.open),
            'SETTLEMENT_BLOCKED', 'لا تسوية مع فرق نقدي أو مشكلة مفتوحة.', 409);
          order.cash.status = 'settled'; break;
        case 'rate':
          requireThat(actor.role === 'customer' && actor.id === order.customerId, 'FORBIDDEN', 'التقييم للعميل صاحب الطلب.', 403);
          phase(['completed']); requireThat(order.rating === undefined, 'ALREADY_RATED', 'تم تقييم الطلب.', 409);
          order.rating = integer(command.rating, 1, 5, 'التقييم'); break;
        default: throw new JourneyError('UNKNOWN_ACTION', 400, 'الإجراء غير مدعوم.');
      }
      order.version += 1; order.updatedAt = Math.max(this.ports.clock(), order.updatedAt);
      state.receipts[receiptKey] = { fingerprint, orderId };
      state.events.push({ id: `${order.id}:${order.version}`, orderId, version: order.version,
        actorId: actor.id, action: command.action, occurredAt: order.updatedAt });
      return order;
    });
  }
  async read(actor: Actor, id: string): Promise<Order> {
    this.actor(actor);
    return this.ports.store.transaction(state => {
      const order = state.orders[id]; requireThat(order && this.visible(actor, order), 'NOT_FOUND', 'الطلب غير متاح لحسابك.', 404); return order;
    });
  }
  async list(actor: Actor): Promise<Order[]> {
    this.actor(actor); return this.ports.store.transaction(state => Object.values(state.orders).filter(o => this.visible(actor, o)));
  }
  /** Public job offers intentionally omit names, exact addresses and customer IDs. */
  async offers(actor: Actor): Promise<{ id: string; kind: Kind; pickupArea: string; dropoffArea?: string; version: number }[]> {
    this.actor(actor);
    return this.ports.store.transaction(state => Object.values(state.orders).filter(o => {
      if (o.delivery.state !== 'requested' || terminal(o) || o.method === 'pickup') return false;
      try {
        const role = o.kind === 'taxi' ? 'driver' : o.kind === 'roadside' ? 'technician'
          : o.kind === 'food' && o.method === 'merchant' ? 'merchant' : 'courier';
        const p = this.provider(actor, o, role); return role !== 'merchant' || p.merchantId === o.merchantId;
      } catch (error) { if (error instanceof JourneyError) return false; throw error; }
    }).map(o => ({ id: o.id, kind: o.kind, pickupArea: o.quote.request.pickup.area, dropoffArea: o.quote.request.dropoff?.area, version: o.version })));
  }
}

/** Never show an unqualified live marker when location updates are missing/stale. */
export function locationFreshness(observedAt: number | undefined, now: number): 'missing' | 'fresh' | 'stale' {
  if (observedAt === undefined || !Number.isFinite(observedAt) || !Number.isFinite(now) || observedAt > now) return 'missing';
  return now - observedAt <= 30_000 ? 'fresh' : 'stale';
}
