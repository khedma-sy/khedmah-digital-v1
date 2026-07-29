export type MapsEndpoint = "geocode" | "directions" | "places";
export interface MapsTransport { request<T>(endpoint: MapsEndpoint, parameters: Readonly<Record<string, string>>): Promise<T>; }
/** Injectable boundary only; no request occurs until a method is explicitly called. */
export class GoogleMapsService {
  constructor(private readonly transport: MapsTransport) {}
  geocode(address: string) { if (!address.trim()) throw new Error("Address is required"); return this.transport.request("geocode", { address }); }
  places(query: string) { if (!query.trim()) throw new Error("Places query is required"); return this.transport.request("places", { query }); }
  directions(origin: string, destination: string) {
    if (!origin.trim() || !destination.trim()) throw new Error("Origin and destination are required");
    return this.transport.request("directions", { origin, destination });
  }
}
