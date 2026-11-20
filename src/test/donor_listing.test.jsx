import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { CreateListingPage } from '../pages/donor/CreateListingPage';
import { DonorDashboardPage } from '../pages/donor/DonorDashboardPage';
import { addDoc, getDocs, updateDoc } from '../services/firebase';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({})
  };
});

vi.mock('../services/firebase', async () => {
  const actual = await vi.importActual('../services/firebase');
  return {
    ...actual,
    addDoc: vi.fn().mockResolvedValue({ id: 'new-listing-123' }),
    updateDoc: vi.fn().mockResolvedValue({}),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn(),
    serverTimestamp: () => ({ seconds: 123456789 })
  };
});

describe('Donor Listing Creation & Publish Button Behavior', () => {
  const mockDonorAuth = {
    user: { uid: 'donor-user-123', email: 'mess@college.edu' },
    userDoc: {
      uid: 'donor-user-123',
      roles: ['donor'],
      activeRole: 'donor',
      onboardingComplete: true,
      organizationName: 'BMS Hostel Mess',
      contactPhone: '+91 98765 11111',
      address: 'Bull Temple Road, Basavanagudi, Bengaluru'
    },
    profileData: {
      organizationName: 'BMS Hostel Mess',
      donorType: 'mess',
      contactPerson: 'Manager Ravi',
      phone: '+91 98765 11111',
      address: 'Bull Temple Road, Basavanagudi, Bengaluru',
      district: 'Bengaluru Urban'
    },
    loading: false,
    isAdmin: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  const renderCreatePage = () =>
    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockDonorAuth}>
          <MemoryRouter>
            <CreateListingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

  it('renders listing creation form with required fields and real-time safety evaluation', () => {
    renderCreatePage();

    expect(screen.getByLabelText(/food \/ material title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/food state \/ condition/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/current storage & holding condition/i)).toBeInTheDocument();
    expect(screen.getByText(/pure vegetarian/i)).toBeInTheDocument();
    expect(screen.getByText(/donor safety declaration/i)).toBeInTheDocument();
    expect(screen.getByText(/platform safety & eligibility evaluation/i)).toBeInTheDocument();
  });

  it('Publish Listing button is disabled initially when required fields or declaration are missing', () => {
    renderCreatePage();

    const publishBtn = screen.getByRole('button', { name: /publish food listing/i });
    expect(publishBtn).toBeInTheDocument();
    // Initially disabled because title is empty and declaration checkbox is false
    expect(publishBtn).toBeDisabled();
  });

  it('filling form fields updates form state without automatically publishing', () => {
    renderCreatePage();

    const titleInput = screen.getByLabelText(/food \/ material title/i);
    const quantityInput = screen.getByLabelText(/^quantity/i);

    // Enter values into title and quantity
    fireEvent.change(titleInput, { target: { value: 'Cooked Vegetable Biryani' } });
    fireEvent.change(quantityInput, { target: { value: '50' } });

    // Changing dropdown or radio options
    fireEvent.click(screen.getByText(/pure vegetarian/i));

    // Confirm that addDoc has NOT been triggered
    expect(addDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();

    // Form is still on the screen and Publish button is still disabled without declaration
    expect(screen.getByRole('button', { name: /publish food listing/i })).toBeDisabled();
  });

  it('pressing Enter on input does not automatically publish or submit the form', () => {
    renderCreatePage();

    const titleInput = screen.getByLabelText(/food \/ material title/i);
    fireEvent.change(titleInput, { target: { value: 'Fresh Chapati and Curry' } });

    // Press Enter
    fireEvent.keyDown(titleInput, { key: 'Enter', code: 'Enter' });

    expect(addDoc).not.toHaveBeenCalled();
  });

  it('Publish button enables when all required fields and declaration are satisfied, and publishes only on click', async () => {
    renderCreatePage();

    const titleInput = screen.getByLabelText(/food \/ material title/i);
    const quantityInput = screen.getByLabelText(/^quantity/i);
    const declarationCheckbox = screen.getByRole('checkbox');

    fireEvent.change(titleInput, { target: { value: 'Steamed Rice & Sambar' } });
    fireEvent.change(quantityInput, { target: { value: '40' } });
    fireEvent.click(declarationCheckbox);

    const publishBtn = screen.getByRole('button', { name: /publish food listing/i });

    // Now button should be enabled
    expect(publishBtn).not.toBeDisabled();

    // Nothing published yet
    expect(addDoc).not.toHaveBeenCalled();

    // Explicitly click Publish
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
    });
  });

  it('rapid multiple clicks on Publish button do not create duplicate listings', async () => {
    let resolveAddDoc;
    const pendingPromise = new Promise((resolve) => {
      resolveAddDoc = resolve;
    });
    addDoc.mockImplementationOnce(() => pendingPromise);

    renderCreatePage();

    fireEvent.change(screen.getByLabelText(/food \/ material title/i), { target: { value: 'Dal Makhani' } });
    fireEvent.click(screen.getByRole('checkbox'));

    const publishBtn = screen.getByRole('button', { name: /publish food listing/i });
    expect(publishBtn).not.toBeDisabled();

    // Click 3 times rapidly
    fireEvent.click(publishBtn);
    fireEvent.click(publishBtn);
    fireEvent.click(publishBtn);

    // Only 1 call is initiated
    expect(addDoc).toHaveBeenCalledTimes(1);

    // Resolve
    resolveAddDoc({ id: 'dal-123' });
  });

  it('renders donor dashboard with cached listings immediately from session storage in 0ms', async () => {
    const cachedData = [
      {
        id: 'cached-listing-1',
        title: 'Cached Rice & Dal',
        quantity: 25,
        unit: 'meals',
        status: 'matching',
        createdAt: { seconds: 1700000000 }
      }
    ];
    sessionStorage.setItem('foodbridge_donor_listings_donor-user-123', JSON.stringify(cachedData));

    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockDonorAuth}>
          <MemoryRouter>
            <DonorDashboardPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    // Immediately shows cached listing without waiting for server response
    expect(screen.getByText('Cached Rice & Dal')).toBeInTheDocument();
  });
});
