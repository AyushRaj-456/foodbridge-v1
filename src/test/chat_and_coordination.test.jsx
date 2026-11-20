import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DonationChatModal } from '../components/chat/DonationChatModal';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { DeliveryRouteModal } from '../components/map/DeliveryRouteModal';
import { calculateDeliveryFare } from '../config/deliveryPricing';
import * as chatService from '../services/chatService';
import * as deliveryService from '../services/deliveryService';
import * as notificationService from '../services/notificationService';
import * as routingService from '../services/routingService';

// Mock Leaflet
vi.mock('leaflet', () => {
  const mapObj = {
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn()
  };
  return {
    default: {
      map: vi.fn(() => mapObj),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      marker: vi.fn(() => ({
        addTo: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis()
      })),
      polyline: vi.fn(() => ({
        addTo: vi.fn().mockReturnThis(),
        getBounds: vi.fn(() => [[12.9716, 77.5946], [12.9740, 77.5990]])
      })),
      divIcon: vi.fn((opts) => opts)
    }
  };
});

// Mock Auth Context
const mockUser = { uid: 'recip_123', email: 'ngo@shelter.org', displayName: 'City Shelter NGO' };
const mockProfile = { organizationName: 'City Shelter NGO', verificationStatus: 'verified' };

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    profileData: mockProfile
  })
}));

// Mock Firebase
vi.mock('../services/firebase', () => ({
  db: {},
  doc: vi.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  collection: vi.fn((db, ...path) => ({ path: path.join('/') })),
  addDoc: vi.fn(async () => ({ id: 'new_msg_id' })),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    id: 'conv_listing_001',
    data: () => ({
      id: 'conv_listing_001',
      donationId: 'listing_001',
      donationTitle: '50 Cooked Lunch Meals',
      donorId: 'donor_999',
      donorName: 'Grand Palace Hotel',
      recipientId: 'recip_123',
      recipientName: 'City Shelter NGO',
      participantUids: ['donor_999', 'recip_123'],
      isThreePartyGroup: false
    })
  })),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn(() => ({ path: 'conversations/listing_001/messages' })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  onSnapshot: vi.fn((ref, callback) => {
    // If listening to document snapshot (subscribeToConversation)
    if (ref?.path && !ref.path.includes('/messages')) {
      callback({
        exists: () => true,
        id: 'conv_listing_001',
        data: () => ({
          id: 'conv_listing_001',
          donationId: 'listing_001',
          donationTitle: '50 Cooked Lunch Meals',
          donorId: 'donor_999',
          donorName: 'Grand Palace Hotel',
          recipientId: 'recip_123',
          recipientName: 'City Shelter NGO',
          participantUids: ['donor_999', 'recip_123'],
          isThreePartyGroup: false
        })
      });
      return () => {};
    }

    // Otherwise collection / messages query
    callback({
      docs: [
        {
          id: 'msg_1',
          data: () => ({
            senderId: 'donor_999',
            senderName: 'Grand Palace Hotel',
            senderRole: 'donor',
            text: 'Hello! The meals are packed in food-grade steel containers.',
            createdAt: { toDate: () => new Date('2026-11-20T10:00:00Z') }
          })
        },
        {
          id: 'msg_2',
          data: () => ({
            senderId: 'system',
            senderName: 'FoodBridge System',
            senderRole: 'system',
            text: 'Donation accepted by City Shelter NGO.',
            isSystemMessage: true,
            createdAt: { toDate: () => new Date('2026-11-20T10:01:00Z') }
          })
        }
      ]
    });
    return () => {};
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  arrayUnion: vi.fn((val) => [val])
}));

