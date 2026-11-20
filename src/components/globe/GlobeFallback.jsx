import React from 'react';
import { useLocale } from '../../context/LocaleContext';
import { MapPin, Navigation, Info } from 'lucide-react';

export function GlobeFallback({ reason = 'standard' }) {
  const { t } = useLocale();

  const hubs = [
    { name: 'Bengaluru Hub', role: 'State Redistribution Center', coord: '12.97° N, 77.59° E', donors: 'Active', pos: 'bottom-right' },
    { name: 'Tumakuru Zone', role: 'Pilot Matching Corridor', coord: '13.34° N, 77.10° E', donors: 'Active', pos: 'center-right' },
    { name: 'Mysuru Corridor', role: 'Regional Partner Network', coord: '12.30° N, 76.64° E', donors: 'Active', pos: 'bottom-left' },
    { name: 'Hubballi-Dharwad', role: 'North Karnataka Gateway', coord: '15.36° N, 75.12° E', donors: 'Active', pos: 'top-left' },
  ];

  return (
    <div className="relative w-full h-[380px] sm:h-[450px] lg:h-[480px] rounded-2xl bg-gradient-to-b from-stone-900 to-stone-950 text-white p-6 overflow-hidden border border-stone-800 flex flex-col justify-between">
      {/* Background stylized grid & map shape */}
      <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#2D6A4F_1px,transparent_1px)] [background-size:16px_16px]" />

      {/* Top Header Badge */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-900/80 border border-brand-700/60 text-xs text-brand-200">
          <Navigation className="w-3.5 h-3.5 text-brand-400" />
          <span>{t('globe.fallbackHeading', 'Karnataka Regional Distribution')}</span>
        </div>
        <span className="text-[11px] text-stone-400 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700">
          {reason === 'reduced-motion' ? t('globe.reducedMotion', 'Motion reduced') : 'Static View'}
        </span>
      </div>

      {/* Regional Diagram with Illustrative Corridors */}
      <div className="relative z-10 my-auto grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto w-full">
        {hubs.map((hub) => (
          <div
            key={hub.name}
            className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-800 shadow-sm flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-900/60 text-brand-300 border border-brand-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-semibold text-white">{hub.name}</h4>
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              </div>
              <p className="text-xs text-stone-400">{hub.role}</p>
              <p className="text-[11px] font-mono text-brand-300/80 mt-1">{hub.coord}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="relative z-10 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/80">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-stone-400" />
          <span>{t('globe.fallbackBody')}</span>
        </div>
        <span className="font-medium text-brand-300">Karnataka Hub</span>
      </div>
    </div>
  );
}
