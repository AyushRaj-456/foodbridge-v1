import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  limit
} from '../../services/firebase';
import {
  DELIVERY_STATUSES,
  claimDeliveryAtomic,
  transitionDeliveryStatus,
  updateDeliveryPartnerLiveLocation
} from '../../services/deliveryService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { DonationChatModal } from '../../components/chat/DonationChatModal';
import { DeliveryRouteModal } from '../../components/map/DeliveryRouteModal';
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Navigation,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  PackageCheck,
  FileWarning,
  MessageSquare
} from 'lucide-react';

export function DeliveryDashboardPage() {
  const { t } = useLocale();
  const { user, profileData } = useAuth();

  const [activeTab, setActiveTab] = useState('active'); // 'available' | 'active' | 'history'
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [chatModalDelivery, setChatModalDelivery] = useState(null);
  const [mapModalDelivery, setMapModalDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Live GPS broadcast state
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef(null);

  // Broadcast live GPS position during active delivery when enabled
  useEffect(() => {
    if (gpsActive && activeDelivery && user && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            updateDeliveryPartnerLiveLocation(db, user.uid, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            }).catch(() => {});
          },
          (err) => console.warn('Live GPS watch notice:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
      } catch (e) {}
    } else {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [gpsActive, activeDelivery, user]);

  // Problem / Issue Modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [issueType, setIssueType] = useState('failed'); // 'failed' | 'disputed'

  const isVerifiedPartner = profileData?.verificationStatus === 'verified';

  const fetchDeliveries = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setErrorNotice('');

      // Concurrently fetch available requested deliveries and my assigned deliveries
      const reqQuery = query(collection(db, 'deliveries'), where('status', '==', DELIVERY_STATUSES.REQUESTED), limit(50));
      const myQuery = query(collection(db, 'deliveries'), where('assignedPartnerId', '==', user.uid), limit(50));

      const [reqSnap, mySnap] = await Promise.all([
        getDocs(reqQuery),
        getDocs(myQuery)
      ]);

      const availableItems = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAvailableDeliveries(availableItems);

      const myItems = mySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Find current active delivery (assigned, picked_up, or delivered_pending_confirmation)
      const currentActive = myItems.find((d) =>
        [DELIVERY_STATUSES.ASSIGNED, DELIVERY_STATUSES.PICKED_UP, DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION].includes(d.status)
      );
      setActiveDelivery(currentActive || null);

      // Past deliveries
      const historyItems = myItems.filter((d) =>
        [DELIVERY_STATUSES.COMPLETED, DELIVERY_STATUSES.FAILED, DELIVERY_STATUSES.CANCELLED, DELIVERY_STATUSES.DISPUTED].includes(d.status)
      );
      historyItems.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
      setDeliveryHistory(historyItems);

      // Default tab to active if there is an active job, else available
      if (currentActive) {
        setActiveTab('active');
      }
    } catch (err) {
      console.error('Error fetching deliveries:', err);
      setErrorNotice('Error loading delivery requests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [user]);

  // Handle Claim Delivery
  const handleClaim = async (delivery) => {
    if (!isVerifiedPartner) return;
    try {
      setActionLoading(true);
      setErrorNotice('');
      setNotice('');

      await claimDeliveryAtomic(db, delivery.id, user.uid, profileData);

      setNotice(`You have accepted delivery for "${delivery.listingTitle}". Pickup addresses are now revealed below.`);
      await fetchDeliveries();
      setActiveTab('active');
    } catch (err) {
      console.error('Claim error:', err);
      if (err.code === 'ALREADY_ASSIGNED') {
        setErrorNotice('This delivery was just claimed by another delivery partner.');
      } else {
        setErrorNotice(err.message || 'Failed to claim delivery.');
      }
      await fetchDeliveries();
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Step Transitions
  const handleTransition = async (targetStatus) => {
    if (!activeDelivery) return;
    try {
      setActionLoading(true);
      setErrorNotice('');
      setNotice('');

      await transitionDeliveryStatus(db, activeDelivery.id, targetStatus, { uid: user.uid, role: 'delivery' });

      if (targetStatus === DELIVERY_STATUSES.PICKED_UP) {
        setNotice('Food pickup confirmed. Please proceed to the recipient destination.');
      } else if (targetStatus === DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION) {
        setNotice('Arrival and delivery recorded. Waiting for recipient to confirm receipt.');
      }

      await fetchDeliveries();
    } catch (err) {
      console.error('Transition error:', err);
      setErrorNotice(err.message || 'Status transition failed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Report Issue / Failure
  const handleReportIssue = async () => {
    if (!activeDelivery || !issueReason.trim()) {
      alert('Please explain the issue or obstacle encountered.');
      return;
    }

    try {
      setActionLoading(true);
      await transitionDeliveryStatus(
        db,
        activeDelivery.id,
        issueType === 'failed' ? DELIVERY_STATUSES.FAILED : DELIVERY_STATUSES.DISPUTED,
        { uid: user.uid, role: 'delivery' },
        { reason: issueReason.trim() }
      );

      setNotice('Issue reported to community administrators. This delivery has been placed on hold.');
      setIssueModalOpen(false);
      setIssueReason('');
      await fetchDeliveries();
    } catch (err) {
      setErrorNotice('Error reporting issue: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-900 border border-sky-200 text-xs font-semibold">
              <Truck className="w-3.5 h-3.5 text-sky-700" />
              <span>DELIVERY PARTNER</span>
            </span>

            {isVerifiedPartner ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 text-xs font-semibold">
                <Clock className="w-3 h-3 text-yellow-600" />
                Verification Pending
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            {t('delivery.deliveryWorkspace', 'Delivery Coordination Workspace')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Transport Mode: <strong className="capitalize">{profileData?.transportMode?.replace('_', ' ') || 'Courier'}</strong> • Capacity: <strong>{profileData?.maxCapacityKg || 20} kg</strong>
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchDeliveries} loading={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          <span>{t('common.refresh', 'Refresh')}</span>
        </Button>
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
      {!isVerifiedPartner && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm leading-relaxed">
            <h4 className="font-bold text-stone-900">Partner Verification Required</h4>
            <p className="mt-0.5">
              Your profile is awaiting administrator approval. Delivery requests cannot be accepted until your driver/identity credentials are authenticated.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('delivery.myActiveDelivery', 'My Active Delivery')}</span>
          {activeDelivery && (
            <span className="ml-2 w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'available'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('delivery.availableDeliveries', 'Available Deliveries')}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {availableDeliveries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('delivery.deliveryHistory', 'Delivery History')}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {deliveryHistory.length}
          </span>
        </button>
      </div>

      {/* CONTENT AREA */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-stone-500 text-sm">
            Loading transport requests...
          </div>
        ) : activeTab === 'active' ? (
          /* 1. MY ACTIVE DELIVERY VIEW */
          !activeDelivery ? (
            <EmptyState
              icon={Truck}
              title="No Active Delivery Assigned"
              description="You do not currently have an active transport assignment. Check available requests to accept a nearby delivery."
              action={
                <Button variant="outline" size="sm" onClick={() => setActiveTab('available')}>
                  View Available Deliveries
                </Button>
              }
            />
          ) : (
            <Card className="p-6 sm:p-8 space-y-6 border-brand-700/80 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-stone-900">
                      {activeDelivery.listingTitle}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold uppercase">
                      {activeDelivery.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Quantity: <strong>{activeDelivery.quantity} {activeDelivery.unit}</strong> • Estimated Distance: <strong>{activeDelivery.approxDistanceKm} km</strong>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-stone-500 block">Agreed Direct Compensation</span>
                  <span className="text-lg font-bold font-mono text-emerald-800">
                    ₹{activeDelivery.totalAmount || 0}
                  </span>
                  <span className="text-[10px] text-stone-400 block">Settled directly between parties</span>
                </div>
              </div>

              {/* Exact Private Addresses (Revealed ONLY to Assigned Partner) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Step 1: Donor Pickup */}
                <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                    <MapPin className="w-4 h-4 text-emerald-700" />
                    <span>1. Pickup from Donor</span>
                  </div>
                  <p className="text-xs font-semibold text-stone-900">
                    {activeDelivery.donorName}
                  </p>
                  <p className="text-xs text-stone-700 leading-snug">
                    {activeDelivery.pickupAddress}
                  </p>
                  {activeDelivery.pickupInstructions && (
                    <p className="text-[11px] text-stone-500 italic">
                      Note: {activeDelivery.pickupInstructions}
                    </p>
                  )}
                  <a
                    href={`tel:${activeDelivery.donorPhone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-800 font-semibold hover:underline pt-1"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Donor: {activeDelivery.donorPhone}</span>
                  </a>
                </div>

                {/* Step 2: Recipient Destination */}
                <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-2">
                  <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                    <Navigation className="w-4 h-4 text-sky-700" />
                    <span>2. Deliver to Recipient</span>
                  </div>
                  <p className="text-xs font-semibold text-stone-900">
                    {activeDelivery.recipientName}
                  </p>
                  <p className="text-xs text-stone-700 leading-snug">
                    {activeDelivery.dropoffAddress}
                  </p>
                  <a
                    href={`tel:${activeDelivery.recipientPhone}`}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-800 font-semibold hover:underline pt-1"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Recipient: {activeDelivery.recipientPhone}</span>
                  </a>
                </div>
              </div>

              {/* Handling Notes & Directions */}
              <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-700 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Handling Condition:</strong> {activeDelivery.storageCondition?.replace('_', ' ')} • Deadline: {activeDelivery.safeUseDeadline ? new Date(activeDelivery.safeUseDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}. Please keep food secure and protected during transit.
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-border gap-3">
                <button
                  type="button"
                  onClick={() => setIssueModalOpen(true)}
                  className="text-xs font-semibold text-red-700 hover:text-red-900 inline-flex items-center gap-1"
                >
                  <FileWarning className="w-3.5 h-3.5" />
                  <span>Report Problem / Unable to Deliver</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={gpsActive ? "primary" : "outline"}
                    size="md"
                    onClick={() => setGpsActive(!gpsActive)}
                    className={gpsActive ? "bg-emerald-800 hover:bg-emerald-900 text-white" : "border-emerald-600 text-emerald-900"}
                    title="Broadcast your device GPS position to the route map"
                  >
                    <span className={`w-2 h-2 rounded-full mr-1.5 ${gpsActive ? 'bg-emerald-300 animate-pulse' : 'bg-stone-400'}`} />
                    <span>{gpsActive ? 'Broadcasting GPS' : 'Share Live GPS'}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setMapModalDelivery({
                      id: activeDelivery.listingId,
                      listingId: activeDelivery.listingId,
                      title: activeDelivery.listingTitle,
                      donorName: activeDelivery.donorName,
                      acceptedRecipientName: activeDelivery.recipientName,
                      latitude: activeDelivery.pickupLatitude,
                      longitude: activeDelivery.pickupLongitude,
                      dropoffLatitude: activeDelivery.dropoffLatitude,
                      dropoffLongitude: activeDelivery.dropoffLongitude,
                      pickupLatitude: activeDelivery.pickupLatitude,
                      pickupLongitude: activeDelivery.pickupLongitude,
                      address: activeDelivery.pickupAddress,
                      pickupAddress: activeDelivery.pickupAddress,
                      dropoffAddress: activeDelivery.dropoffAddress,
                      deliveryPartnerId: user?.uid,
                      deliveryPartnerName: profileData?.fullName,
                      status: activeDelivery.status,
                      ...activeDelivery
                    })}
                  >
                    <Navigation className="w-4 h-4 mr-1.5" />
                    <span>Open Route Map</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setChatModalDelivery({
                      id: activeDelivery.listingId,
                      listingId: activeDelivery.listingId,
                      title: activeDelivery.listingTitle,
                      donorName: activeDelivery.donorName,
                      acceptedRecipientName: activeDelivery.recipientName,
                      deliveryId: activeDelivery.id,
                      deliveryStatus: activeDelivery.status,
                      ...activeDelivery
                    })}
                  >
                    <MessageSquare className="w-4 h-4 mr-1.5" />
                    <span>3-Party Chat</span>
                  </Button>

                  {activeDelivery.status === DELIVERY_STATUSES.ASSIGNED && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => handleTransition(DELIVERY_STATUSES.PICKED_UP)}
                      loading={actionLoading}
                    >
                      <PackageCheck className="w-4 h-4 mr-1.5" />
                      <span>Confirm Food Pickup at Donor</span>
                    </Button>
                  )}

                  {activeDelivery.status === DELIVERY_STATUSES.PICKED_UP && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => handleTransition(DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION)}
                      loading={actionLoading}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      <span>Confirm Arrival & Delivery</span>
                    </Button>
                  )}

                  {activeDelivery.status === DELIVERY_STATUSES.DELIVERED_PENDING_CONFIRMATION && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-muted text-xs font-semibold text-stone-700 border border-border">
                      <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                      <span>Waiting for Recipient Receipt Confirmation</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        ) : activeTab === 'available' ? (
          /* 2. AVAILABLE DELIVERIES LIST */
          availableDeliveries.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No Available Delivery Requests"
              description="All surplus listings are currently claimed or using direct pickup. New requests will appear here as recipients and donors agree on delivery coordination."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableDeliveries.map((delivery) => (
                <Card key={delivery.id} className="p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-stone-900 text-base">
                          {delivery.listingTitle}
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Corridor: <strong>{delivery.pickupDistrict}</strong> <ArrowRight className="inline w-3 h-3 mx-1" /> <strong>{delivery.dropoffDistrict}</strong>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-bold font-mono text-emerald-800 block">
                          ₹{delivery.totalAmount || 0}
                        </span>
                        <span className="text-[10px] text-stone-400">Direct payout</span>
                      </div>
                    </div>

                    {/* Facts */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">Quantity</span>
                        <span className="font-semibold text-stone-900">{delivery.quantity} {delivery.unit}</span>
                      </div>
                      <div className="p-2 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">Estimated Distance</span>
                        <span className="font-semibold text-stone-900">{delivery.approxDistanceKm} km</span>
                      </div>
                    </div>

                    <p className="text-xs text-stone-600 bg-surface-muted/40 p-2.5 rounded-lg border border-border/60">
                      <strong>Handling:</strong> {delivery.storageCondition?.replace('_', ' ')} • {delivery.handlingNotes || 'Standard safe transport'}
                    </p>

                    <p className="text-[11px] text-stone-400 italic">
                      Exact street addresses are kept private and revealed upon acceptance.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-end">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleClaim(delivery)}
                      disabled={!isVerifiedPartner || actionLoading}
                    >
                      <Truck className="w-3.5 h-3.5 mr-1.5" />
                      Accept Delivery
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* 3. DELIVERY HISTORY TAB */
          deliveryHistory.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No completed delivery history logged yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {deliveryHistory.map((d) => (
                <Card key={d.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-sm">{d.listingTitle}</h4>
                      <Badge variant={d.status === 'completed' ? 'verified' : 'neutral'} size="sm">
                        {d.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-stone-500 mt-0.5">
                      {d.quantity} {d.unit} • Compensation: ₹{d.totalAmount || 0}
                      {d.failureReason && ` • Note: ${d.failureReason}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMapModalDelivery({
                        id: d.listingId,
                        listingId: d.listingId,
                        title: d.listingTitle,
                        donorName: d.donorName,
                        acceptedRecipientName: d.recipientName,
                        latitude: d.pickupLatitude,
                        longitude: d.pickupLongitude,
                        dropoffLatitude: d.dropoffLatitude,
                        dropoffLongitude: d.dropoffLongitude,
                        address: d.pickupAddress,
                        pickupAddress: d.pickupAddress,
                        dropoffAddress: d.dropoffAddress,
                        ...d
                      })}
                    >
                      <Navigation className="w-3.5 h-3.5 mr-1" />
                      Route Map
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setChatModalDelivery({
                        id: d.listingId,
                        listingId: d.listingId,
                        title: d.listingTitle,
                        donorName: d.donorName,
                        acceptedRecipientName: d.recipientName,
                        deliveryId: d.id,
                        deliveryStatus: d.status,
                        ...d
                      })}
                    >
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      Chat & Log
                    </Button>
                    <div className="text-right text-stone-400 font-mono text-[11px]">
                      {d.completedAt?.toDate ? d.completedAt.toDate().toLocaleDateString() : 'Archived'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Problem / Dispute Reporting Modal */}
      {issueModalOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">Report Transport Problem</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              If an obstacle prevents handover (such as vehicle breakdown, food container damage, or non-responsive party), report it here. Administrators will be alerted.
            </p>

            <Input
              id="issue-type"
              label="Issue Classification"
              as="select"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              <option value="failed">Failed Delivery (Breakdown / Cancelled)</option>
              <option value="disputed">Dispute (Non-responsive party / Disagreement)</option>
            </Input>

            <Input
              id="issue-reason"
              label="Details & Reason (Required)"
              as="textarea"
              rows={3}
              required
              placeholder="Describe what occurred..."
              value={issueReason}
              onChange={(e) => setIssueReason(e.target.value)}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIssueModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleReportIssue} loading={actionLoading}>
                Submit Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time In-App 3-Party Donation & Delivery Chat */}
      {chatModalDelivery && (
        <DonationChatModal
          donation={chatModalDelivery}
          onClose={() => setChatModalDelivery(null)}
          onDeliveryUpdated={fetchDeliveries}
        />
      )}

      {/* Interactive Delivery Route Map */}
      {mapModalDelivery && (
        <DeliveryRouteModal
          donation={mapModalDelivery}
          onClose={() => setMapModalDelivery(null)}
        />
      )}
    </div>
  );
}
