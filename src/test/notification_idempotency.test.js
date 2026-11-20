import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMatchingCycle } from '../services/matchingScheduler';

// Module-level mock state
const mockDb = {
  listings: {},
  recipients: {},
  notifications: []
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((db, name) => ({ path: name })),
  query: vi.fn((colRef, ...conditions) => ({ colRef, conditions })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  arrayUnion: vi.fn((...items) => items),
  addDoc: vi.fn(async (colRef, data) => {
    const id = 'notif_' + Math.random().toString(36).substring(7);
    mockDb.notifications.push({ id, ...data });
    return { id };
  }),
  updateDoc: vi.fn(async (ref, updates) => {
    const [col, id] = ref.path.split('/');
    if (mockDb[col] && mockDb[col][id]) {
      const current = mockDb[col][id];
      let updatedIds = current.notifiedRecipientIds || [];
      if (updates.notifiedRecipientIds) {
        const items = Array.isArray(updates.notifiedRecipientIds)
          ? updates.notifiedRecipientIds
          : [updates.notifiedRecipientIds];
        updatedIds = Array.from(new Set([...updatedIds, ...items]));
      }
      mockDb[col][id] = {
        ...current,
        ...updates,
        notifiedRecipientIds: updatedIds
      };
    }
  }),
  getDocs: vi.fn(async (q) => {
    const colName = q.colRef?.path || '';
    if (colName === 'listings') {
      const docs = Object.values(mockDb.listings)
        .filter((l) => l.status === 'matching')
        .map((l) => ({ id: l.id, data: () => l }));
      return { empty: docs.length === 0, docs };
    }
    if (colName === 'recipients') {
      const docs = Object.values(mockDb.recipients)
        .filter((r) => r.verificationStatus === 'verified' && r.operationalStatus !== 'paused' && !r.suspended)
        .map((r) => ({ id: r.id, data: () => r }));
      return { empty: docs.length === 0, docs };
    }
    return { empty: true, docs: [] };
  })
}));

describe('Notification Idempotency & Radius Expansion Scheduler', () => {
  const futureDeadline = new Date(Date.now() + 6 * 3600000).toISOString();

  beforeEach(() => {
    mockDb.notifications = [];
    mockDb.listings = {
      list_1: {
        id: 'list_1',
        title: '50 Hot Meals',
        status: 'matching',
        quantity: 50,
        unit: 'meals',
        latitude: 12.9716, // Bengaluru center
        longitude: 77.5946,
        safeUseDeadline: futureDeadline,
        matchingRadiusKm: 1.5,
        radiusExpansionCount: 0,
        lastRadiusExpandedAt: null,
        createdAt: new Date(Date.now() - 3 * 3600000), // 3 hours ago (expansion due)
        eligibleCategories: ['human'],
        notifiedRecipientIds: [],
        declinedRecipientIds: []
      }
    };

    mockDb.recipients = {
      rec_near: {
        id: 'rec_near',
        userId: 'rec_near',
        organizationName: 'Near Shelter',
        category: 'human',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        availableAdditionalCapacity: 100,
        latitude: 12.9750, // ~0.5 km away
        longitude: 77.5950
      },
      rec_outer: {
        id: 'rec_outer',
        userId: 'rec_outer',
        organizationName: 'Outer Shelter',
        category: 'human',
        verificationStatus: 'verified',
        operationalStatus: 'active',
        availableAdditionalCapacity: 100,
        latitude: 12.9900, // ~2.5 km away (outside 1.5km, inside 3km)
        longitude: 77.5950
      }
    };
  });

  it('runs matching cycle and notifies eligible recipient within initial radius', async () => {
    const res = await runMatchingCycle({});
    expect(res.processedListings).toBe(1);
    expect(res.notificationsSent).toBeGreaterThanOrEqual(1);

    // Near recipient should be notified
    const nearNotif = mockDb.notifications.find((n) => n.recipientId === 'rec_near');
    expect(nearNotif).toBeDefined();

    // Listing updated with notified recipient ID
    expect(mockDb.listings['list_1'].notifiedRecipientIds).toContain('rec_near');
  });

  it('NEVER sends duplicate notifications on subsequent matching runs (Idempotency)', async () => {
    // 1st run
    await runMatchingCycle({});
    const initialNotifCount = mockDb.notifications.length;

    // 2nd immediate re-run (same listing and radius)
    const secondRun = await runMatchingCycle({});
    expect(secondRun.notificationsSent).toBe(0); // 0 new notifications
    expect(mockDb.notifications.length).toBe(initialNotifCount); // count unchanged
  });

  it('never notifies recipients who explicitly declined the listing', async () => {
    mockDb.listings['list_1'].declinedRecipientIds = ['rec_near'];
    mockDb.listings['list_1'].notifiedRecipientIds = [];

    const res = await runMatchingCycle({});
    const nearNotif = mockDb.notifications.find((n) => n.recipientId === 'rec_near');
    expect(nearNotif).toBeUndefined();
  });

  it('marks listing as expired when safe-use deadline has elapsed', async () => {
    mockDb.listings['list_1'].safeUseDeadline = new Date(Date.now() - 3600000).toISOString(); // 1 hour in past

    await runMatchingCycle({});
    expect(mockDb.listings['list_1'].status).toBe('expired');
  });
});
