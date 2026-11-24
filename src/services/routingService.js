import { calculateHaversineDistance } from './matchingEngine';
import { calculateDeliveryFare } from '../config/deliveryPricing';

// In-memory route cache to avoid repeated external requests
const routeCache = new Map();

/**
 * Calculates the shortest driving road route, duration, and road geometry between two coordinates.
 * Queries OpenStreetMap Project-OSRM with alternative paths enabled and evaluates candidate routes
 * to explicitly select the minimum road distance route (rather than default fastest travel time).
 *
 * Falls back safely to local Haversine distance with 1.3x urban winding factor upon network/timeout issues.
 *
 * @param {number} pickupLat Starting latitude (Donor)
 * @param {number} pickupLon Starting longitude (Donor)
 * @param {number} dropLat Destination latitude (Recipient)
 * @param {number} dropLon Destination longitude (Recipient)
 * @param {string} [donationId] Optional donation ID for cache identification
 * @returns {Promise<{
 *   distanceKm: number,
 *   durationMin: number,
 *   coordinates: Array<[number, number]>, // [latitude, longitude] pairs for Leaflet
 *   fare: { totalFare: number, donorShare: number, recipientShare: number },
 *   isRealRoadRoute: boolean,
 *   isFallback: boolean,
 *   provider: 'osrm_shortest' | 'fallback_haversine',
 *   alternativesEvaluated: number,
 *   rawDistanceMeters: number
 * }>}
 */
export async function calculateRouteAndFare(pickupLat, pickupLon, dropLat, dropLon, donationId = '') {
  const pLat = Number(pickupLat);
  const pLon = Number(pickupLon);
  const dLat = Number(dropLat);
  const dLon = Number(dropLon);

  const cacheKey = donationId || `${pLat.toFixed(5)},${pLon.toFixed(5)}->${dLat.toFixed(5)},${dLon.toFixed(5)}`;

  // 1. Check in-memory cache
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  // 2. Check session storage cache
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(`foodbridge_route_${cacheKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        routeCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (e) {}

  // 3. Fallback baseline generator
  const createFallback = () => {
    const straightLineKm = calculateHaversineDistance(pLat, pLon, dLat, dLon);
    const roadKm = Math.max(0.5, Math.round(straightLineKm * 1.3 * 10) / 10);
    const durationMin = Math.max(5, Math.round((roadKm / 25) * 60)); // ~25 km/h urban average
    const fare = calculateDeliveryFare(roadKm);

    return {
      distanceKm: roadKm,
      durationMin,
      coordinates: [
        [pLat, pLon],
        [dLat, dLon]
      ],
      fare,
      isRealRoadRoute: false,
      isFallback: true,
      provider: 'fallback_haversine',
      alternativesEvaluated: 0,
      rawDistanceMeters: Math.round(roadKm * 1000)
    };
  };

  // If coordinates are invalid, return standard fallback
  if (isNaN(pLat) || isNaN(pLon) || isNaN(dLat) || isNaN(dLon) || (pLat === 0 && pLon === 0) || (dLat === 0 && dLon === 0)) {
    return createFallback();
  }

  // 4. Query OSRM Driving Route API with alternative routes enabled to find shortest road distance
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // alternatives=3 requests up to 3 topological routes; continue_straight=default respects standard vehicle restrictions
    const url = `https://router.project-osrm.org/route/v1/driving/${pLon},${pLat};${dLon},${dLat}?overview=full&geometries=geojson&alternatives=3&continue_straight=default`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        // Evaluate all candidate routes and select the one with strictly MINIMUM road distance in meters
        const sortedByDistance = [...data.routes].sort((a, b) => a.distance - b.distance);
        const shortestRoute = sortedByDistance[0];

        const rawDistanceMeters = shortestRoute.distance;
        const distanceKm = Math.round((rawDistanceMeters / 1000) * 10) / 10;
        const durationMin = Math.max(1, Math.round(shortestRoute.duration / 60));

        // OSRM returns GeoJSON coordinates as [lon, lat]. Convert to Leaflet's [lat, lon].
        const leafletCoords = (shortestRoute.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]);
        const fare = calculateDeliveryFare(distanceKm);

        const result = {
          distanceKm,
          durationMin,
          coordinates: leafletCoords.length > 0 ? leafletCoords : [[pLat, pLon], [dLat, dLon]],
          fare,
          isRealRoadRoute: true,
          isFallback: false,
          provider: 'osrm_shortest',
          alternativesEvaluated: data.routes.length,
          rawDistanceMeters
        };

        // Cache result
        routeCache.set(cacheKey, result);
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem(`foodbridge_route_${cacheKey}`, JSON.stringify(result));
          }
        } catch (e) {}

        return result;
      }
    }
  } catch (err) {
    // Graceful offline or timeout fallback
  }

  // Fallback to Haversine with urban winding factor
  const fallback = createFallback();
  routeCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Calculates a point along a polyline at a given fractional distance (0 to 1).
 * Used to position the delivery partner / motorcycle marker accurately along the road polyline.
 *
 * @param {Array<[number, number]>} coordinates Array of [lat, lon]
 * @param {number} fraction Number between 0 and 1
 * @returns {[number, number]} [latitude, longitude]
 */
export function getPointAlongPolyline(coordinates, fraction = 0.5) {
  if (!coordinates || coordinates.length === 0) return [12.9716, 77.5946];
  if (coordinates.length === 1) return coordinates[0];

  const clampedFraction = Math.max(0, Math.min(1, fraction));
  if (clampedFraction === 0) return coordinates[0];
  if (clampedFraction === 1) return coordinates[coordinates.length - 1];

  // Calculate segment lengths
  let totalDist = 0;
  const segmentLengths = [];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lat1, lon1] = coordinates[i];
    const [lat2, lon2] = coordinates[i + 1];
    const d = calculateHaversineDistance(lat1, lon1, lat2, lon2);
    segmentLengths.push(d);
    totalDist += d;
  }

  if (totalDist === 0) return coordinates[0];

  const targetDist = totalDist * clampedFraction;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= targetDist) {
      const segFraction = segLen > 0 ? (targetDist - accumulated) / segLen : 0;
      const [lat1, lon1] = coordinates[i];
      const [lat2, lon2] = coordinates[i + 1];
      const interpolatedLat = lat1 + (lat2 - lat1) * segFraction;
      const interpolatedLon = lon1 + (lon2 - lon1) * segFraction;
      return [interpolatedLat, interpolatedLon];
    }
    accumulated += segLen;
  }

  return coordinates[coordinates.length - 1];
}
