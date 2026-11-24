import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocale } from '../../context/LocaleContext';
import { calculateRouteAndFare } from '../../services/routingService';
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
  ShieldCheck
} from 'lucide-react';

export function DeliveryRouteModal({
  donation,
  onClose
}) {
  const { t } = useLocale();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [routeData, setRouteData] = useState(null);
  const [error, setError] = useState('');

  const pickupLat = Number(donation?.latitude) || 12.9716;
  const pickupLon = Number(donation?.longitude) || 77.5946;
  const dropLat = Number(donation?.acceptedRecipientLatitude || donation?.dropoffLatitude) || 12.9740;
  const dropLon = Number(donation?.acceptedRecipientLongitude || donation?.dropoffLongitude) || 77.5990;

  const pickupAddress = donation?.address || donation?.pickupAddress || 'Pickup Location';
  const dropAddress = donation?.acceptedRecipientAddress || donation?.dropoffAddress || 'Recipient Organization Facility';

  useEffect(() => {
    let isMounted = true;

    async function loadRoute() {
      try {
        setLoading(true);
        setError('');
        const data = await calculateRouteAndFare(pickupLat, pickupLon, dropLat, dropLon, donation?.id || '');
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
  }, [pickupLat, pickupLon, dropLat, dropLon, donation?.id]);

  // Initialize or update Leaflet map once routeData is loaded
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

      // Create custom SVG markers matching app theme
      const pickupIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: #1b4332; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid #ffffff;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const dropIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: #0284c7; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid #ffffff;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      // Add markers
      const pMarker = L.marker([pickupLat, pickupLon], { icon: pickupIcon }).addTo(map);
      pMarker.bindPopup(`<strong>Pickup:</strong><br>${pickupAddress}`);

      const dMarker = L.marker([dropLat, dropLon], { icon: dropIcon }).addTo(map);
      dMarker.bindPopup(`<strong>Dropoff:</strong><br>${dropAddress}`);

      // Draw highlighted route polyline in dark primary green
      const polyline = L.polyline(routeData.coordinates, {
        color: '#1b4332',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round'
      }).addTo(map);

      // Fit map view to encompass entire route with padding
      map.fitBounds(polyline.getBounds(), {
        padding: [35, 35]
      });
    } catch (mapErr) {
      console.warn('Leaflet initialization notice:', mapErr);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [routeData, pickupLat, pickupLon, dropLat, dropLon, pickupAddress, dropAddress]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
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
                <Badge variant="verified" size="sm">
                  SHORTEST ROUTE
                </Badge>
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
            <span className="text-[10px] uppercase font-bold text-stone-500 block">{t('map.distance', 'Driving Distance')}</span>
            <span className="font-extrabold text-brand-900 text-sm sm:text-base font-mono">
              {routeData?.distanceKm || '--'} km
            </span>
          </div>

          <div className="p-2 rounded-lg bg-white border border-brand-200/60 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-stone-500 block">{t('map.eta', 'Est. Travel Time')}</span>
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

        {/* Map Container */}
        <div className="relative flex-1 min-h-[320px] sm:min-h-[380px] bg-stone-100">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stone-50/80 backdrop-blur-xs text-xs text-stone-600 gap-2">
              <div className="w-6 h-6 border-2 border-brand-800 border-t-transparent rounded-full animate-spin" />
              <span>Calculating shortest road route via OpenStreetMap...</span>
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-full min-h-[320px] sm:min-h-[380px]" />
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
