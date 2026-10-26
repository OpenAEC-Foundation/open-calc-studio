/** Storage can be unavailable in private browsing and opaque-origin host frames. */
function storage(area: 'localStorage' | 'sessionStorage'): Storage {
  const fallback = new Map<string, string>();
  function native(): Storage | undefined {
    try { return typeof window === 'undefined' ? undefined : window[area]; } catch { return undefined; }
  }
  return {
    get length() { try { return native()?.length ?? fallback.size; } catch { return fallback.size; } },
    key(index) { try { const store = native(); return store ? store.key(index) : [...fallback.keys()][index] ?? null; } catch { return [...fallback.keys()][index] ?? null; } },
    getItem(key) { try { const store = native(); return fallback.has(key) ? fallback.get(key)! : store ? store.getItem(key) : null; } catch { return fallback.get(key) ?? null; } },
    setItem(key, value) {
      const store = native();
      if (!store) { fallback.set(key, String(value)); return; }
      try { store.setItem(key, String(value)); fallback.delete(key); } catch { fallback.set(key, String(value)); }
    },
    removeItem(key) { fallback.delete(key); try { native()?.removeItem(key); } catch { /* unavailable */ } },
    clear() { fallback.clear(); try { native()?.clear(); } catch { /* unavailable */ } },
  };
}
export const localStore = storage('localStorage');
export const sessionStore = storage('sessionStorage');
