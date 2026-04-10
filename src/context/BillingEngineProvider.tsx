"use client";
// BillingEngineProvider: lightweight context to select which billing engine
// the demo should use (Stripe Billing or Chargebee). This intentionally keeps
// the shape minimal and persists the choice to sessionStorage so page reloads
// retain the selection across the browsing session.
//
// The rest of the app (SubscriptionProvider, checkout pages, etc.) can branch
// on this to call parallel API endpoints (e.g. /api/subscriptions for Stripe
// vs /api/chargebee/subscriptions for Chargebee). Keeping a small dedicated
// provider avoids coupling billing choice logic with subscription state.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type BillingEngine = 'stripe' | 'chargebee' | 'recurly';

interface BillingEngineContextValue {
  engine: BillingEngine;
  setEngine: (engine: BillingEngine) => void;
}

const BillingEngineContext = createContext<BillingEngineContextValue | undefined>(undefined);

const STORAGE_KEY = 'billingEngine';

export const BillingEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Lazy init: prefer previously stored value; default to 'stripe'
  const [engine, internalSetEngine] = useState<BillingEngine>(() => {
    if (typeof window === 'undefined') return 'stripe';
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw === 'stripe' || raw === 'chargebee' || raw === 'recurly') return raw;
    } catch { /* ignore */ }
    return 'stripe';
  });

  const setEngine = useCallback((next: BillingEngine) => {
    internalSetEngine(next);
    try { sessionStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // Sync storage if engine changes via some indirect mechanism (unlikely but defensive)
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, engine); } catch { /* ignore */ }
  }, [engine]);

  return (
    <BillingEngineContext.Provider value={{ engine, setEngine }}>
      {children}
    </BillingEngineContext.Provider>
  );
};

export function useBillingEngine(): BillingEngineContextValue {
  const ctx = useContext(BillingEngineContext);
  if (!ctx) throw new Error('useBillingEngine must be used within BillingEngineProvider');
  return ctx;
}
