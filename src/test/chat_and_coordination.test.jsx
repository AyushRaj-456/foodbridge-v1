import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DonationChatModal } from '../components/chat/DonationChatModal';
import { NotificationBell } from '../components/notifications/NotificationBell';
import * as chatService from '../services/chatService';
import * as notificationService from '../services/notificationService';

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

describe('Chat and Coordination System', () => {
  const sampleDonation = {
    id: 'listing_001',
    title: '50 Cooked Lunch Meals',
    donorId: 'donor_999',
    donorName: 'Grand Palace Hotel',
    acceptedRecipientId: 'recip_123',
    acceptedRecipientName: 'City Shelter NGO',
    quantity: 50,
    unit: 'meals',
    address: 'MG Road, Bengaluru'
  };

  it('renders DonationChatModal with participant information and message history', async () => {
    render(<DonationChatModal donation={sampleDonation} onClose={vi.fn()} />);

    expect(screen.getByText('50 Cooked Lunch Meals')).toBeInTheDocument();
    expect(screen.getAllByText('Grand Palace Hotel').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Hello! The meals are packed in food-grade steel containers./i)).toBeInTheDocument();
    expect(screen.getByText(/Donation accepted by City Shelter NGO/i)).toBeInTheDocument();
  });

  it('allows typing and sending a chat message', async () => {
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
