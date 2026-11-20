import { calculateHaversineDistance } from './matchingEngine';
import { calculateDeliveryFare } from '../config/deliveryPricing';

// In-memory route cache to avoid repeated external requests
const routeCache = new Map();

/**
 * Calculates real driving road distance, duration, and route geometry between two coordinates.
 * Uses OpenStreetMap OSRM routing API with automatic local Haversine fallback.
 *
 * @param {number} pickupLat
 * @param {number} pickupLon
 * @param {number} dropLat
 * @param {number} dropLon
 * @param {string} [donationId] Optional donation ID for caching
 * @returns {Promise<{
 *   distanceKm: number,
 *   durationMin: number,
 *   coordinates: Array<[number, number]>, // [latitude, longitude] pairs for Leaflet
 *   fare: { totalFare: number, donorShare: number, recipientShare: number },
 *   isRealRoadRoute: boolean
 * }>}
 */
export async function calculateRouteAndFare(pickupLat, pickupLon, dropLat, dropLon, donationId = '') {
  const pLat = Number(pickupLat);
  const pLon = Number(pickupLon);
  const dLat = Number(dropLat);
  const dLon = Number(dropLon);

  const cacheKey = donationId || `${pLat.toFixed(4)},${pLon.toFixed(4)}->${dLat.toFixed(4)},${dLon.toFixed(4)}`;

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
      isRealRoadRoute: false
    };
  };

  // If coordinates are invalid, return standard fallback
  if (isNaN(pLat) || isNaN(pLon) || isNaN(dLat) || isNaN(dLon)) {
    return createFallback();
  }

  // 4. Query OSRM Driving Route API with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://router.project-osrm.org/route/v1/driving/${pLon},${pLat};${dLon},${dLat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        const durationMin = Math.max(3, Math.round(route.duration / 60));
        // OSRM returns GeoJSON coordinates as [lon, lat]. Leaflet expects [lat, lon].
        const leafletCoords = (route.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]);
        const fare = calculateDeliveryFare(distanceKm);

        const result = {
          distanceKm,
          durationMin,
          coordinates: leafletCoords.length > 0 ? leafletCoords : [[pLat, pLon], [dLat, dLon]],
          fare,
          isRealRoadRoute: true
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
