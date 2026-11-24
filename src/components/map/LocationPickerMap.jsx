import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocale } from '../../context/LocaleContext';
import { Search, MapPin, Crosshair, Navigation, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';

// Karnataka City Hub presets for quick jumping
const KARNATAKA_PRESETS = [
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Tumakuru', lat: 13.3409, lon: 77.1010 },
  { name: 'Mysuru', lat: 12.2958, lon: 76.6394 },
  { name: 'Hubballi', lat: 15.3647, lon: 75.1240 },
  { name: 'Mangaluru', lat: 12.9141, lon: 74.8560 },
  { name: 'Belagavi', lat: 15.8497, lon: 74.4977 }
];

/**
 * Interactive Leaflet location picker component for permanent location selection.
 * Supports:
 * 1. Searching address / locality via OpenStreetMap Nominatim
 * 2. Clicking on map to place or move marker
 * 3. Dragging marker for fine adjustment
 * 4. Browser GPS geolocation
 * 5. Reverse geocoding to auto-fill address text with manual editing capability
 *
 * @param {Object} props
 * @param {number} [props.initialLat=12.9716]
 * @param {number} [props.initialLon=77.5946]
 * @param {string} [props.initialAddress='']
 * @param {string} [props.label='']
 * @param {string} [props.helperText='']
 * @param {boolean} [props.required=true]
 * @param {Function} props.onLocationSelect Callback({ latitude, longitude, address, district })
 */
export function LocationPickerMap({
  initialLat = 12.9716,
  initialLon = 77.5946,
  initialAddress = '',
  label = 'Select Permanent Location',
  helperText = 'Search your address or click/drag the pin on the map to set your exact location.',
  required = true,
  onLocationSelect
}) {
  const { t } = useLocale();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const [position, setPosition] = useState({
    lat: Number(initialLat) || 12.9716,
    lon: Number(initialLon) || 77.5946
  });

  const [addressText, setAddressText] = useState(initialAddress || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [userHasSelected, setUserHasSelected] = useState(Boolean(initialAddress));

  // Sync initial address if passed later
  useEffect(() => {
    if (initialAddress && !addressText) {
      setAddressText(initialAddress);
      setUserHasSelected(true);
    }
  }, [initialAddress, addressText]);

  // Reverse geocode to retrieve readable street address when pin moves
  const reverseGeocode = async (lat, lon) => {
    try {
      setIsGeocoding(true);
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const displayAddr = data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        const addrDetails = data.address || {};
        const district = addrDetails.state_district || addrDetails.county || addrDetails.city || 'Karnataka';

        setAddressText(displayAddr);
        setUserHasSelected(true);

        if (onLocationSelect) {
          onLocationSelect({
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lon.toFixed(6)),
            address: displayAddr,
            district
          });
        }
      }
    } catch (e) {
      // Non-blocking fallback
      const fallbackAddr = addressText || `Location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      if (onLocationSelect) {
        onLocationSelect({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lon.toFixed(6)),
          address: fallbackAddr,
          district: 'Karnataka'
        });
      }
    } finally {
      setIsGeocoding(false);
    }
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([position.lat, position.lon], 14);

      mapInstanceRef.current = map;

      // OpenStreetMap Tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      // Custom Pin Marker Icon
      const pinIcon = L.divIcon({
        className: 'location-picker-pin',
        html: `
          <div style="background-color: #1b4332; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.35); border: 2.5px solid #ffffff; cursor: grab;">
            <div style="transform: rotate(45deg); width: 12px; height: 12px; border-radius: 50%; background: #ffffff;"></div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });

      // Draggable marker
      const marker = L.marker([position.lat, position.lon], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(map);

      markerRef.current = marker;

      // Drag end event
      marker.on('dragend', () => {
        const newLatLng = marker.getLatLng();
        setPosition({ lat: newLatLng.lat, lon: newLatLng.lng });
        reverseGeocode(newLatLng.lat, newLatLng.lng);
      });

      // Click on map to reposition marker
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        setPosition({ lat: e.latlng.lat, lon: e.latlng.lng });
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      // Invalidate size after layout mounts
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 250);
    } catch (err) {
      console.warn('Leaflet location picker init notice:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Move marker & pan map to new coordinates
  const panToCoords = (lat, lon, newAddress = '') => {
    setPosition({ lat, lon });
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lon], 15, { animate: true });
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    }
    if (newAddress) {
      setAddressText(newAddress);
      setUserHasSelected(true);
      if (onLocationSelect) {
        onLocationSelect({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lon.toFixed(6)),
          address: newAddress,
          district: 'Karnataka'
        });
      }
    } else {
      reverseGeocode(lat, lon);
    }
  };

  // Handle Nominatim Address Search
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      setGeoError('');
      // Limit to India with Karnataka bounding box preference
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=in&limit=5`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' }
      });
      if (res.ok) {
        const results = await res.json();
        setSearchResults(results);
        if (results.length === 0) {
          setGeoError('No matching locations found. Try searching with city or landmark name.');
        } else if (results.length === 1) {
          const item = results[0];
          panToCoords(Number(item.lat), Number(item.lon), item.display_name);
          setSearchResults([]);
        }
      }
    } catch (err) {
      setGeoError('Network error while searching locations. You can click on the map directly.');
    } finally {
      setIsSearching(false);
    }
  };

  // Device Geolocation
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setIsGeocoding(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGeocoding(false);
        const { latitude, longitude } = pos.coords;
        panToCoords(latitude, longitude);
      },
      (err) => {
        setIsGeocoding(false);
        setGeoError('Unable to retrieve device GPS location. Please select on the map.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleManualAddressChange = (e) => {
    const val = e.target.value;
    setAddressText(val);
    setUserHasSelected(Boolean(val));
    if (onLocationSelect) {
      onLocationSelect({
        latitude: Number(position.lat.toFixed(6)),
        longitude: Number(position.lon.toFixed(6)),
        address: val,
        district: 'Karnataka'
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header & Instructions */}
      <div>
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-stone-800 uppercase tracking-wide">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            {position.lat.toFixed(4)}° N, {position.lon.toFixed(4)}° E
          </span>
        </div>
        {helperText && <p className="text-xs text-stone-500 mt-0.5">{helperText}</p>}
      </div>

      {/* Address Search & Geolocation Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form onSubmit={handleSearch} className="relative flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search area, landmark or street (e.g. Tumakuru Bus Stand, Indiranagar)..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-700 bg-white"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isSearching}
            className="flex-shrink-0 text-xs px-3 py-2 border-stone-300 hover:bg-stone-50"
          >
            {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
          </Button>
        </form>

        <Button
          type="button"
          onClick={handleUseCurrentLocation}
          variant="outline"
          size="sm"
          disabled={isGeocoding}
          className="flex-shrink-0 text-xs gap-1.5 border-emerald-300 text-emerald-900 bg-emerald-50/70 hover:bg-emerald-100/70"
          title="Detect GPS coordinates"
        >
          {isGeocoding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-800" />
          ) : (
            <Crosshair className="w-3.5 h-3.5 text-emerald-800" />
          )}
          <span>My GPS</span>
        </Button>
      </div>

      {/* Search Autocomplete Results Dropdown */}
      {searchResults.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-300 shadow-md p-1.5 space-y-1 text-xs max-h-44 overflow-y-auto">
          {searchResults.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                panToCoords(Number(item.lat), Number(item.lon), item.display_name);
                setSearchResults([]);
              }}
              className="w-full text-left p-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-start gap-2 text-stone-700"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0 mt-0.5" />
              <span className="truncate">{item.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Quick Region Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="text-stone-400 font-semibold flex-shrink-0">Quick Jump:</span>
        {KARNATAKA_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => panToCoords(preset.lat, preset.lon)}
            className="px-2 py-0.5 rounded-full bg-stone-100 hover:bg-emerald-100 hover:text-emerald-900 border border-stone-200 text-stone-700 transition-colors flex-shrink-0"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Map Canvas */}
      <div className="relative rounded-xl border-2 border-brand-800/40 overflow-hidden shadow-xs h-64 sm:h-72 bg-stone-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {isGeocoding && (
          <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs border border-stone-200 text-[11px] text-stone-700 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-800" />
            <span>Updating address details...</span>
          </div>
        )}

        {/* Map Interaction Legend Overlay */}
        <div className="absolute bottom-2 right-2 z-10 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs border border-stone-200 text-[10px] text-stone-600 font-medium pointer-events-none">
          Click map or drag pin to adjust
        </div>
      </div>

      {/* Confirmed Address Input / Display */}
      <div className="p-3 rounded-xl bg-surface-muted border border-border space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-stone-800">
            <CheckCircle2 className={`w-4 h-4 ${userHasSelected ? 'text-emerald-700' : 'text-stone-400'}`} />
            <span>Selected Permanent Address</span>
          </div>
          <span className="text-[10px] text-stone-500 font-mono">
            Lat: {position.lat.toFixed(5)}, Lon: {position.lon.toFixed(5)}
          </span>
        </div>

        <input
          type="text"
          value={addressText}
          onChange={handleManualAddressChange}
          placeholder="Building name, street, locality, district..."
          required={required}
          className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-700 bg-white text-stone-900 font-medium"
        />

        <p className="text-[11px] text-stone-500">
          This address and exact GPS coordinate will be permanently saved to your account and automatically used for all future deliveries and surplus matching.
        </p>
      </div>

      {geoError && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{geoError}</span>
        </div>
      )}
    </div>
  );
}
