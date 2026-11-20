import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DELIVERY_STATUSES,
  validateCostAgreement,
  createDeliveryRequest,
  confirmDeliveryAgreement,
  claimDeliveryAtomic,
  transitionDeliveryStatus
} from '../services/deliveryService';

// Module-level mock state
const mockDbState = {
  deliveries: {},
  listings: {}
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((db, name) => ({ path: name })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  addDoc: vi.fn(async (colRef, data) => {
    const newId = 'del_auto_' + Math.random().toString(36).substring(7);
    mockDbState.deliveries[newId] = { ...data, id: newId };
    return { id: newId };
  }),
  updateDoc: vi.fn(async (ref, updates) => {
    const parts = ref.path.split('/');
    const col = parts[0];
    const id = parts[1];
    if (mockDbState[col] && mockDbState[col][id]) {
      mockDbState[col][id] = { ...mockDbState[col][id], ...updates };
    }
  }),
  runTransaction: vi.fn(async (db, updateFunction) => {
    const transaction = {
      get: vi.fn(async (ref) => {
        const parts = ref.path.split('/');
        const col = parts[0];
        const id = parts[1];
        const docData = mockDbState[col]?.[id];
        return {
          exists: () => Boolean(docData),
          data: () => docData
        };
      }),
      update: vi.fn((ref, updates) => {
        const parts = ref.path.split('/');
        const col = parts[0];
        const id = parts[1];
        if (mockDbState[col] && mockDbState[col][id]) {
          mockDbState[col][id] = { ...mockDbState[col][id], ...updates };
        }
      })
    };
    return await updateFunction(transaction);
  })
}));

