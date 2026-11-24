import React, { useState, useRef, useEffect } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { db, doc, setDoc } from '../../services/firebase';
import { Globe, ChevronDown, Check } from 'lucide-react';

export function LanguageSelector({ variant = 'default', className = '' }) {
  const { locale, setLocale, supportedLocales } = useLocale();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const current = supportedLocales.find((l) => l.code === locale) || supportedLocales[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (code) => {
    setLocale(code);
    setIsOpen(false);
    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), { preferredLocale: code }, { merge: true });
      } catch (err) {
        // Silent failure if offline or firestore unavailable
      }
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select language"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:bg-surface-muted border border-border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
      >
        <Globe className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
        <span className="font-semibold text-stone-900">{current.nativeLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label="Available languages"
          className="absolute right-0 mt-1.5 w-40 bg-white rounded-lg border border-border shadow-lg py-1 z-50 focus:outline-none text-xs sm:text-sm animate-in fade-in-50 duration-150"
        >
          {supportedLocales.map((loc) => {
            const isSelected = loc.code === locale;
            return (
              <li
                key={loc.code}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleSelect(loc.code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(loc.code);
                  }
                }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-stone-700 hover:bg-surface-muted'
                }`}
              >
                <div className="flex flex-col">
                  <span>{loc.nativeLabel}</span>
                  <span className="text-[11px] text-stone-400 font-normal">{loc.label}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-brand-700" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
