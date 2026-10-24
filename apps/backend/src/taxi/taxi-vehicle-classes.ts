export type TaxiVehicleClassCode = 'economy' | 'comfort' | 'suv' | 'van';

export interface TaxiVehicleClass {
  code: TaxiVehicleClassCode;
  titleAr: string;
  seats: number;
  luggage: number;
  fareMultiplierBps: number;
  descriptionAr: string;
}

export const TAXI_VEHICLE_CLASSES: readonly TaxiVehicleClass[] = Object.freeze([
  Object.freeze({
    code: 'economy',
    titleAr: 'اقتصادي',
    seats: 4,
    luggage: 2,
    fareMultiplierBps: 10_000,
    descriptionAr: 'الخيار اليومي الأقل كلفة حتى 4 ركاب.',
  }),
  Object.freeze({
    code: 'comfort',
    titleAr: 'مريح',
    seats: 4,
    luggage: 3,
    fareMultiplierBps: 12_500,
    descriptionAr: 'سيارة أحدث ومساحة وراحة أفضل.',
  }),
  Object.freeze({
    code: 'suv',
    titleAr: 'كبيرة / SUV',
    seats: 6,
    luggage: 4,
    fareMultiplierBps: 15_500,
    descriptionAr: 'للعائلات والأمتعة الأكبر حتى 6 ركاب.',
  }),
  Object.freeze({
    code: 'van',
    titleAr: 'فان',
    seats: 8,
    luggage: 6,
    fareMultiplierBps: 19_000,
    descriptionAr: 'للمجموعات والعائلات الكبيرة حتى 8 ركاب.',
  }),
]);

function safeMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Taxi fare amount is invalid.');
  return value;
}

export function taxiVehicleClassByCode(code: TaxiVehicleClassCode): TaxiVehicleClass {
  const match = TAXI_VEHICLE_CLASSES.find((item) => item.code === code);
  if (!match) throw new Error('Taxi vehicle class is invalid.');
  return match;
}

export function applyTaxiFareMultiplier(baseMinor: number, fareMultiplierBps: number): number {
  const base = safeMinor(baseMinor);
  if (!Number.isSafeInteger(fareMultiplierBps) || fareMultiplierBps < 1 || fareMultiplierBps > 100_000) throw new Error('Taxi fare multiplier is invalid.');
  const scaled = (BigInt(base) * BigInt(fareMultiplierBps) + 9_999n) / 10_000n;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Taxi vehicle class fare is too large.');
  return Number(scaled);
}

export function applyTaxiVehicleClassFare(baseMinor: number, code: TaxiVehicleClassCode): number {
  const vehicleClass = taxiVehicleClassByCode(code);
  return applyTaxiFareMultiplier(baseMinor, vehicleClass.fareMultiplierBps);
}

export function quoteTaxiVehicleClasses(baseMinor: number) {
  return TAXI_VEHICLE_CLASSES.map((vehicleClass) => ({
    ...vehicleClass,
    totalMinor: applyTaxiVehicleClassFare(baseMinor, vehicleClass.code),
  }));
}
