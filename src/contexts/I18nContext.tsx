import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Locale, type TranslationKey } from '../lib/i18n/translations';

interface I18nContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ar',
  dir: 'rtl',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (k) => String(k),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('rafd-locale') as Locale | null;
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('rafd-locale', l);
  };

  const toggleLocale = () => setLocale(locale === 'ar' ? 'en' : 'ar');

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale === 'ar' ? 'ar' : 'en';
    root.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      setLocale,
      toggleLocale,
      t: (key) => translate(key, locale),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