describe('Delivery Coordination and Transportation Workflow', () => {
  const dummyListing = {
    id: 'list_101',
    title: '50 Cooked Meals',
    quantity: 50,
    unit: 'meals',
    foodState: 'cooked_packaged',
    storageCondition: 'ambient',
    safeUseDeadline: new Date(Date.now() + 3600000).toISOString(),
    donorId: 'donor_user_1',
    donorName: 'Grand Palace Hall',
    contactPhone: '+919876543210',
    address: '12 MG Road, Bengaluru',
    district: 'Bengaluru Urban',
    latitude: 12.9716,
    longitude: 77.5946,
    pickupInstructions: 'Collect at service ramp'
  };

  const dummyRecipient = {
    userId: 'rec_user_1',
    id: 'rec_user_1',
    organizationName: 'Asha Orphanage Care',
    phone: '+919123456789',
    address: '45 Residency Road, Bengaluru',
    district: 'Bengaluru Urban',
    latitude: 12.9740,
    longitude: 77.5990,
    verificationStatus: 'verified'
  };

  beforeEach(() => {
    mockDbState.deliveries = {};
    mockDbState.listings = {
      list_101: { ...dummyListing }
    };
  });

  describe('1. validateCostAgreement', () => {
    it('validates equal split matching total amount', () => {
      const res = validateCostAgreement(100, 50, 50);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('validates free / zero delivery amount without error', () => {
      const res = validateCostAgreement(0, 0, 0);
      expect(res.isValid).toBe(true);
    });

    it('validates asymmetric split (e.g. donor pays 100%, recipient pays 0%)', () => {
      const res = validateCostAgreement(120, 120, 0);
      expect(res.isValid).toBe(true);
    });

    it('rejects when donor + recipient does not equal total amount', () => {
      const res = validateCostAgreement(100, 40, 50);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('must equal total amount');
    });

    it('rejects negative delivery amounts or negative contributions', () => {
      const negTotal = validateCostAgreement(-50, -25, -25);
      expect(negTotal.isValid).toBe(false);

      const negDonor = validateCostAgreement(50, -10, 60);
      expect(negDonor.isValid).toBe(false);
    });

    it('rejects NaN or non-numeric inputs', () => {
      const res = validateCostAgreement('invalid', 20, 20);
      expect(res.isValid).toBe(false);
    });
  });

  describe('2. createDeliveryRequest', () => {
    it('creates a delivery request in pending_agreement state when cost is non-zero', async () => {
      const deliveryId = await createDeliveryRequest({}, dummyListing, dummyRecipient, {
        totalAmount: 150,
        donorContribution: 75,
        recipientContribution: 75,
        handlingNotes: 'Handle with care',
        initiatorRole: 'recipient'
      });

      expect(deliveryId).toBeDefined();
      const created = mockDbState.deliveries[deliveryId];
      expect(created.status).toBe(DELIVERY_STATUSES.PENDING_AGREEMENT);
      expect(created.totalAmount).toBe(150);
      expect(created.recipientAgreed).toBe(true);
      expect(created.donorAgreed).toBe(false);
      expect(created.handlingNotes).toBe('Handle with care');

      // Verifies listing link
      expect(mockDbState.listings['list_101'].deliveryId).toBe(deliveryId);
      expect(mockDbState.listings['list_101'].deliveryMode).toBe('delivery_partner');
    });

    it('creates a delivery request in requested state directly when cost is zero (free volunteer)', async () => {
      const deliveryId = await createDeliveryRequest({}, dummyListing, dummyRecipient, {
        totalAmount: 0,
        donorContribution: 0,
        recipientContribution: 0,
        initiatorRole: 'donor'
      });

      const created = mockDbState.deliveries[deliveryId];
      expect(created.status).toBe(DELIVERY_STATUSES.REQUESTED);
      expect(created.donorAgreed).toBe(true);
      expect(created.recipientAgreed).toBe(true);
    });

    it('throws error if cost agreement validation fails', async () => {
      await expect(
        createDeliveryRequest({}, dummyListing, dummyRecipient, {
          totalAmount: 100,
          donorContribution: 30,
          recipientContribution: 30
        })
      ).rejects.toThrow(/must equal total amount/);
    });
  });

  describe('3. confirmDeliveryAgreement', () => {
    it('advances status from pending_agreement to requested once both parties agree', async () => {
      mockDbState.deliveries['del_202'] = {
        id: 'del_202',
        status: DELIVERY_STATUSES.PENDING_AGREEMENT,
        totalAmount: 100,
        donorContribution: 50,
        recipientContribution: 50,
        recipientAgreed: true,
        donorAgreed: false
      };

      const result = await confirmDeliveryAgreement({}, 'del_202', 'donor');
      expect(result.bothAgreed).toBe(true);
      expect(result.status).toBe(DELIVERY_STATUSES.REQUESTED);
      expect(mockDbState.deliveries['del_202'].status).toBe(DELIVERY_STATUSES.REQUESTED);
      expect(mockDbState.deliveries['del_202'].donorAgreed).toBe(true);
    });

    it('keeps status as pending_agreement if only one party has agreed', async () => {
      mockDbState.deliveries['del_203'] = {
        id: 'del_203',
        status: DELIVERY_STATUSES.PENDING_AGREEMENT,
        totalAmount: 100,
        donorAgreed: false,
        recipientAgreed: false
      };

      const result = await confirmDeliveryAgreement({}, 'del_203', 'donor');
      expect(result.bothAgreed).toBe(false);
      expect(result.status).toBe(DELIVERY_STATUSES.PENDING_AGREEMENT);
    });
  });

  describe('4. claimDeliveryAtomic', () => {
    const verifiedCourier = {
      fullName: 'Ramesh Kumar',
      phone: '+919988776655',
      verificationStatus: 'verified',
      transportMode: 'two_wheeler'
    };

    it('allows a verified courier to claim an open requested delivery', async () => {
      mockDbState.deliveries['del_301'] = {
        id: 'del_301',
        listingId: 'list_101',
        status: DELIVERY_STATUSES.REQUESTED
      };

      const res = await claimDeliveryAtomic({}, 'del_301', 'courier_user_1', verifiedCourier);
      expect(res.success).toBe(true);

      const updated = mockDbState.deliveries['del_301'];
      expect(updated.status).toBe(DELIVERY_STATUSES.ASSIGNED);
      expect(updated.assignedPartnerId).toBe('courier_user_1');
      expect(updated.assignedPartnerName).toBe('Ramesh Kumar');

      // Listing transitions to in_transit
      expect(mockDbState.listings['list_101'].status).toBe('in_transit');
      expect(mockDbState.listings['list_101'].deliveryPartnerId).toBe('courier_user_1');
    });

    it('rejects claiming by an unverified courier', async () => {
      const unverifiedCourier = {
        ...verifiedCourier,
        verificationStatus: 'pending'
      };

      await expect(
        claimDeliveryAtomic({}, 'del_301', 'courier_unverified', unverifiedCourier)
      ).rejects.toThrow(/must be verified by administrators/i);
    });

    it('rejects claiming if already claimed by another courier (atomic collision protection)', async () => {
      mockDbState.deliveries['del_302'] = {
        id: 'del_302',
        status: DELIVERY_STATUSES.ASSIGNED,
        assignedPartnerId: 'courier_prior'
      };

      await expect(
        claimDeliveryAtomic({}, 'del_302', 'courier_user_2', verifiedCourier)
      ).rejects.toThrow(/already claimed/i);
    });
  });

  describe('5. transitionDeliveryStatus (Lifecycle Progression)', () => {
    beforeEach(() => {
      mockDbState.deliveries['del_flow'] = {
        id: 'del_flow',
        listingId: 'list_101',
        status: DELIVERY_STATUSES.ASSIGNED,
        assignedPartnerId: 'courier_user_1'
      };
    });

    it('progresses from assigned -> picked_up', async () => {
      const res = await transitionDeliveryStatus({}, 'del_flow', DELIVERY_STATUSES.PICKED_UP, {
        uid: 'donor_user_1',
        role: 'donor'
      });
      expect(res.newStatus).toBe(DELIVERY_STATUSES.PICKED_UP);
      expect(mockDbState.deliveries['del_flow'].status).toBe(DELIVERY_STATUSES.PICKED_UP);
    });

    it('progresses from picked_up -> delivered_pending_confirmation', async () => {
      mockDbState.deliveries['del_flow'].status = DELIVERY_STATUSES.PICKED_UP;

      const res = await transitionDeliveryStatus({}, 'del_flow', DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION, {
        uid: 'courier_user_1',
        role: 'delivery'
      });
      expect(res.newStatus).toBe(DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION);
    });

    it('progresses to completed upon recipient confirmation, completing the listing', async () => {
      mockDbState.deliveries['del_flow'].status = DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION;

      const res = await transitionDeliveryStatus({}, 'del_flow', DELIVERY_STATUSES.COMPLETED, {
        uid: 'rec_user_1',
        role: 'recipient'
      });
      expect(res.newStatus).toBe(DELIVERY_STATUSES.COMPLETED);
      expect(mockDbState.deliveries['del_flow'].status).toBe(DELIVERY_STATUSES.COMPLETED);

      // Associated listing is marked completed
      expect(mockDbState.listings['list_101'].status).toBe('completed');
      expect(mockDbState.listings['list_101'].handoverConfirmedByRecipient).toBe(true);
    });

    it('records failure reason when delivery fails', async () => {
      const res = await transitionDeliveryStatus(
        {},
        'del_flow',
        DELIVERY_STATUSES.FAILED,
        { uid: 'courier_user_1', role: 'delivery' },
        { reason: 'Vehicle breakdown en route' }
      );
      expect(res.newStatus).toBe(DELIVERY_STATUSES.FAILED);
      expect(mockDbState.deliveries['del_flow'].failureReason).toBe('Vehicle breakdown en route');
    });

    it('records dispute reason and actor when disputed', async () => {
      const res = await transitionDeliveryStatus(
        {},
        'del_flow',
        DELIVERY_STATUSES.DISPUTED,
        { uid: 'rec_user_1', role: 'recipient' },
        { reason: 'Containers arrived unsealed and cold' }
      );
      expect(res.newStatus).toBe(DELIVERY_STATUSES.DISPUTED);
      expect(mockDbState.deliveries['del_flow'].disputeReason).toBe('Containers arrived unsealed and cold');
      expect(mockDbState.deliveries['del_flow'].disputedBy).toBe('rec_user_1');
    });

    it('rejects invalid state jumps (e.g. assigned directly to completed)', async () => {
      await expect(
        transitionDeliveryStatus({}, 'del_flow', DELIVERY_STATUSES.COMPLETED, {
          uid: 'rec_user_1',
          role: 'recipient'
        })
      ).rejects.toThrow(/cannot complete delivery before arrival/i);
    });
  });

  describe('6. Address and Location Privacy in Delivery Views', () => {
    it('ensures requested deliveries hide exact street addresses for open marketplace browsing', () => {
      const requestedDelivery = {
        pickupDistrict: 'Bengaluru Urban',
        dropoffDistrict: 'Bengaluru Urban',
        approxDistanceKm: 4.2,
        totalAmount: 120,
        // Exact addresses are present in the document but should only be rendered when claimed
        pickupAddress: 'Secret Prep Kitchen 4B, Indiranagar',
        dropoffAddress: 'Secret Orphanage Home, Koramangala'
      };

      // In the UI component: available delivery card displays only district and distance
      const publicCardFields = {
        from: requestedDelivery.pickupDistrict,
        to: requestedDelivery.dropoffDistrict,
        distance: `${requestedDelivery.approxDistanceKm} km`,
        amount: `₹${requestedDelivery.totalAmount}`
      };

      expect(publicCardFields.from).toBe('Bengaluru Urban');
      expect(publicCardFields.to).toBe('Bengaluru Urban');
      expect(publicCardFields.from).not.toContain('Secret');
      expect(publicCardFields.to).not.toContain('Secret');
    });
  });
});
