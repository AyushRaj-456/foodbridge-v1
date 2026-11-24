import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateRouteAndFare, getPointAlongPolyline } from '../services/routingService';

describe('Shortest Road Route Calculation & OSRM Optimization Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the route with the MINIMUM road distance among OSRM alternatives', async () => {
    // Mock fetch returning multiple alternative routes where route 0 is fastest by time,
    // but route 1 has shorter road distance in meters!
    const mockOsrmResponse = {
      code: 'Ok',
      routes: [
        {
          // Route 0: Default fastest by time (195.6s), but longer distance (1773.2m)
          distance: 1773.2,
          duration: 195.6,
          geometry: {
            coordinates: [
              [77.5946, 12.9716],
              [77.5960, 12.9725],
              [77.5990, 12.9740]
            ]
          }
        },
        {
          // Route 1: Alternative route: shorter distance (1716.2m), but slightly longer time (209.2s)
          distance: 1716.2,
          duration: 209.2,
          geometry: {
            coordinates: [
              [77.5946, 12.9716],
              [77.5955, 12.9720],
              [77.5975, 12.9730],
              [77.5990, 12.9740]
            ]
          }
        }
      ]
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockOsrmResponse
    });

    const result = await calculateRouteAndFare(12.9716, 77.5946, 12.9740, 77.5990, 'test_donation_shortest_1');

    // Should choose Route 1 because 1716.2m < 1773.2m!
    expect(result.rawDistanceMeters).toBe(1716.2);
    expect(result.distanceKm).toBe(1.7); // 1716.2m rounded to 1.7km
    expect(result.durationMin).toBe(3); // 209.2s / 60 = ~3 mins
    expect(result.isRealRoadRoute).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.provider).toBe('osrm_shortest');
    expect(result.alternativesEvaluated).toBe(2);

    // Verify coordinates conversion from GeoJSON [lon, lat] to Leaflet [lat, lon]
    expect(result.coordinates[0]).toEqual([12.9716, 77.5946]);
    expect(result.coordinates[result.coordinates.length - 1]).toEqual([12.9740, 77.5990]);
  });

  it('correctly calculates delivery fare using the shortest road distance', async () => {
    // 5 km route
    const mockOsrmResponse = {
      code: 'Ok',
      routes: [
        {
          distance: 5000,
          duration: 600,
          geometry: {
            coordinates: [
              [77.5946, 12.9716],
              [77.6400, 12.9800]
            ]
          }
        }
      ]
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockOsrmResponse
    });

    const result = await calculateRouteAndFare(12.9716, 77.5946, 12.9800, 77.6400, 'test_fare_calc_5km');

    expect(result.distanceKm).toBe(5);
    // Base fare ₹40 + 5km * ₹12 = ₹100 total
    expect(result.fare.totalFare).toBe(100);
    expect(result.fare.donorShare).toBe(50);
    expect(result.fare.recipientShare).toBe(50);
  });

  it('safely falls back to Haversine with 1.3x urban winding factor upon network timeout with clear fallback flag', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network timeout'));

    const result = await calculateRouteAndFare(12.9716, 77.5946, 12.9740, 77.5990, 'test_fallback_error');

    expect(result.isRealRoadRoute).toBe(false);
    expect(result.isFallback).toBe(true);
    expect(result.provider).toBe('fallback_haversine');
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.fare.totalFare).toBeGreaterThanOrEqual(50); // Minimum fare threshold
  });

  it('getPointAlongPolyline calculates accurate intermediate points on road polyline for motorcycle marker', () => {
    const polyline = [
      [12.9700, 77.5900],
      [12.9750, 77.5950],
      [12.9800, 77.6000]
    ];

    // At 0% ratio -> start point
    const startPoint = getPointAlongPolyline(polyline, 0);
    expect(startPoint[0]).toBeCloseTo(12.9700, 4);
    expect(startPoint[1]).toBeCloseTo(77.5900, 4);

    // At 50% ratio -> midpoint
    const midPoint = getPointAlongPolyline(polyline, 0.5);
    expect(midPoint[0]).toBeCloseTo(12.9750, 2);
    expect(midPoint[1]).toBeCloseTo(77.5950, 2);

    // At 100% ratio -> end point
    const endPoint = getPointAlongPolyline(polyline, 1);
    expect(endPoint[0]).toBeCloseTo(12.9800, 4);
    expect(endPoint[1]).toBeCloseTo(77.6000, 4);
  });
});
