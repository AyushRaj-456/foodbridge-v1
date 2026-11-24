import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import kn from '../locales/kn.json';
import hi from '../locales/hi.json';

const dictionaries = { en, kn, hi };

function defaultTranslate(key, fallbackOrParams = '', maybeParams = null) {
  let fallback = '';
  let params = null;
  if (fallbackOrParams && typeof fallbackOrParams === 'object' && !Array.isArray(fallbackOrParams)) {
    params = fallbackOrParams;
    fallback = typeof maybeParams === 'string' ? maybeParams : '';
  } else {
    fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : '';
    if (maybeParams && typeof maybeParams === 'object') {
      params = maybeParams;
    }
  }

  const keys = String(key || '').split('.');
  let val = en;
  for (const k of keys) {
    if (!val || typeof val !== 'object') {
      val = undefined;
      break;
    }
    val = val[k];
  }

  const baseText = typeof val === 'string' ? val : fallback || key;
  return params ? interpolate(baseText, params) : baseText;
}

export const LocaleContext = createContext({
  locale: 'en',
  setLocale: () => {},
  t: defaultTranslate,
  formatDate: () => '',
  formatTime: () => '',
  formatDateTime: () => '',
  formatRelativeTime: () => '',
  formatNumber: () => '',
  formatCurrency: () => '',
  supportedLocales: []
});

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' }
];

function interpolate(text, params) {
  if (typeof text !== 'string' || !params || typeof params !== 'object') {
    return text;
  }
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g, (match, p1, p2) => {
    const key = p1 || p2;
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : match;
  });
}

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

  const t = (path, fallbackOrParams = '', maybeParams = null) => {
    let fallback = '';
    let params = null;

    if (fallbackOrParams && typeof fallbackOrParams === 'object' && !Array.isArray(fallbackOrParams)) {
      params = fallbackOrParams;
      fallback = typeof maybeParams === 'string' ? maybeParams : '';
    } else {
      fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : '';
      if (maybeParams && typeof maybeParams === 'object') {
        params = maybeParams;
      }
    }

    const dict = dictionaries[locale] || dictionaries.en;
    const parts = String(path || '').split('.');
    let current = dict;
    let found = true;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        found = false;
        break;
      }
    }

    let result = found && current !== undefined ? current : undefined;

    // Fallback to English dictionary if key missing in current locale
    if (result === undefined) {
      let enCurrent = dictionaries.en;
      let enFound = true;
      for (const enPart of parts) {
        if (enCurrent && typeof enCurrent === 'object' && enPart in enCurrent) {
          enCurrent = enCurrent[enPart];
        } else {
          enFound = false;
          break;
        }
      }
      if (enFound && enCurrent !== undefined) {
        result = enCurrent;
      }
    }

    if (result === undefined) {
      result = fallback || path;
    }

    if (typeof result === 'string' && params) {
      return interpolate(result, params);
    }

    return result;
  };

  const getIntlLocale = () => (locale === 'kn' ? 'kn-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN');

  const parseDateInput = (d) => {
    if (!d) return null;
    if (d.seconds) return new Date(d.seconds * 1000);
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDate = (dateInput, options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    const d = parseDateInput(dateInput);
    if (!d) return '—';
    try {
      return new Intl.DateTimeFormat(getIntlLocale(), options).format(d);
    } catch (e) {
      return d.toLocaleDateString();
    }
  };

  const formatTime = (dateInput, options = { hour: '2-digit', minute: '2-digit' }) => {
    const d = parseDateInput(dateInput);
    if (!d) return '—';
    try {
      return new Intl.DateTimeFormat(getIntlLocale(), options).format(d);
    } catch (e) {
      return d.toLocaleTimeString();
    }
  };

  const formatDateTime = (dateInput, options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) => {
    const d = parseDateInput(dateInput);
    if (!d) return '—';
    try {
      return new Intl.DateTimeFormat(getIntlLocale(), options).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  };

  const formatRelativeTime = (dateInput) => {
    const d = parseDateInput(dateInput);
    if (!d) return t('notifications.relative.justNow', 'Just now');
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / (1000 * 60));

    if (diffMin < 1) {
      return t('notifications.relative.justNow', 'Just now');
    }
    if (diffMin < 60) {
      return t('notifications.relative.minutesAgo', `${diffMin}m ago`, { count: diffMin });
    }
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) {
      return t('notifications.relative.hoursAgo', `${diffHours}h ago`, { count: diffHours });
    }
    const diffDays = Math.round(diffHours / 24);
    return t('notifications.relative.daysAgo', `${diffDays}d ago`, { count: diffDays });
  };

  const formatNumber = (num, options = {}) => {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    try {
      return new Intl.NumberFormat(getIntlLocale(), options).format(Number(num));
    } catch (e) {
      return String(num);
    }
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return '₹0';
    return `₹${formatNumber(amount)}`;
  };

  return (
    <LocaleContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatDate,
        formatTime,
        formatDateTime,
        formatRelativeTime,
        formatNumber,
        formatCurrency,
        supportedLocales: SUPPORTED_LOCALES
      }}
    >
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
