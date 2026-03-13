"use client";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useBillingEngine } from './BillingEngineProvider';
import { cloudApi } from '@/api/cloudApi';
import { useAuthSession } from '@/providers/AuthProvider';

interface SubscriptionData {
  id?: string;
  userId?: string;
  amount: string;
  currency: string;
  holderReference: string;
  invoiceId?: string;
  customerId?: string;
  subscriptionId?: string;
  email?: string;
  engine?: 'stripe' | 'chargebee'; // which billing engine produced this subscription
}

interface SubscriptionContextValue {
  subData: SubscriptionData | null;
  loadingSub: boolean;
  subError: string | null;
  refresh: () => Promise<void>; // re-fetch with same holderReference (if exists)
  restartDemo: () => Promise<void>; // clear all stored subscription & payment record state & start over
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const hasAttempted = useRef(false);

  const { engine } = useBillingEngine();
  const { user, loading: authLoading } = useAuthSession();

  const createNewSubscription = useCallback(async (holderReference: string) => {
    // Branch based on billing engine. Stripe retains existing logic; Chargebee uses its own endpoint.
    let json: any;
    if (engine === 'chargebee') {
      // Step 1 (demo stub): fetch estimate for transparency (not persisted currently)
      try {
        await cloudApi('/chargebee/estimate', { method: 'POST' });
      } catch { /* non-fatal for demo */ }
      // Step 2: create combined customer+subscription stub
      const res = await cloudApi('/chargebee/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holderReference, email: 'johndoe@example.com' })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Subscription create failed (chargebee): ${res.status} ${txt}`);
      }
      json = await res.json();
    } else {
      const res = await cloudApi('/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holderReference, email: 'johndoe@example.com' })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Subscription create failed (stripe): ${res.status} ${txt}`);
      }
      json = await res.json();
    }
    const newData: SubscriptionData = {
      id: json.id || json.subscriptionRecordId,
      userId: user?.id,
      amount: json.amount,
      currency: json.currency,
      holderReference: json.holderReference,
      invoiceId: json.invoiceId,
      customerId: json.customer?.id || json.customerId,
      subscriptionId: json.subscription?.id || json.subscriptionId,
      email: json.email,
      engine,
    };
    setSubData(newData);
    try { sessionStorage.setItem('subData', JSON.stringify(newData)); } catch { /* ignore */ }
  }, [engine, user?.id]);

  const performFetch = useCallback(async () => {
    setLoadingSub(true);
    setSubError(null);
    try {
      if (subData) {
        // Refresh existing subscription by reusing holderReference (creates a new subscription each call if endpoint always creates).
        await createNewSubscription(subData.holderReference);
      } else {
        // Attempt restore from sessionStorage first
        try {
          const raw = sessionStorage.getItem('subData');
          if (raw) {
            const parsed: SubscriptionData = JSON.parse(raw);
            if (parsed?.holderReference) {
              setSubData(parsed);
              setLoadingSub(false);
              return; // skip network since we restored
            }
          }
        } catch { /* ignore restore errors */ }
        // Create brand new subscription
        const holderReference = `tp_${crypto.randomUUID()}`;
        await createNewSubscription(holderReference);
      }
    } catch (e: any) {
      setSubError(e.message || 'Unknown subscription error');
    } finally {
      setLoadingSub(false);
    }
  }, [subData, createNewSubscription]);

  useEffect(() => {
    // Auto-create subscription on first mount only
    if (!subData && !loadingSub && !authLoading && user && !hasAttempted.current) {
      hasAttempted.current = true;
      void performFetch();
    }
  }, [subData, loadingSub, authLoading, user, performFetch]);

  const refresh = useCallback(async () => {
    await performFetch();
  }, [performFetch]);

  const restartDemo = useCallback(async () => {
    setLoadingSub(true);
    setSubError(null);
    try {
      // Clear current subscription data & storage
      setSubData(null);
      try { sessionStorage.removeItem('subData'); } catch { /* ignore */ }
      // Also clear payment record related keys so restart fully resets demo
      try {
        sessionStorage.removeItem('paymentRecord');
        sessionStorage.removeItem('paymentRecordError');
      } catch { /* ignore */ }
      // Start afresh with brand new holder
      const holderReference = `tp_${crypto.randomUUID()}`;
      await createNewSubscription(holderReference);
    } catch (e: any) {
      setSubError(e.message || 'Restart demo error');
    } finally {
      setLoadingSub(false);
    }
  }, [createNewSubscription]);

  return (
    <SubscriptionContext.Provider value={{ subData, loadingSub, subError, refresh, restartDemo }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
