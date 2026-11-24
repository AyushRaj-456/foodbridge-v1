import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level captured records
let capturedDeliveryData = null;
let capturedListingUpdates = {};
let capturedPartnerUpdates = {};

vi.mock('../services/chatService', () => ({
  getOrCreateConversation: vi.fn(async () => ({ id: 'mock_conv_123' })),
  addDeliveryPartnerToConversation: vi.fn(async () => ({})),
  sendChatMessage: vi.fn(async () => ({ id: 'mock_msg_123' }))
}));

vi.mock('../services/notificationService', () => ({
  sendInAppNotification: vi.fn(async () => ({ id: 'mock_notif_123' })),
  showLocalNotification: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((db, name) => ({ path: name })),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  addDoc: vi.fn(async (colRef, data) => {
    capturedDeliveryData = data;
    return { id: 'del_mock_456' };
  }),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  arrayUnion: vi.fn((val) => [val]),
  updateDoc: vi.fn(async (ref, updates) => {
    if (ref.path?.includes('deliveryPartners')) {
      capturedPartnerUpdates = updates;
    }
  }),
  runTransaction: vi.fn(async (db, updateFn) => {
    const tx = {
      get: vi.fn(async (ref) => {
        if (ref.id === 'list_123') {
          return {
            exists: () => true,
            data: () => ({
              id: 'list_123',
              status: 'matching',
              quantity: 20,
              donorId: 'donor_001',
              eligibleCategories: ['human'],
              latitude: 13.3409,
              longitude: 77.1010,
              address: 'Tumakuru Kitchen, Dr. S Radhakrishnan Road'
            })
          };
        }
        if (ref.id === 'rec_456') {
          return {
            exists: () => true,
            data: () => ({
              userId: 'rec_456',
              organizationName: 'Tumakuru Orphanage Shelter',
              category: 'human',
              verificationStatus: 'verified',
              totalCapacity: 100,
              committedCapacity: 10,
              operationalLimit: 100,
              address: 'Ashraya Bhavan, 2nd Cross, Tumakuru',
              district: 'Tumakuru',
              latitude: 13.3380,
              longitude: 77.1085,
              location: {
                latitude: 13.3380,
                longitude: 77.1085,
                address: 'Ashraya Bhavan, 2nd Cross, Tumakuru',
                district: 'Tumakuru'
              },
              phone: '+91 98450 12345'
            })
          };
        }
        return { exists: () => false };
      }),
      update: vi.fn((ref, updates) => {
        if (ref.id === 'list_123') {
          capturedListingUpdates = updates;
        }
      })
    };
    return updateFn(tx);
  })
}));

import { acceptDonationAtomic } from '../services/acceptanceService';
import { createDeliveryRequest, updateDeliveryPartnerLiveLocation } from '../services/deliveryService';

describe('Permanent Locations & Exact Coordinates in Delivery Pipeline', () => {
  beforeEach(() => {
    capturedDeliveryData = null;
    capturedListingUpdates = {};
    capturedPartnerUpdates = {};
  });

  it('acceptDonationAtomic stores recipient exact saved coordinates and address on the listing', async () => {
    const result = await acceptDonationAtomic(
      {},
      'list_123',
      'rec_456',
      { organizationName: 'Tumakuru Orphanage Shelter' }
    );

    expect(result.success).toBe(true);
    // Verify exact coordinates were attached to the listing update
    expect(capturedListingUpdates.acceptedRecipientLatitude).toBe(13.3380);
    expect(capturedListingUpdates.acceptedRecipientLongitude).toBe(77.1085);
    expect(capturedListingUpdates.acceptedRecipientAddress).toBe('Ashraya Bhavan, 2nd Cross, Tumakuru');
    expect(capturedListingUpdates.acceptedRecipientPhone).toBe('+91 98450 12345');
    expect(capturedListingUpdates.acceptedRecipientLocation).toEqual({
      latitude: 13.3380,
      longitude: 77.1085,
      address: 'Ashraya Bhavan, 2nd Cross, Tumakuru',
      district: 'Tumakuru'
    });
  });

  it('createDeliveryRequest uses exact saved coordinates from listing and recipient profile', async () => {
    const mockListing = {
      id: 'listing_99',
      title: 'Rice and Sambar 40 portions',
      quantity: 40,
      unit: 'meals',
      donorId: 'donor_99',
      donorName: 'Bengaluru Caterers',
      contactPhone: '9888877777',
      address: 'Koramangala 4th Block, Bengaluru',
      district: 'Bengaluru Urban',
      latitude: 12.9345,
      longitude: 77.6250,
      location: {
        latitude: 12.9345,
        longitude: 77.6250,
        address: 'Koramangala 4th Block, Bengaluru',
        district: 'Bengaluru Urban'
      }
    };

    const mockRecipientProfile = {
      userId: 'rec_88',
      organizationName: 'Shanti Old Age Home',
      phone: '9777766666',
      address: 'BTM 2nd Stage, Bengaluru',
      district: 'Bengaluru Urban',
      latitude: 12.9150,
      longitude: 77.6100,
      location: {
        latitude: 12.9150,
        longitude: 77.6100,
        address: 'BTM 2nd Stage, Bengaluru',
        district: 'Bengaluru Urban'
      }
    };

    const deliveryId = await createDeliveryRequest(
      {},
      mockListing,
      mockRecipientProfile,
      {
        totalAmount: 60,
        donorContribution: 30,
        recipientContribution: 30,
        initiatorRole: 'recipient'
      }
    );

    expect(deliveryId).toBeDefined();
    expect(capturedDeliveryData).toBeDefined();
    expect(capturedDeliveryData.pickupLatitude).toBe(12.9345);
    expect(capturedDeliveryData.pickupLongitude).toBe(77.6250);
    expect(capturedDeliveryData.pickupAddress).toBe('Koramangala 4th Block, Bengaluru');
    expect(capturedDeliveryData.dropoffLatitude).toBe(12.9150);
    expect(capturedDeliveryData.dropoffLongitude).toBe(77.6100);
    expect(capturedDeliveryData.dropoffAddress).toBe('BTM 2nd Stage, Bengaluru');
  });

  it('updateDeliveryPartnerLiveLocation broadcasts live GPS position during transit', async () => {
    await updateDeliveryPartnerLiveLocation({}, 'courier_007', {
      latitude: 12.9755,
      longitude: 77.5980
    });

    expect(capturedPartnerUpdates).toBeDefined();
    expect(capturedPartnerUpdates.currentLocation).toBeDefined();
    expect(capturedPartnerUpdates.currentLocation.latitude).toBe(12.9755);
    expect(capturedPartnerUpdates.currentLocation.longitude).toBe(77.5980);
  });
});
