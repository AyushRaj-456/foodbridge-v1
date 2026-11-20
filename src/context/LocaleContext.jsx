import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import kn from '../locales/kn.json';
import hi from '../locales/hi.json';

const dictionaries = { en, kn, hi };

export const LocaleContext = createContext({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
  supportedLocales: []
});

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' }
];

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('foodbridge_locale');
      if (saved && ['en', 'kn', 'hi'].includes(saved)) {
        return saved;
      }
    }
    return 'en';
  });

  const setLocale = (newLocale) => {
    if (['en', 'kn', 'hi'].includes(newLocale)) {
      setLocaleState(newLocale);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('foodbridge_locale', newLocale);
      }
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = (path, fallback = '') => {
    const dict = dictionaries[locale] || dictionaries.en;
    const parts = path.split('.');
    let current = dict;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        // Fallback to English dictionary if key missing in current locale
        let enCurrent = dictionaries.en;
        for (const enPart of parts) {
          if (enCurrent && typeof enCurrent === 'object' && enPart in enCurrent) {
            enCurrent = enCurrent[enPart];
          } else {
            return fallback || path;
          }
        }
        return enCurrent;
      }
    }
    return current !== undefined ? current : (fallback || path);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, supportedLocales: SUPPORTED_LOCALES }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
