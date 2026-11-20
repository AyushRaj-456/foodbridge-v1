import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Centroid coordinates for Karnataka districts to safeguard private physical locations.
 * Exact donor and recipient addresses are NEVER rendered on the public globe.
 */
export const KARNATAKA_DISTRICT_CENTROIDS = {
  'Bengaluru Urban': { id: 'blr', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, isPilot: false },
  'Bengaluru': { id: 'blr', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, isPilot: false },
  'Tumakuru': { id: 'tum', name: 'Tumakuru', lat: 13.3409, lon: 77.1010, isPilot: true },
  'Mysuru': { id: 'mys', name: 'Mysuru', lat: 12.2958, lon: 76.6394, isPilot: false },
  'Hubballi-Dharwad': { id: 'hub', name: 'Hubballi', lat: 15.3647, lon: 75.1240, isPilot: false },
  'Dharwad': { id: 'hub', name: 'Hubballi-Dharwad', lat: 15.3647, lon: 75.1240, isPilot: false },
  'Belagavi': { id: 'bel', name: 'Belagavi', lat: 15.8497, lon: 74.4977, isPilot: false },
  'Mangaluru': { id: 'mng', name: 'Mangaluru', lat: 12.9141, lon: 74.8560, isPilot: false },
  'Dakshina Kannada': { id: 'mng', name: 'Mangaluru', lat: 12.9141, lon: 74.8560, isPilot: false },
  'Ballari': { id: 'bal', name: 'Ballari', lat: 15.1394, lon: 76.9214, isPilot: false },
  'Kalaburagi': { id: 'kal', name: 'Kalaburagi', lat: 17.3297, lon: 76.8343, isPilot: false },
  'Shivamogga': { id: 'shv', name: 'Shivamogga', lat: 13.9299, lon: 75.5681, isPilot: false },
  'Davangere': { id: 'dvn', name: 'Davangere', lat: 14.4644, lon: 75.9218, isPilot: false },
  'Hassan': { id: 'has', name: 'Hassan', lat: 13.0072, lon: 76.1030, isPilot: false }
};

/**
 * Standard demonstration network when real operational records are minimal.
 */
export const DEFAULT_DEMO_HUBS = [
  { id: 'blr', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, isPilot: false, color: 0x52b788, size: 2.2 },
  { id: 'tum', name: 'Tumakuru (Pilot Hub)', lat: 13.3409, lon: 77.1010, isPilot: true, color: 0x22c55e, size: 2.4 },
  { id: 'mys', name: 'Mysuru', lat: 12.2958, lon: 76.6394, isPilot: false, color: 0x74c69d, size: 1.8 },
  { id: 'hub', name: 'Hubballi', lat: 15.3647, lon: 75.1240, isPilot: false, color: 0x74c69d, size: 1.8 }
];

export const DEFAULT_DEMO_CORRIDORS = [
  { from: DEFAULT_DEMO_HUBS[0], to: DEFAULT_DEMO_HUBS[1], label: 'Bengaluru - Tumakuru Corridor' },
  { from: DEFAULT_DEMO_HUBS[0], to: DEFAULT_DEMO_HUBS[2], label: 'Bengaluru - Mysuru Corridor' },
  { from: DEFAULT_DEMO_HUBS[1], to: DEFAULT_DEMO_HUBS[3], label: 'Tumakuru - Hubballi Corridor' },
  { from: DEFAULT_DEMO_HUBS[2], to: DEFAULT_DEMO_HUBS[1], label: 'Mysuru - Tumakuru Corridor' }
];

/**
 * Fetches and filters operational delivery records into safe, anonymized aggregate corridors.
 *
 * @param {Object} db Firestore database
 * @returns {Promise<{
 *   hubs: Array<Object>,
 *   corridors: Array<Object>,
 *   isDemonstration: boolean,
 *   activeCorridorCount: number,
 *   pilotRegion: Object
 * }>}
 */
export async function fetchSafeGlobeData(db) {
  try {
    const delQuery = query(
      collection(db, 'deliveries'),
      where('status', 'in', ['assigned', 'picked_up', 'delivered_pending_confirmation', 'completed'])
    );
    const snap = await getDocs(delQuery);

    if (snap.empty) {
      return getDemonstrationGlobeData();
    }

    const corridorMap = new Map();
    const activeHubIds = new Set();

    snap.docs.forEach((d) => {
      const data = d.data();
      const pDist = data.pickupDistrict || 'Bengaluru Urban';
      const dDist = data.dropoffDistrict || 'Tumakuru';

      const fromCentroid = KARNATAKA_DISTRICT_CENTROIDS[pDist] || KARNATAKA_DISTRICT_CENTROIDS['Bengaluru Urban'];
      const toCentroid = KARNATAKA_DISTRICT_CENTROIDS[dDist] || KARNATAKA_DISTRICT_CENTROIDS['Tumakuru'];

      const pairKey = `${fromCentroid.id}->${toCentroid.id}`;
      if (!corridorMap.has(pairKey)) {
        corridorMap.set(pairKey, {
          from: fromCentroid,
          to: toCentroid,
          count: 1
        });
      } else {
        corridorMap.get(pairKey).count += 1;
      }

      activeHubIds.add(fromCentroid.id);
      activeHubIds.add(toCentroid.id);
    });

    const corridors = Array.from(corridorMap.values());

    // If real data is too sparse, supplement with demo network
    if (corridors.length < 2) {
      return getDemonstrationGlobeData();
    }

    // Build hubs list
    const hubs = Object.values(KARNATAKA_DISTRICT_CENTROIDS)
      .filter((h) => activeHubIds.has(h.id))
      .map((h) => ({
        ...h,
        color: h.isPilot ? 0x22c55e : 0x52b788,
        size: h.isPilot ? 2.4 : 2.0
      }));

    return {
      hubs,
      corridors,
      isDemonstration: false,
      activeCorridorCount: corridors.length,
      pilotRegion: KARNATAKA_DISTRICT_CENTROIDS['Tumakuru']
    };
  } catch (err) {
    console.warn('Using default demo globe visualization:', err.message);
    return getDemonstrationGlobeData();
  }
}

/**
 * Returns safe default demonstration corridors with explicit labelling.
 */
export function getDemonstrationGlobeData() {
  return {
    hubs: DEFAULT_DEMO_HUBS,
    corridors: DEFAULT_DEMO_CORRIDORS,
    isDemonstration: true,
    activeCorridorCount: DEFAULT_DEMO_CORRIDORS.length,
    pilotRegion: KARNATAKA_DISTRICT_CENTROIDS['Tumakuru']
  };
}
