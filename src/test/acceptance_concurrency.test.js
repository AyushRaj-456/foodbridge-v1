import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptDonationAtomic, declineDonation } from '../services/acceptanceService';

// Module-level mock state
const mockDbState = {
  listing: {},
  recipient: {}
};

vi.mock('../services/chatService', () => ({
  getOrCreateConversation: vi.fn(async () => ({ id: 'mock_conv' })),
  addDeliveryPartnerToConversation: vi.fn(async () => ({})),
  sendChatMessage: vi.fn(async () => ({ id: 'mock_msg' }))
}));

vi.mock('../services/notificationService', () => ({
  sendInAppNotification: vi.fn(async () => ({ id: 'mock_notif' })),
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
  addDoc: vi.fn(async () => ({ id: 'mock_id' })),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  arrayUnion: vi.fn((val) => [val]),
  updateDoc: vi.fn(async (ref, updates) => {
    if (ref.path.includes('listings')) {
      mockDbState.listing = { ...mockDbState.listing, ...updates };
    }
  }),
  runTransaction: vi.fn(async (db, updateFunction) => {
    const transaction = {
      get: vi.fn(async (ref) => {
        if (ref.path.includes('listings')) {
          return {
            exists: () => Boolean(mockDbState.listing),
            data: () => mockDbState.listing
          };
        }
        if (ref.path.includes('recipients')) {
          return {
            exists: () => Boolean(mockDbState.recipient),
            data: () => mockDbState.recipient
          };
        }
        return { exists: () => false };
      }),
      update: vi.fn((ref, updates) => {
        if (ref.path.includes('listings')) {
          mockDbState.listing = { ...mockDbState.listing, ...updates };
        }
        if (ref.path.includes('recipients')) {
          mockDbState.recipient = { ...mockDbState.recipient, ...updates };
        }
      })
    };
    return await updateFunction(transaction);
  })
}));

describe('Acceptance and Concurrency (Single-Claim Atomic Locking)', () => {
  beforeEach(() => {
    mockDbState.listing = {
      status: 'matching',
      quantity: 50,
      eligibleCategories: ['human', 'animal'],
      safeUseDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours in future
      declinedRecipientIds: []
    };

    mockDbState.recipient = {
      verificationStatus: 'verified',
      category: 'human',
      totalCapacity: 500,
      committedCapacity: 100,
      availableAdditionalCapacity: 400
    };
  });

  it('atomically claims an available matching listing', async () => {
    const result = await acceptDonationAtomic({}, 'listing-1', 'rec-1', { organizationName: 'Ashraya Home' });

    expect(result.success).toBe(true);
    expect(mockDbState.listing.status).toBe('accepted');
    expect(mockDbState.listing.acceptedRecipientId).toBe('rec-1');
    expect(mockDbState.recipient.committedCapacity).toBe(150);
    expect(mockDbState.recipient.availableAdditionalCapacity).toBe(350);
  });

  it('rejects a second simultaneous organization with ALREADY_ACCEPTED', async () => {
    mockDbState.listing.status = 'accepted';
    mockDbState.listing.acceptedRecipientId = 'first-org';

    await expect(
      acceptDonationAtomic({}, 'listing-1', 'second-org', { organizationName: 'Other Shelter' })
    ).rejects.toThrow(/already claimed by another organization/i);
  });

  it('rejects an expired listing', async () => {
    mockDbState.listing.safeUseDeadline = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // Expired 30 mins ago

    await expect(
      acceptDonationAtomic({}, 'listing-expired', 'rec-1', {})
    ).rejects.toThrow(/safe-use deadline for this food listing has passed/i);
  });

  it('rejects acceptance if recipient category is ineligible for the food item', async () => {
    mockDbState.listing.eligibleCategories = ['compost', 'biogas']; // Ineligible for human

    await expect(
      acceptDonationAtomic({}, 'listing-compost', 'rec-1', {})
    ).rejects.toThrow(/restricted to eligible categories/i);
  });

  it('rejects acceptance if recipient has insufficient available additional capacity', async () => {
    mockDbState.recipient.totalCapacity = 100;
    mockDbState.recipient.committedCapacity = 90;
    mockDbState.recipient.availableAdditionalCapacity = 10; // Only 10 available, listing requires 50

    await expect(
      acceptDonationAtomic({}, 'listing-1', 'rec-1', {})
    ).rejects.toThrow(/insufficient available additional capacity/i);
  });

  it('declining a donation records recipient decline without cancelling listing for others', async () => {
    await declineDonation({}, 'listing-1', 'declining-org');

    // Listing must still remain in matching status for other organizations
    expect(mockDbState.listing.status).toBe('matching');
  });
});