describe('Chat, Delivery Coordination & Route Map Suite', () => {
  const sampleDonation = {
    id: 'listing_001',
    title: '50 Cooked Lunch Meals',
    donorId: 'donor_999',
    donorName: 'Grand Palace Hotel',
    acceptedRecipientId: 'recip_123',
    acceptedRecipientName: 'City Shelter NGO',
    quantity: 50,
    unit: 'meals',
    address: 'MG Road, Bengaluru',
    district: 'Bengaluru Urban',
    latitude: 12.9716,
    longitude: 77.5946,
    acceptedRecipientLatitude: 12.9740,
    acceptedRecipientLongitude: 77.5990,
    acceptedRecipientAddress: 'Indiranagar, Bengaluru'
  };

  it('FEATURE 1: renders DonationChatModal with participant info, message history and auto-scroll', async () => {
    render(<DonationChatModal donation={sampleDonation} onClose={vi.fn()} />);

    expect(screen.getByText('50 Cooked Lunch Meals')).toBeInTheDocument();
    expect(screen.getAllByText('Grand Palace Hotel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Hello! The meals are packed in food-grade steel containers./i)).toBeInTheDocument();
    expect(screen.getByText(/Donation accepted by City Shelter NGO/i)).toBeInTheDocument();
  });

  it('FEATURE 1: allows typing and sending a chat message', async () => {
    const sendSpy = vi.spyOn(chatService, 'sendChatMessage').mockResolvedValue({ id: 'msg_new' });

    render(<DonationChatModal donation={sampleDonation} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/coordinate pickup or delivery/i);
    fireEvent.change(input, { target: { value: 'We will dispatch our volunteer at 11:30 AM.' } });
    expect(input.value).toBe('We will dispatch our volunteer at 11:30 AM.');

    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith(
        undefined,
        'listing_001',
        expect.objectContaining({
          senderId: 'recip_123',
          text: 'We will dispatch our volunteer at 11:30 AM.'
        })
      );
    });

    sendSpy.mockRestore();
  });

  it('FEATURE 2: displays Request Delivery Partner button and regional partner availability inside chat', async () => {
    vi.spyOn(deliveryService, 'getRegionPartnerAvailability').mockResolvedValue({
      district: 'Bengaluru Urban',
      totalInRegion: 5,
      availableCount: 2,
      freePartners: [
        { id: 'p1', userId: 'p1', fullName: 'Ramesh Kumar', verificationStatus: 'verified' }
      ]
    });

    render(<DonationChatModal donation={sampleDonation} onClose={vi.fn()} />);

    // Check request button is visible
    expect(await screen.findByRole('button', { name: /request delivery partner/i })).toBeInTheDocument();
    // Check region partner count and free count badge
    expect(await screen.findByText(/5 in Bengaluru Urban, 2 available/i)).toBeInTheDocument();
  });

  it('FEATURE 2: triggers auto-assignment of random free delivery partner when requested', async () => {
    const assignSpy = vi.spyOn(deliveryService, 'requestAndAssignDeliveryPartner').mockResolvedValue({
      success: true,
      partner: { id: 'p1', fullName: 'Ramesh Kumar' },
      deliveryId: 'del_101',
      fare: { totalFare: 76, donorShare: 38, recipientShare: 38 },
      route: { distanceKm: 3.0, durationMin: 12 }
    });

    render(<DonationChatModal donation={sampleDonation} onClose={vi.fn()} />);

    const btn = await screen.findByRole('button', { name: /request delivery partner/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          donation: sampleDonation
        })
      );
    });

    expect(await screen.findByText(/Ramesh Kumar assigned! Total fee: ₹76/i)).toBeInTheDocument();
    assignSpy.mockRestore();
  });

  it('FEATURE 2: requestAndAssignDeliveryPartner sanitizes routeData and produces zero nested arrays in Firestore payload', async () => {
    let capturedDeliveryDoc = null;
    const mockDb = {};

    const firebaseModule = await import('../services/firebase');
    const origGetDocs = firebaseModule.getDocs;
    const origAddDoc = firebaseModule.addDoc;

    firebaseModule.getDocs = vi.fn(async () => ({
      docs: [{
        id: 'partner_01',
        data: () => ({
          userId: 'partner_01',
          fullName: 'Suresh Express',
          serviceDistrict: 'Bengaluru Urban',
          verificationStatus: 'verified',
          isAvailable: true,
          activeDeliveryId: null
        })
      }],
      empty: false
    }));

    firebaseModule.addDoc = vi.fn(async (colRef, data) => {
      // Capture the deliveries collection document
      if (data?.listingId && !capturedDeliveryDoc) {
        capturedDeliveryDoc = data;
      }
      return { id: 'del_mock_123' };
    });

    const res = await deliveryService.requestAndAssignDeliveryPartner(mockDb, {
      donation: sampleDonation,
      requestedBy: 'recipient',
      requesterName: 'City Shelter NGO'
    });

    expect(res.success).toBe(true);
    expect(capturedDeliveryDoc).not.toBeNull();

    // Check recursive nested arrays
    const hasNestedArray = (obj) => {
      if (Array.isArray(obj)) {
        return obj.some(item => Array.isArray(item));
      }
      if (obj && typeof obj === 'object') {
        return Object.values(obj).some(val => hasNestedArray(val));
      }
      return false;
    };

    expect(hasNestedArray(capturedDeliveryDoc)).toBe(false);
    expect(typeof capturedDeliveryDoc.routeData?.coordinatesJson).toBe('string');

    firebaseModule.getDocs = origGetDocs;
    firebaseModule.addDoc = origAddDoc;
  });

  it('FEATURE 3: calculates transparent 50/50 delivery fare with configurable base fee and per-km rate', () => {
    // 5 km route: Base ₹40 + (5 × ₹12) = ₹100. Donor: ₹50, Recipient: ₹50
    const fare5km = calculateDeliveryFare(5.0);
    expect(fare5km.totalFare).toBe(100);
    expect(fare5km.donorShare).toBe(50);
    expect(fare5km.recipientShare).toBe(50);

    // 0.5 km route: Base ₹40 + (0.5 × ₹12) = ₹46 -> Min fare ₹50. Donor: ₹25, Recipient: ₹25
    const fareShort = calculateDeliveryFare(0.5);
    expect(fareShort.totalFare).toBe(50);
    expect(fareShort.donorShare).toBe(25);
    expect(fareShort.recipientShare).toBe(25);
  });

  it('FEATURE 4: renders DeliveryRouteModal with shortest route distance, travel time, and 50/50 fare', async () => {
    vi.spyOn(routingService, 'calculateRouteAndFare').mockResolvedValue({
      distanceKm: 4.2,
      durationMin: 15,
      coordinates: [[12.9716, 77.5946], [12.9740, 77.5990]],
      fare: { totalFare: 90, donorShare: 45, recipientShare: 45 },
      isRealRoadRoute: true
    });

    render(<DeliveryRouteModal donation={sampleDonation} onClose={vi.fn()} />);

    expect(await screen.findByText('4.2 km')).toBeInTheDocument();
    expect(await screen.findByText('~15 mins')).toBeInTheDocument();
    expect(await screen.findByText('₹90')).toBeInTheDocument();
    expect(await screen.findByText(/₹45 each/i)).toBeInTheDocument();
    expect(screen.getByText('MG Road, Bengaluru')).toBeInTheDocument();
    expect(screen.getByText('Indiranagar, Bengaluru')).toBeInTheDocument();
  });

  it('renders NotificationBell with unread count badge and toggles notifications dropdown', async () => {
    vi.spyOn(notificationService, 'subscribeToUserNotifications').mockImplementation((db, uid, callback) => {
      callback({
        notifications: [
          {
            id: 'notif_1',
            title: 'Donation Accepted',
            body: 'Your donation has been accepted by City Shelter NGO',
            read: false,
            createdAt: { toDate: () => new Date() }
          },
          {
            id: 'notif_2',
            title: 'New Chat Message',
            body: 'Grand Palace Hotel sent a message',
            read: true,
            createdAt: { toDate: () => new Date() }
          }
        ],
        unreadCount: 1
      });
      return () => {};
    });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    // Unread count badge of 1 should be visible
    expect(screen.getByText('1')).toBeInTheDocument();

    // Click bell icon to open dropdown
    const bellBtn = screen.getByLabelText(/notifications/i);
    fireEvent.click(bellBtn);

    // Dropdown content should appear
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Donation Accepted')).toBeInTheDocument();
    expect(screen.getByText('New Chat Message')).toBeInTheDocument();
    expect(screen.getByText('Mark all read')).toBeInTheDocument();
  });
});
