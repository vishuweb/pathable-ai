"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_PREFERENCES, PREFERENCES_KEY, parsePreferences, type NeedPreferences } from "./needs";

/**
 * The person's needs, kept only in this browser's storage. Storage can be unavailable (private
 * windows, blocked site data), so every access is guarded and the app works without it.
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<NeedPreferences>(EMPTY_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setPreferences(parsePreferences(window.localStorage.getItem(PREFERENCES_KEY)));
    } catch {
      // Storage blocked: behave as if nothing was saved.
    }
    setLoaded(true);
  }, []);

  const save = useCallback((next: NeedPreferences): boolean => {
    setPreferences(next);
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }, []);

  const clear = useCallback(() => {
    setPreferences(EMPTY_PREFERENCES);
    try {
      window.localStorage.removeItem(PREFERENCES_KEY);
    } catch {
      // Nothing stored to remove.
    }
  }, []);

  return { preferences, loaded, save, clear };
}
