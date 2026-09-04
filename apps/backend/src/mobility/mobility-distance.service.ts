import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import type { MobilityRequest } from './mobility.types';

type RouteResponse = { routes?: Array<{ distanceMeters?: number }> };

@Injectable()
export class MobilityDistanceService {
  async calculate(request: MobilityRequest): Promise<number> {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
    const destination = request.destinationLatitude !== undefined && request.destinationLongitude !== undefined
      ? { latitude: request.destinationLatitude, longitude: request.destinationLongitude }
      : apiKey ? await this.geocodeDestination(request.destinationAddress, apiKey) : undefined;
    if (!destination) throw new BadRequestException('The platform could not locate the destination required to calculate the fare.');
    const destinationLatitude = destination.latitude;
    const destinationLongitude = destination.longitude;
    if (!apiKey) {
      return roadEstimateMeters(
        request.pickupLatitude,
        request.pickupLongitude,
        destinationLatitude,
        destinationLongitude
      );
    }

    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters'
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: request.pickupLatitude, longitude: request.pickupLongitude } } },
          destination: { location: { latLng: { latitude: destinationLatitude, longitude: destinationLongitude } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE'
        }),
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) throw new Error(`Routes API returned ${response.status}`);
      const payload = await response.json() as RouteResponse;
      const distanceMeters = Math.round(payload.routes?.[0]?.distanceMeters ?? Number.NaN);
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 1_000_000) {
        throw new Error('Routes API returned an invalid distance');
      }
      return distanceMeters;
    } catch {
      const fallback = roadEstimateMeters(
        request.pickupLatitude,
        request.pickupLongitude,
        destinationLatitude,
        destinationLongitude
      );
      if (fallback > 0) return fallback;
      throw new BadGatewayException('The platform could not calculate the trip distance. Try completing the trip again.');
    }
  }

  private async geocodeDestination(address: string, apiKey: string): Promise<{ latitude: number; longitude: number } | undefined> {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('components', 'country:SY');
      url.searchParams.set('language', 'ar');
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return undefined;
      const payload = await response.json() as { results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> };
      const location = payload.results?.[0]?.geometry?.location;
      return typeof location?.lat === 'number' && typeof location.lng === 'number'
        ? { latitude: location.lat, longitude: location.lng }
        : undefined;
    } catch {
      return undefined;
    }
  }
}

function roadEstimateMeters(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(toLat - fromLat);
  const longitudeDelta = radians(toLng - fromLng);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  const directMeters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  // A conservative road-network factor is used only when the governed server
  // Routes key is unavailable; the client can never submit or alter this value.
  return Math.min(1_000_000, Math.max(0, Math.round(directMeters * 1.25)));
}
