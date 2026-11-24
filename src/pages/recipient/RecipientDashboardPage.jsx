import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  limit
} from '../../services/firebase';
import { calculateHaversineDistance } from '../../services/matchingEngine';
import { acceptDonationAtomic, declineDonation } from '../../services/acceptanceService';
import { runMatchingCycle } from '../../services/matchingScheduler';
import {
  DELIVERY_STATUSES,
  validateCostAgreement,
  createDeliveryRequest,
  confirmDeliveryAgreement,
  transitionDeliveryStatus
} from '../../services/deliveryService';
import { processDonationCompletionRewards } from '../../services/rewardService';
import {
  isPushNotificationSupported,
  getNotificationPermission,
  requestPushPermission,
  showLocalNotification
} from '../../services/notificationService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { EmptyState } from '../../components/common/EmptyState';
import { DonationChatModal } from '../../components/chat/DonationChatModal';
import { DeliveryRouteModal } from '../../components/map/DeliveryRouteModal';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Scale,
  Bell,
  BellRing,
  AlertTriangle,
  RefreshCw,
  Eye,
  Phone,
  Truck,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  PackageCheck,
  AlertCircle,
  MessageSquare,
  Navigation
} from 'lucide-react';

export function RecipientDashboardPage() {
  const { t } = useLocale();
  const { user, profileData, refreshUserProfile } = useAuth();

  // Fast session cache hydration for instant 0ms listing rendering
  const getCachedAvailable = () => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage || !user) return [];
      const raw = window.sessionStorage.getItem(`foodbridge_recipient_avail_${user.uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const getCachedAccepted = () => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage || !user) return [];
      const raw = window.sessionStorage.getItem(`foodbridge_recipient_accepted_${user.uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const initialAvail = getCachedAvailable();
  const initialAccepted = getCachedAccepted();

  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'accepted' | 'history' | 'settings'
  const [availableListings, setAvailableListings] = useState(initialAvail);
  const [acceptedListings, setAcceptedListings] = useState(initialAccepted);
  const [deliveriesMap, setDeliveriesMap] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(() => initialAvail.length === 0 && initialAccepted.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Modals
  const [inspectModal, setInspectModal] = useState(null); // listing object
  const [mapModalListing, setMapModalListing] = useState(null); // listing object

  // Delivery Request Modal
  const [deliveryModal, setDeliveryModal] = useState(null); // listing object
  const [deliveryTotal, setDeliveryTotal] = useState('100');
  const [deliveryDonorShare, setDeliveryDonorShare] = useState('50');
  const [deliveryRecipientShare, setDeliveryRecipientShare] = useState('50');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryFormError, setDeliveryFormError] = useState('');

  // Dispute Modal
  const [disputeModal, setDisputeModal] = useState(null); // delivery object
  const [disputeReason, setDisputeReason] = useState('');

  // Real-time In-App Chat Modal
  const [chatModalListing, setChatModalListing] = useState(null);

  // Capacity & Status local state
  const [availCapacity, setAvailCapacity] = useState(profileData?.availableAdditionalCapacity || 50);
  const [operationalStatus, setOperationalStatus] = useState(profileData?.operationalStatus || 'active');
  const [pushStatus, setPushStatus] = useState(getNotificationPermission());

  const fetchRecipientListings = async (isManualRefresh = false) => {
    if (!user || !profileData) return;
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else if (availableListings.length === 0 && acceptedListings.length === 0) {
        setLoading(true);
      }
      setErrorNotice('');

      // Run matching cycle in background without blocking recipient UI
      runMatchingCycle(db).catch((e) => console.warn('Background matching run:', e.message));

      // 1. Concurrently fetch matching listings, accepted listings, and notifications
      const q = query(collection(db, 'listings'), where('status', '==', 'matching'), limit(50));
      const acceptedQuery = query(collection(db, 'listings'), where('acceptedRecipientId', '==', user.uid), limit(50));
      const notifQuery = query(collection(db, 'notifications'), where('recipientId', '==', user.uid), limit(50));

      const [snap, acceptedSnap, notifSnap] = await Promise.all([
        getDocs(q),
        getDocs(acceptedQuery),
        getDocs(notifQuery)
      ]);

      const allMatching = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const myLat = profileData.latitude || 12.9716;
      const myLon = profileData.longitude || 77.5946;
      const myCategory = profileData.category || 'human';
      const myDeclined = profileData.declinedListingIds || [];

      // Filter listings matching this recipient
      const filtered = allMatching
        .filter((listing) => {
          // Must match category
          if (!listing.eligibleCategories?.includes(myCategory)) return false;
          // Must not be already declined by me
          if (listing.declinedRecipientIds?.includes(user.uid)) return false;
          if (myDeclined.includes(listing.id)) return false;

          // Calculate distance
          const distance = calculateHaversineDistance(myLat, myLon, listing.latitude, listing.longitude);
          listing.distanceKm = distance;

          // Check if within current matching radius
          const currentRadius = Number(listing.matchingRadiusKm) || 1.5;
          return distance <= currentRadius;
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);

      setAvailableListings(filtered);

      const acceptedItems = acceptedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      acceptedItems.sort((a, b) => (b.acceptedAt?.seconds || 0) - (a.acceptedAt?.seconds || 0));
      setAcceptedListings(acceptedItems);

      // Persist to session storage for instant 0ms subsequent renders
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(`foodbridge_recipient_avail_${user.uid}`, JSON.stringify(filtered));
          window.sessionStorage.setItem(`foodbridge_recipient_accepted_${user.uid}`, JSON.stringify(acceptedItems));
        }
      } catch (e) {}

      // Fetch linked delivery objects in parallel with deduplication
      const uniqueDeliveryIds = [...new Set(acceptedItems.map((i) => i.deliveryId).filter(Boolean))];
      if (uniqueDeliveryIds.length > 0) {
        const dSnaps = await Promise.all(
          uniqueDeliveryIds.map(async (id) => {
            try {
              const dSnap = await getDoc(doc(db, 'deliveries', id));
              return dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
            } catch (dErr) {
              console.warn('Could not load delivery info for', id, dErr);
              return null;
            }
          })
        );
        const dMap = {};
        dSnaps.forEach((d) => {
          if (d) dMap[d.id] = d;
        });
        setDeliveriesMap(dMap);
      } else {
        setDeliveriesMap({});
      }

      // Format in-app notifications
      const notifItems = notifSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notifItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotifications(notifItems);
    } catch (err) {
      console.error('Error loading recipient dashboard:', err);
      setErrorNotice('Error loading incoming donations: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecipientListings();
  }, [user, profileData]);

  // Handle Accept Donation (Atomic Concurrency Locking)
  const handleAcceptDonation = async (listing) => {
    try {
      setActionLoading(true);
      setErrorNotice('');
      setNotice('');

      const result = await acceptDonationAtomic(db, listing.id, user.uid, profileData);

      setNotice(`Successfully claimed "${listing.title}". Please arrange pickup with the donor.`);
      showLocalNotification(`FoodBridge: Claimed ${listing.title}`, {
        body: `Your organization successfully claimed ${listing.quantity} ${listing.unit}.`
      });

      await refreshUserProfile();
      await fetchRecipientListings();
      setActiveTab('accepted');
    } catch (err) {
      console.error('Acceptance error:', err);
      if (err.code === 'ALREADY_ACCEPTED') {
        setErrorNotice('This surplus food donation was just claimed by another organization.');
      } else if (err.code === 'INSUFFICIENT_CAPACITY') {
        setErrorNotice(err.message);
      } else if (err.code === 'LISTING_EXPIRED') {
        setErrorNotice('This listing has reached its safe-use deadline and cannot be accepted.');
      } else {
        setErrorNotice(err.message || 'Failed to claim donation.');
      }
      await fetchRecipientListings();
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Decline Donation (Does NOT cancel listing for others)
  const handleDeclineDonation = async (listing) => {
    try {
      setActionLoading(true);
      await declineDonation(db, listing.id, user.uid);
      setNotice(`Declined listing "${listing.title}". It remains available for other organizations.`);
      await fetchRecipientListings();
    } catch (err) {
      console.error('Decline error:', err);
      setErrorNotice('Failed to decline donation.');
    } finally {
      setActionLoading(false);
    }
  };

  // Delivery & Handover Handlers
  const handleOpenDeliveryModal = (listing) => {
    setDeliveryModal(listing);
    setDeliveryTotal('100');
    setDeliveryDonorShare('50');
    setDeliveryRecipientShare('50');
    setDeliveryNotes('');
    setDeliveryFormError('');
  };

  const handleCreateDeliveryRequest = async (e) => {
    e.preventDefault();
    if (!deliveryModal) return;

    const total = Number(deliveryTotal);
    const donor = Number(deliveryDonorShare);
    const recipient = Number(deliveryRecipientShare);

    const validation = validateCostAgreement(total, donor, recipient);
    if (!validation.isValid) {
      setDeliveryFormError(validation.error);
      return;
    }

    try {
      setActionLoading(true);
      setDeliveryFormError('');
      await createDeliveryRequest(db, deliveryModal, profileData, {
        totalAmount: total,
        donorContribution: donor,
        recipientContribution: recipient,
        handlingNotes: deliveryNotes,
        initiatorRole: 'recipient'
      });
      setNotice(`Delivery request created for "${deliveryModal.title}". Direct settlement between parties.`);
      setDeliveryModal(null);
      await fetchRecipientListings();
    } catch (err) {
      console.error('Error creating delivery request:', err);
      setDeliveryFormError(err.message || 'Failed to submit delivery request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAgreeDeliverySplit = async (deliveryId) => {
    try {
      setActionLoading(true);
      await confirmDeliveryAgreement(db, deliveryId, 'recipient');
      setNotice('Agreed to delivery split. The request is now open for couriers.');
      await fetchRecipientListings();
    } catch (err) {
      console.error('Error agreeing to delivery split:', err);
      setErrorNotice('Failed to confirm delivery agreement: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDirectHandover = async (listing) => {
    try {
      setActionLoading(true);
      const listingRef = doc(db, 'listings', listing.id);
      await updateDoc(listingRef, {
        status: 'completed',
        handoverConfirmedByRecipient: true,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // Evaluate reward tokens for eligible participants
      try {
        await processDonationCompletionRewards(db, { ...listing, status: 'completed' });
      } catch (rewErr) {
        console.warn('Notice processing handover rewards:', rewErr.message);
      }
      setNotice(`Direct pickup confirmed for "${listing.title}". Redistribution complete.`);
      await fetchRecipientListings();
    } catch (err) {
      console.error('Direct handover confirmation error:', err);
      setErrorNotice('Failed to confirm direct handover: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeliveryComplete = async (deliveryId) => {
    try {
      setActionLoading(true);
      await transitionDeliveryStatus(db, deliveryId, DELIVERY_STATUSES.COMPLETED, { uid: user.uid, role: 'recipient' });
      setNotice('Food receipt confirmed! Delivery and redistribution completed successfully.');
      await fetchRecipientListings();
    } catch (err) {
      console.error('Receipt confirmation error:', err);
      setErrorNotice('Failed to confirm receipt: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisputeDelivery = async (e) => {
    e.preventDefault();
    if (!disputeModal) return;
    try {
      setActionLoading(true);
      await transitionDeliveryStatus(
        db,
        disputeModal.id,
        DELIVERY_STATUSES.DISPUTED,
        { uid: user.uid, role: 'recipient' },
        { reason: disputeReason.trim() || 'Disputed by recipient' }
      );
      setNotice('Delivery marked as disputed. Platform administrators will review.');
      setDisputeModal(null);
      setDisputeReason('');
      await fetchRecipientListings();
    } catch (err) {
      console.error('Dispute submission error:', err);
      setErrorNotice('Failed to record dispute: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Update Capacity Control
  const handleSaveCapacity = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const recRef = doc(db, 'recipients', user.uid);
      await updateDoc(recRef, {
        availableAdditionalCapacity: Number(availCapacity),
        updatedAt: serverTimestamp()
      });
      await refreshUserProfile();
      setNotice('Available additional capacity updated successfully.');
    } catch (err) {
      setErrorNotice(err.message || 'Error updating capacity.');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Operational Status (Active vs Paused)
  const handleToggleStatus = async () => {
    const nextStatus = operationalStatus === 'active' ? 'paused' : 'active';
    try {
      setActionLoading(true);
      const recRef = doc(db, 'recipients', user.uid);
      await updateDoc(recRef, {
        operationalStatus: nextStatus,
        updatedAt: serverTimestamp()
      });
      setOperationalStatus(nextStatus);
      await refreshUserProfile();
      setNotice(`Organization status is now ${nextStatus.toUpperCase()}.`);
    } catch (err) {
      setErrorNotice('Failed to update status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Enable Browser Push Alerts
  const handleEnablePush = async () => {
    const res = await requestPushPermission();
    setPushStatus(res.status);
    if (res.granted) {
      setNotice('Browser notifications enabled. You will receive alerts when surplus food arrives in your radius.');
      showLocalNotification('FoodBridge Alerts Active', {
        body: 'You are now ready to receive surplus food matching notifications.'
      });
    } else {
      setErrorNotice('Push permission was not granted. In-app notifications will continue normally.');
    }
  };

  const isVerifiedOrg = profileData?.verificationStatus === 'verified';
  const myCapacity = profileData?.availableAdditionalCapacity || 0;
  const capacityUnit = profileData?.capacityUnit || 'meals';

  const activeAcceptedListings = acceptedListings.filter((l) =>
    ['accepted', 'delivery_coordination', 'awaiting_partner', 'partner_assigned', 'in_transit', 'picked_up', 'delivered_pending_confirmation'].includes(l.status)
  );

  const historyListings = acceptedListings.filter((l) =>
    ['completed', 'cancelled', 'expired'].includes(l.status)
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5 text-amber-700" />
              <span>{profileData?.category ? `${profileData.category.toUpperCase()} RECIPIENT` : 'RECIPIENT'}</span>
            </span>

            {isVerifiedOrg ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 text-xs font-semibold">
                <Clock className="w-3 h-3 text-yellow-600" />
                Pending Verification
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            {profileData?.organizationName || 'Recipient Dashboard'}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            {profileData?.district || 'Karnataka'} • Available Additional Intake: <strong>{myCapacity} {capacityUnit}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => fetchRecipientListings(true)} loading={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant={operationalStatus === 'active' ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleStatus}
            loading={actionLoading}
          >
            {operationalStatus === 'active' ? (
              <>
                <PauseCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                <span>Pause Intake</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                <span>Resume Intake</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-900 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-semibold text-green-950">Dismiss</button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice('')} className="font-semibold text-red-950">Dismiss</button>
        </div>
      )}

      {/* Verification Guard Alert */}
      {!isVerifiedOrg && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm leading-relaxed">
            <h4 className="font-bold text-stone-900">Verification Pending</h4>
            <p className="mt-0.5">
              Your organization credentials are currently under review by platform administrators. To protect food dignity, incoming donations cannot be claimed until verification is completed.
            </p>
          </div>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {availableListings.length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Available in Radius
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {activeAcceptedListings.length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Active / Handover
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {myCapacity}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Available Additional Capacity ({capacityUnit})
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {historyListings.length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Donation History
          </span>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        {[
          { id: 'available', label: 'Available Donations', count: availableListings.length },
          { id: 'accepted', label: 'Accepted / Handover', count: activeAcceptedListings.length },
          { id: 'capacity', label: 'Capacity & Alerts', count: null },
          { id: 'history', label: 'Donation History', count: historyListings.length }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-brand-800 text-brand-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-stone-500 text-sm">
            Evaluating incoming redistribution allocations...
          </div>
        ) : activeTab === 'available' ? (
          /* Available Donations Cards */
          availableListings.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No Available Donations in Current Radius"
              description="No surplus listings are currently active within your initial radius matching your category. As waiting periods elapse (2 hours default), matching expands automatically."
              action={
                <Button variant="outline" size="sm" onClick={() => fetchRecipientListings(true)} loading={refreshing}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Check for Updates
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableListings.map((listing) => {
                const hasSufficientCapacity = myCapacity >= Number(listing.quantity);
                return (
                  <Card key={listing.id} className="p-5 flex flex-col justify-between space-y-4 border-border">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-stone-900 text-base">
                              {listing.title}
                            </h3>
                            <Badge variant={profileData.category} size="sm">
                              {listing.quantity} {listing.unit}
                            </Badge>
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {listing.donorName || 'Surplus Donor'} • {listing.district}
                          </p>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                            <MapPin className="w-3 h-3" />
                            {listing.distanceKm} km away
                          </span>
                        </div>
                      </div>

                      {/* Fact Pills */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-surface-muted/70">
                          <span className="text-stone-500 block">Deadline</span>
                          <span className="font-mono text-stone-900 font-medium">
                            {listing.safeUseDeadline ? new Date(listing.safeUseDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </span>
                        </div>

                        <div className="p-2 rounded bg-surface-muted/70">
                          <span className="text-stone-500 block">Holding State</span>
                          <span className="capitalize font-medium text-stone-900">
                            {listing.storageCondition.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Capacity Comparison Alert */}
                      <div className="p-2.5 rounded-lg bg-surface-muted/40 border border-border/70 text-xs flex items-center justify-between">
                        <span className="text-stone-600">Your Available Capacity:</span>
                        <span className={`font-bold ${hasSufficientCapacity ? 'text-emerald-700' : 'text-red-600'}`}>
                          {myCapacity} {capacityUnit} {hasSufficientCapacity ? '(Sufficient)' : '(Insufficient)'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-border/70 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectModal(listing)}
                        className="text-xs text-stone-600 hover:text-brand-800 font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDeclineDonation(listing)}
                          disabled={actionLoading}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Decline
                        </Button>

                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleAcceptDonation(listing)}
                          disabled={!isVerifiedOrg || !hasSufficientCapacity || actionLoading}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Accept Food
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : activeTab === 'accepted' ? (
          /* Accepted Donations Area */
          activeAcceptedListings.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No accepted donations pending handover. Accept a listing from the available queue to coordinate pickup.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeAcceptedListings.map((listing) => (
                <Card key={listing.id} className="p-5 sm:p-6 space-y-4 border-emerald-200 bg-emerald-50/10">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-stone-900 text-lg">
                          {listing.title}
                        </h3>
                        <Badge variant="verified" size="sm">
                          {listing.deliveryMode === 'delivery_partner' ? 'COURIER' : 'CLAIMED'}
                        </Badge>
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5">
                        Donor: <strong>{listing.donorName}</strong> ({listing.contactPerson || 'Kitchen In-charge'})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setChatModalListing(listing)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1" />
                        <span>Chat</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMapModalListing(listing)}
                      >
                        <Navigation className="w-3.5 h-3.5 mr-1" />
                        <span>Open Map</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setInspectModal(listing)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        <span>Details</span>
                      </Button>

                      <span className="text-xl font-bold font-mono text-stone-900 ml-2">
                        {listing.quantity} {listing.unit}
                      </span>
                    </div>
                  </div>

                  {/* Operational Pickup Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white border border-border">
                      <span className="text-stone-500 block mb-0.5">Pickup Address</span>
                      <span className="font-semibold text-stone-900">{listing.address}</span>
                      {listing.pickupInstructions && (
                        <p className="text-[11px] text-stone-500 mt-1">{listing.pickupInstructions}</p>
                      )}
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-border">
                      <span className="text-stone-500 block mb-0.5">Donor Contact Phone</span>
                      <a href={`tel:${listing.contactPhone}`} className="font-semibold text-brand-800 hover:underline flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{listing.contactPhone}</span>
                      </a>
                    </div>
                  </div>

                  {/* Coordination & Delivery Management */}
                  <div className="pt-2 border-t border-emerald-100">
                    {!listing.deliveryId ? (
                      /* Direct Pickup Options */
                      <div className="p-3.5 rounded-xl bg-white border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-bold text-stone-900 block">Direct Pickup Arranged</span>
                          <span className="text-stone-500 text-[11px]">
                            Your organization will collect the food directly, or you can request a verified delivery partner.
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenDeliveryModal(listing)}
                            disabled={actionLoading}
                          >
                            <Truck className="w-3.5 h-3.5 mr-1" />
                            Request Delivery Partner
                          </Button>

                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleConfirmDirectHandover(listing)}
                            disabled={actionLoading}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Confirm Food Receipt
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Delivery Partner Active */
                      deliveriesMap[listing.deliveryId] && (() => {
                        const del = deliveriesMap[listing.deliveryId];
                        return (
                          <div className="p-4 rounded-xl bg-white border border-stone-200 text-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
                              <div className="flex items-center gap-2">
                                <Truck className="w-4 h-4 text-blue-700" />
                                <span className="font-bold text-stone-900">Delivery Partner Coordination</span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  del.status === DELIVERY_STATUSES.ASSIGNED || del.status === DELIVERY_STATUSES.PICKED_UP
                                    ? 'bg-blue-100 text-blue-800'
                                    : del.status === DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : del.status === DELIVERY_STATUSES.REQUESTED
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-stone-200 text-stone-700'
                                }`}>
                                  {del.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="text-stone-600 font-mono text-[11px]">
                                Total: ₹{del.totalAmount} (Your share: ₹{del.recipientContribution}, Donor share: ₹{del.donorContribution})
                              </div>
                            </div>

                            {/* Pending Split Agreement Notice */}
                            {del.status === DELIVERY_STATUSES.PENDING_AGREEMENT && !del.recipientAgreed && (
                              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-amber-900 text-[11px]">
                                  Please confirm your contribution of ₹{del.recipientContribution} (payable directly between parties).
                                </span>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleAgreeDeliverySplit(del.id)}
                                  disabled={actionLoading}
                                >
                                  Confirm Contribution (₹{del.recipientContribution})
                                </Button>
                              </div>
                            )}

                            {/* Status: Waiting for courier */}
                            {del.status === DELIVERY_STATUSES.REQUESTED && (
                              <p className="text-stone-500 text-[11px]">
                                Delivery request published. Waiting for a verified delivery courier to accept the assignment.
                              </p>
                            )}

                            {/* Assigned Courier Details */}
                            {del.assignedPartnerName && (
                              <div className="p-3 rounded-lg bg-surface-muted/60 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <span className="text-stone-500 block text-[10px]">Assigned Delivery Partner</span>
                                  <span className="font-semibold text-stone-900">{del.assignedPartnerName}</span>
                                  {del.assignedPartnerPhone && (
                                    <span className="text-stone-600 text-[11px] block">{del.assignedPartnerPhone}</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {del.status === DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION && (
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      onClick={() => handleConfirmDeliveryComplete(del.id)}
                                      disabled={actionLoading}
                                    >
                                      <PackageCheck className="w-3.5 h-3.5 mr-1" />
                                      Confirm Receipt of Food
                                    </Button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setDisputeModal(del)}
                                    className="text-[11px] text-red-600 hover:text-red-800 underline font-semibold"
                                  >
                                    Report Issue
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : activeTab === 'capacity' ? (
          /* Capacity and Alerts Setting Tab */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <Scale className="w-5 h-5 text-brand-700" />
                <h3 className="font-bold text-stone-900">Available Additional Capacity</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Update how much more food/material you can intake right now. When a listing is accepted, your capacity is automatically deducted; when handovers complete, you can adjust your intake.
              </p>
              <form onSubmit={handleSaveCapacity} className="space-y-4">
                <Input
                  id="dash-cap-input"
                  label={`Available Additional Capacity (${capacityUnit})`}
                  type="number"
                  min="0"
                  value={availCapacity}
                  onChange={(e) => setAvailCapacity(e.target.value)}
                />
                <Button type="submit" variant="primary" size="md" loading={actionLoading}>
                  Update Capacity
                </Button>
              </form>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <BellRing className="w-5 h-5 text-brand-700" />
                <h3 className="font-bold text-stone-900">Browser Push Notifications</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Receive instant browser alerts when surplus food matching your category is published within your radius. If disabled, alerts will remain available in your in-app inbox.
              </p>
              <div className="p-3 rounded-lg bg-surface-muted text-xs text-stone-700">
                Current status: <strong>{pushStatus.toUpperCase()}</strong>
              </div>
              {pushStatus !== 'granted' && (
                <Button variant="outline" size="md" onClick={handleEnablePush}>
                  <Bell className="w-4 h-4 mr-1.5" />
                  Enable Push Alerts
                </Button>
              )}
            </Card>
          </div>
        ) : (
          /* Donation History Tab */
          historyListings.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm bg-white rounded-xl border border-dashed border-stone-200">
              No completed donation records found. Completed food handovers and deliveries will be permanently archived here.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {historyListings.map((listing) => (
                <Card key={listing.id} className="p-5 sm:p-6 space-y-4 border-stone-200 bg-stone-50/40">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/70">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-stone-900 text-base sm:text-lg">
                          {listing.title}
                        </h3>
                        <Badge variant="success" size="sm">
                          {listing.status === 'completed' ? 'HANDOVER COMPLETED' : (listing.status || 'FINALIZED').toUpperCase()}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {listing.category || 'Surplus Food'}
                        </Badge>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">
                        Donor: <strong>{listing.donorName || 'Verified Donor'}</strong>
                        {listing.contactPerson && <span> ({listing.contactPerson})</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setChatModalListing(listing)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1" />
                        <span>Chat & History</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMapModalListing(listing)}
                      >
                        <Navigation className="w-3.5 h-3.5 mr-1" />
                        <span>Open Map</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setInspectModal(listing)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        <span>View Details</span>
                      </Button>

                      <span className="text-lg font-bold font-mono text-stone-800 ml-2">
                        {listing.quantity} {listing.unit}
                      </span>
                    </div>
                  </div>

                  {/* Summary details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-stone-600">
                    <div className="p-3 rounded-lg bg-white border border-border">
                      <span className="text-stone-400 block mb-0.5 font-medium">Pickup Origin</span>
                      <span className="font-medium text-stone-800">{listing.address || 'Address on record'}</span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-border">
                      <span className="text-stone-400 block mb-0.5 font-medium">Donor Contact Phone</span>
                      <a href={`tel:${listing.contactPhone}`} className="font-semibold text-brand-800 hover:underline flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{listing.contactPhone || 'Available in chat'}</span>
                      </a>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-border">
                      <span className="text-stone-400 block mb-0.5 font-medium">Handover Mode</span>
                      <span className="font-medium text-stone-800">
                        {listing.deliveryMode === 'delivery_partner' ? 'Verified Delivery Partner' : 'Direct Organization Pickup'}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Details & Safety Inspection Modal */}
      {inspectModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{inspectModal.title}</h3>
                <p className="text-xs text-stone-500">{inspectModal.quantity} {inspectModal.unit} • {inspectModal.distanceKm} km</p>
              </div>
              <button onClick={() => setInspectModal(null)} className="text-stone-400 hover:text-stone-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-surface-muted text-xs space-y-1">
              <div><strong>Description:</strong> {inspectModal.description || 'No extra notes provided.'}</div>
              <div><strong>Dietary:</strong> {inspectModal.isVegetarian ? 'Pure Vegetarian' : 'Non-Vegetarian'}</div>
              <div><strong>Allergens:</strong> {inspectModal.allergens?.join(', ') || 'None declared'}</div>
              <div><strong>Storage:</strong> {inspectModal.storageCondition?.replace('_', ' ')}</div>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-stone-800 block">Automated Safety Validation:</span>
              {inspectModal.safetyAuditTrail?.map((check, idx) => (
                <div key={idx} className="p-2 rounded bg-surface-muted/60 text-stone-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{check.message}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
              <strong>Safety Reminder:</strong> {inspectModal.inspectionNotice || 'Inspect food upon collection before distribution.'}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setInspectModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Delivery Partner Modal */}
      {deliveryModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Request Delivery Partner</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {deliveryModal.title} ({deliveryModal.quantity} {deliveryModal.unit})
                </p>
              </div>
              <button
                onClick={() => setDeliveryModal(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-surface-muted text-xs text-stone-600 leading-relaxed">
              Delivery costs are settled directly between donor and recipient via cash or UPI upon handover. FoodBridge records the agreed amounts; no wallet or payment gateway is used.
            </div>

            <form onSubmit={handleCreateDeliveryRequest} className="space-y-3.5">
              <Input
                id="req-total-amount"
                label="Total Delivery Amount (₹)"
                type="number"
                min="0"
                step="1"
                value={deliveryTotal}
                onChange={(e) => setDeliveryTotal(e.target.value)}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="req-donor-share"
                  label="Donor Share (₹)"
                  type="number"
                  min="0"
                  step="1"
                  value={deliveryDonorShare}
                  onChange={(e) => setDeliveryDonorShare(e.target.value)}
                  required
                />

                <Input
                  id="req-recipient-share"
                  label="Recipient Share (₹)"
                  type="number"
                  min="0"
                  step="1"
                  value={deliveryRecipientShare}
                  onChange={(e) => setDeliveryRecipientShare(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="req-delivery-notes" className="block text-xs font-semibold text-stone-700 mb-1">
                  Handling Instructions / Notes
                </label>
                <textarea
                  id="req-delivery-notes"
                  rows={2}
                  className="w-full text-xs rounded-lg border border-border px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  placeholder="e.g. Keep containers upright, handle insulated bags carefully..."
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                />
              </div>

              {deliveryFormError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {deliveryFormError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeliveryModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={actionLoading}
                >
                  Submit Delivery Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Report Delivery Issue</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Record reason for administrative review
                </p>
              </div>
              <button
                onClick={() => setDisputeModal(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDisputeDelivery} className="space-y-4">
              <div>
                <label htmlFor="dispute-reason-input" className="block text-xs font-semibold text-stone-700 mb-1">
                  Reason for Dispute / Issue
                </label>
                <textarea
                  id="dispute-reason-input"
                  rows={3}
                  className="w-full text-xs rounded-lg border border-border px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  placeholder="Describe the discrepancy, delay, damaged containers, or communication issue..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDisputeModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  loading={actionLoading}
                >
                  Submit Report
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-time In-App Donation & Delivery Chat */}
      {chatModalListing && (
        <DonationChatModal
          donation={chatModalListing}
          onClose={() => setChatModalListing(null)}
          onDeliveryUpdated={fetchRecipientListings}
        />
      )}

      {/* Interactive Delivery Route Map */}
      {mapModalListing && (
        <DeliveryRouteModal
          donation={mapModalListing}
          onClose={() => setMapModalListing(null)}
        />
      )}
    </div>
  );
}
