import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocale } from '../../context/LocaleContext';
import { calculateRouteAndFare, getPointAlongPolyline } from '../../services/routingService';
import { db, doc, getDoc, onSnapshot } from '../../services/firebase';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  XCircle,
  MapPin,
  Navigation,
  Clock,
  Truck,
  Building2,
  Utensils,
  ExternalLink,
  ShieldCheck,
  Bike
} from 'lucide-react';

export function DeliveryRouteModal({
  donation,
  onClose
}) {
  const { t } = useLocale();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const courierMarkerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [routeData, setRouteData] = useState(null);
  const [error, setError] = useState('');
  const [liveCourierPos, setLiveCourierPos] = useState(null);
  const [hasLiveGps, setHasLiveGps] = useState(false);

  // Resolved Coordinates
  const [resolvedCoords, setResolvedCoords] = useState(() => {
    const pLat = Number(donation?.location?.latitude ?? donation?.pickupLatitude ?? donation?.latitude);
    const pLon = Number(donation?.location?.longitude ?? donation?.pickupLongitude ?? donation?.longitude);
    const dLat = Number(donation?.acceptedRecipientLocation?.latitude ?? donation?.dropoffLatitude ?? donation?.acceptedRecipientLatitude);
    const dLon = Number(donation?.acceptedRecipientLocation?.longitude ?? donation?.dropoffLongitude ?? donation?.acceptedRecipientLongitude);

    return {
      pLat: !isNaN(pLat) && pLat !== 0 ? pLat : 12.9716,
      pLon: !isNaN(pLon) && pLon !== 0 ? pLon : 77.5946,
      dLat: !isNaN(dLat) && dLat !== 0 ? dLat : 12.9740,
      dLon: !isNaN(dLon) && dLon !== 0 ? dLon : 77.5990
    };
  });

  const pickupAddress = donation?.location?.address || donation?.pickupAddress || donation?.address || 'Pickup Location';
  const dropAddress = donation?.acceptedRecipientLocation?.address || donation?.acceptedRecipientAddress || donation?.dropoffAddress || 'Recipient Organization Facility';
  const courierName = donation?.deliveryPartnerName || donation?.courierName || donation?.assignedPartnerName || 'Assigned Courier';
  const deliveryStatus = donation?.status || 'in_transit';

  // 1. Resolve exact coordinates from Firestore documents if not already in donation object
  useEffect(() => {
    let isMounted = true;

    async function ensureExactCoordinates() {
      let currentPLat = Number(donation?.location?.latitude ?? donation?.pickupLatitude ?? donation?.latitude);
      let currentPLon = Number(donation?.location?.longitude ?? donation?.pickupLongitude ?? donation?.longitude);
      let currentDLat = Number(donation?.acceptedRecipientLocation?.latitude ?? donation?.dropoffLatitude ?? donation?.acceptedRecipientLatitude);
      let currentDLon = Number(donation?.acceptedRecipientLocation?.longitude ?? donation?.dropoffLongitude ?? donation?.acceptedRecipientLongitude);

      // Fetch donor permanent profile if coords are missing or zero
      if ((isNaN(currentPLat) || isNaN(currentPLon) || currentPLat === 0 || currentPLon === 0) && donation?.donorId) {
        try {
          const donorSnap = await getDoc(doc(db, 'donors', donation.donorId));
          if (donorSnap.exists() && isMounted) {
            const dData = donorSnap.data();
            currentPLat = Number(dData.location?.latitude ?? dData.latitude);
            currentPLon = Number(dData.location?.longitude ?? dData.longitude);
          }
        } catch (e) {}
      }

      // Fetch recipient permanent profile if coords are missing or zero
      const recId = donation?.acceptedRecipientId || donation?.recipientId;
      if ((isNaN(currentDLat) || isNaN(currentDLon) || currentDLat === 0 || currentDLon === 0) && recId) {
        try {
          const recSnap = await getDoc(doc(db, 'recipients', recId));
          if (recSnap.exists() && isMounted) {
            const rData = recSnap.data();
            currentDLat = Number(rData.location?.latitude ?? rData.latitude);
            currentDLon = Number(rData.location?.longitude ?? rData.longitude);
          }
        } catch (e) {}
      }

      if (isMounted) {
        setResolvedCoords({
          pLat: !isNaN(currentPLat) && currentPLat !== 0 ? currentPLat : 12.9716,
          pLon: !isNaN(currentPLon) && currentPLon !== 0 ? currentPLon : 77.5946,
          dLat: !isNaN(currentDLat) && currentDLat !== 0 ? currentDLat : 12.9740,
          dLon: !isNaN(currentDLon) && currentDLon !== 0 ? currentDLon : 77.5990
        });
      }
    }

    ensureExactCoordinates();

    return () => {
      isMounted = false;
    };
  }, [donation]);

  // 2. Calculate shortest road route via OSRM with alternative distance minimization
  useEffect(() => {
    let isMounted = true;

    async function loadRoute() {
      try {
        setLoading(true);
        setError('');
        const data = await calculateRouteAndFare(
          resolvedCoords.pLat,
          resolvedCoords.pLon,
          resolvedCoords.dLat,
          resolvedCoords.dLon,
          donation?.id || ''
        );
        if (isMounted) {
          setRouteData(data);
        }
      } catch (err) {
        if (isMounted) setError('Unable to compute road route. Using baseline distance.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRoute();

    return () => {
      isMounted = false;
    };
  }, [resolvedCoords, donation?.id]);

  // 3. Listen for live delivery partner GPS position if assigned
  useEffect(() => {
    const partnerId = donation?.deliveryPartnerId || donation?.assignedPartnerId;
    if (!partnerId) return;

    try {
      const unsub = onSnapshot(doc(db, 'deliveryPartners', partnerId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const currLoc = data.currentLocation;
          if (currLoc && !isNaN(Number(currLoc.latitude)) && !isNaN(Number(currLoc.longitude))) {
            setLiveCourierPos([Number(currLoc.latitude), Number(currLoc.longitude)]);
            setHasLiveGps(true);
            // Smoothly update marker position if map already rendered
            if (courierMarkerRef.current) {
              courierMarkerRef.current.setLatLng([Number(currLoc.latitude), Number(currLoc.longitude)]);
            }
          }
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn('Courier live tracking listener notice:', e);
    }
  }, [donation?.deliveryPartnerId, donation?.assignedPartnerId]);

  // 4. Initialize or update Leaflet map once routeData is loaded
  useEffect(() => {
    if (!mapContainerRef.current || !routeData) return;

    // Clean up previous map instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      });
      mapInstanceRef.current = map;

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      // Marker 1: Pickup Icon (Donor)
      const pickupIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: #1b4332; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2.5px solid #ffffff;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      // Marker 2: Dropoff Icon (Recipient)
      const dropIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: #0284c7; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2.5px solid #ffffff;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      // Marker 3: Realistic Delivery Partner / Motorcycle Marker
      const motorcycleIcon = L.divIcon({
        className: 'custom-motorcycle-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(27, 67, 50, 0.2); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="background-color: #1b4332; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2.5px solid #ffffff; z-index: 10;">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="5.5" cy="17.5" r="3.5"/>
                <circle cx="18.5" cy="17.5" r="3.5"/>
                <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 5h3.5l1.5-4h2"/>
                <path d="M9 17.5l2-7.5 4 4.5"/>
                <path d="M5.5 17.5L9 10"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
      });

      // Add Donor Marker
      const pMarker = L.marker([resolvedCoords.pLat, resolvedCoords.pLon], { icon: pickupIcon }).addTo(map);
      pMarker.bindPopup(`<strong>Donor Pickup:</strong><br>${pickupAddress}`);

      // Add Recipient Marker
      const dMarker = L.marker([resolvedCoords.dLat, resolvedCoords.dLon], { icon: dropIcon }).addTo(map);
      dMarker.bindPopup(`<strong>Recipient Dropoff:</strong><br>${dropAddress}`);

      // Draw highlighted route polyline in brand dark green
      const polyline = L.polyline(routeData.coordinates, {
        color: '#1b4332',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);

      // Determine rider position:
      // If live GPS tracking is available, place at live coords.
      // Otherwise, position along the calculated road polyline based on transit status.
      let riderPos;
      if (liveCourierPos) {
        riderPos = liveCourierPos;
      } else {
        const ratio =
          deliveryStatus === 'assigned' ? 0.15 :
          deliveryStatus === 'picked_up' || deliveryStatus === 'in_transit' ? 0.50 :
          deliveryStatus === 'delivered_pending_confirmation' || deliveryStatus === 'delivered' || deliveryStatus === 'completed' ? 0.92 : 0.35;
        riderPos = getPointAlongPolyline(routeData.coordinates, ratio);
      }

      // Add Motorcycle / Courier Marker
      const cMarker = L.marker(riderPos, { icon: motorcycleIcon, zIndexOffset: 1000 }).addTo(map);
      courierMarkerRef.current = cMarker;

      cMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #1b4332; display: flex; align-items: center; gap: 4px;">
            🏍️ ${courierName}
          </strong>
          <span style="font-size: 10px; color: ${hasLiveGps ? '#059669' : '#047857'}; font-weight: 600; display: block; margin-top: 2px;">
            ${hasLiveGps ? '● Live GPS Tracking' : '● Delivery Partner En Route (Road Path)'}
          </span>
          <span style="font-size: 11px; color: #555; display: block; margin-top: 2px;">
            Status: ${deliveryStatus.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
      `);

      // Fit map bounds to encompass pickup, dropoff, motorcycle marker, and complete road polyline
      let bounds = null;
      if (polyline && typeof polyline.getBounds === 'function') {
        bounds = polyline.getBounds();
      }
      if (!bounds && typeof L.latLngBounds === 'function') {
        bounds = L.latLngBounds([
          [resolvedCoords.pLat, resolvedCoords.pLon],
          [resolvedCoords.dLat, resolvedCoords.dLon],
          riderPos
        ]);
      }
      if (bounds && typeof bounds.extend === 'function') {
        try {
          bounds.extend([resolvedCoords.pLat, resolvedCoords.pLon]);
          bounds.extend([resolvedCoords.dLat, resolvedCoords.dLon]);
          bounds.extend(riderPos);
        } catch (e) {}
      }
      if (bounds && typeof map.fitBounds === 'function') {
        map.fitBounds(bounds, {
          padding: [45, 45],
          maxZoom: 16
        });
      }
    } catch (mapErr) {
      console.warn('Leaflet initialization notice:', mapErr);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [routeData, resolvedCoords, pickupAddress, dropAddress, courierName, deliveryStatus, liveCourierPos, hasLiveGps]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border bg-surface-muted/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Navigation className="w-5 h-5 text-brand-100" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 text-sm sm:text-base truncate">
                  {donation?.title || donation?.listingTitle || 'Delivery Route Map'}
                </h3>
                {routeData?.isFallback ? (
                  <Badge variant="pending" size="sm">
                    ESTIMATED ROUTE (OFFLINE FALLBACK)
                  </Badge>
                ) : (
                  <Badge variant="verified" size="sm">
                    SHORTEST ROAD ROUTE
                  </Badge>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-0.5 truncate">
                {donation?.district || 'Karnataka, India'} • Verified Pickup to Recipient Dropoff
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg transition-colors"
            aria-label="Close Map"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Pill Bar */}
        <div className="p-3 bg-brand-50/50 border-b border-brand-100 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-lg bg-white border border-brand-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-stone-500 block">
              {t('map.distance', 'Road Distance')}
            </span>
            <span className="font-extrabold text-brand-900 text-sm sm:text-base font-mono">
              {routeData?.distanceKm || '--'} km
            </span>
          </div>

          <div className="p-2 rounded-lg bg-white border border-brand-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-stone-500 block">
              {t('map.eta', 'Est. Travel Time')}
            </span>
            <span className="font-extrabold text-stone-900 text-sm sm:text-base font-mono">
              ~{routeData?.durationMin || '--'} mins
            </span>
          </div>

          <div className="p-2 rounded-lg bg-white border border-brand-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-stone-500 block">Delivery Fee (50/50)</span>
            <span className="font-extrabold text-emerald-800 text-sm sm:text-base font-mono">
              ₹{routeData?.fare?.totalFare || '--'}
            </span>
            <span className="block text-[9px] text-stone-500">
              ₹{routeData?.fare?.donorShare || '--'} each
            </span>
          </div>
        </div>

        {/* Map Container with Visual Elements Legend */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[390px] bg-stone-100">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stone-50/80 backdrop-blur-xs text-xs text-stone-600 gap-2">
              <div className="w-6 h-6 border-2 border-brand-800 border-t-transparent rounded-full animate-spin" />
              <span>Calculating shortest road route via OpenStreetMap...</span>
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-full min-h-[320px] sm:min-h-[390px]" />

          {/* Visual Map Legend Overlay */}
          <div className="absolute top-2 left-2 z-[400] bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-sm border border-stone-200 text-[10px] sm:text-[11px] font-semibold text-stone-700 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1b4332] inline-block" />
              Pickup (Donor)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-1 bg-[#1b4332] rounded inline-block" />
              Shortest Route
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1b4332] border border-white inline-block" />
              Motorcycle
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] inline-block" />
              Dropoff (NGO)
            </span>
          </div>
        </div>

        {/* Origin & Destination Address Drawer */}
        <div className="p-4 bg-white border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-surface-muted border border-border">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-1">
              <Utensils className="w-3.5 h-3.5 text-emerald-700" />
              <span>{t('map.pickup', 'Donor Pickup')}</span>
            </div>
            <p className="text-stone-700 font-medium line-clamp-2">{pickupAddress}</p>
            {donation?.donorName && (
              <span className="block text-[11px] text-stone-500 mt-0.5">Donor: {donation.donorName}</span>
            )}
          </div>

          <div className="p-3 rounded-xl bg-surface-muted border border-border">
            <div className="flex items-center gap-1.5 font-bold text-sky-900 mb-1">
              <Building2 className="w-3.5 h-3.5 text-sky-700" />
              <span>{t('map.dropoff', 'Recipient Dropoff')}</span>
            </div>
            <p className="text-stone-700 font-medium line-clamp-2">{dropAddress}</p>
            {donation?.acceptedRecipientName && (
              <span className="block text-[11px] text-stone-500 mt-0.5">NGO: {donation.acceptedRecipientName}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
