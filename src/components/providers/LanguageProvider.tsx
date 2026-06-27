"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { vi, TranslationKey } from "@/lib/i18n/vi";
import { en } from "@/lib/i18n/en";

type Language = "vi" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (section: keyof TranslationKey, key: string) => string;
}

const dictionaries = {
  vi,
  en,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("app_language") as Language;
    if (saved && (saved === "vi" || saved === "en")) {
      setLanguageState(saved);
    }
    setMounted(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app_language", lang);
    // Optionally trigger a custom event if we need other non-React things to know
    window.dispatchEvent(new Event("languagechange"));
  }, []);

  const t = useCallback((section: keyof TranslationKey, key: string) => {
    const dict = dictionaries[language];
    // Cast to any because TS doesn't know the exact string keys of each section
    const sectionDict = dict[section] as any;
    if (sectionDict && sectionDict[key]) {
      return sectionDict[key];
    }
    // Fallback to vi if not found in current lang
    const fallbackDict = dictionaries["vi"][section] as any;
    if (fallbackDict && fallbackDict[key]) {
      return fallbackDict[key];
    }
    // If completely missing, just return the key
    return key;
  }, [language]);

  // Prevent hydration mismatch by not rendering until mounted
  // Actually, we can render with default language to avoid layout shift,
  // since the context is client-side. The mismatch might happen if default is vi but saved is en.
  // It's safer to just render with vi initially, and it will snap to en after mount.
  // For critical text, a slight flicker is accepted over blank screen.

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
