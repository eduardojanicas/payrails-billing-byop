"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import '@payrails/web-sdk/payrails-styles.css';
import { Payrails } from '@payrails/web-sdk';
// evaluatePaymentOutcome available for caller overrides; not used directly here.
import { useInitGuard, useMountGuard } from './shared/mountGuards';
import { createLogger } from '@/utils/logger';
import { cloudApi } from '@/api/cloudApi';

// Default styling used when caller doesn't supply dropinConfig.styles
const defaultDropinStyles = {
  container: { className: 'payrails-dropin-container' },
  element: { className: 'payrails-element-base' },
  cardForm: {
    wrapper: { className: 'payrails-element-wrapper' },
    errorTextStyles: { base: { color: 'var(--pr-color-error)', fontSize: '12px' } },
    labels: { all: { className: 'payrails-label' } },
    storeInstrumentCheckbox: { className: 'payrails-store-checkbox' },
  },
  cardPaymentButton: {
    base: { className: 'payrails-payment-button' },
    disabled: { opacity: '0.55', cursor: 'not-allowed' },
    loading: { opacity: '0.55' },
    hover: {},
  },
  authSuccess: { className: 'payrails-auth-success' },
  authFailed: { className: 'payrails-auth-failed' },
  loadingScreen: { overlay: { className: 'payrails-loading-overlay' }, loader: { className: 'payrails-spinner' } }
};

export interface UsePayrailsDropinOptions {
  amount: number;
  currency: string;
  autoMount?: boolean;
  holderReference?: string;
  invoiceId?: string;
  enabled?: boolean;
  visible?: boolean;
  onReady?: (executionId: string | null) => void;
  onError?: (err: Error | string) => void;
  onSessionExpired?: () => Promise<any> | any;
  dropinConfig?: Record<string, any>;
}

export interface UsePayrailsDropinResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  executionId: string | null;
  mount: (el: HTMLElement | null) => void;
  refresh: () => Promise<void>;
}

export function usePayrailsDropin(opts: UsePayrailsDropinOptions): UsePayrailsDropinResult {
  const { amount, currency, autoMount = true, holderReference, invoiceId, enabled = true, visible = true, onReady, onError, onSessionExpired, dropinConfig } = opts;
  const containerRef = useRef<HTMLElement | null>(null);
  const containerIdRef = useRef<string>(`payrails-dropin-${Math.random().toString(36).slice(2)}`);
  const payrailsClientRef = useRef<any>(null);
  const dropinInstanceRef = useRef<any>(null);
  const { initOnce, resetInit } = useInitGuard();
  const { didMount, mountOnce, resetMount } = useMountGuard();

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);

  const performInit = useCallback(async () => {
    if (!enabled) return;
    await initOnce(async () => {
      setStatus('loading');
      setError(null);
      try {
        const resp = await cloudApi('/payrails/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, currency, holderReference, invoiceId })
        });
        if (!resp.ok) throw new Error(`Init failed: ${resp.status}`);
        const initPayload = await resp.json();
        const env = (import.meta.env.VITE_PAYRAILS_ENV || 'TEST') as any;
        payrailsClientRef.current = Payrails.init(initPayload, {
          environment: env,
          events: {
            onClientInitialized: (workflow: any) => {
              const id = workflow?.executionResponse?.id;
              setExecutionId(id || null);
              onReady?.(id || null);
            },
            onSessionExpired: async () => {
              if (onSessionExpired) {
                try { return await onSessionExpired(); } catch (e) { createLogger({ route: 'hooks/usePayrailsDropin' }).warn('onSessionExpired handler error', e); }
              }
              try {
                const r = await cloudApi('/payrails/init', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount, currency, holderReference, invoiceId })
                });
                if (r.ok) return await r.json();
              } catch {/* ignore */}
              return undefined;
            }
          }
        });
        // Defensive: some Payrails SDK flows (inline menu) expect a message handler to be
        // registered before calls to `onMessage('<inline-menu-ready>')` occur. Register a
        // noop handler using multiple possible SDK method names to be robust across SDK versions.
        try {
          const client = payrailsClientRef.current;
          const handlerName = 'inline-menu-ready';
          const noop = () => undefined;
          if (client) {
            if (typeof client.registerMessageHandler === 'function') {
              client.registerMessageHandler(handlerName, noop);
            } else if (typeof client.registerHandler === 'function') {
              client.registerHandler(handlerName, noop);
            } else if (typeof client.on === 'function') {
              client.on(handlerName, noop);
            } else if (typeof client.addEventListener === 'function') {
              client.addEventListener(handlerName, noop);
            } else if (typeof client.onMessage === 'function') {
              client.onMessage(handlerName, noop);
            } else if (typeof client.addMessageHandler === 'function') {
              client.addMessageHandler(handlerName, noop);
            } else {
              createLogger({ route: 'hooks/usePayrailsDropin' }).debug('No message registration API found on Payrails client; continuing without explicit inline-menu-ready handler');
            }
          }
        } catch (regErr) {
          createLogger({ route: 'hooks/usePayrailsDropin' }).warn('Failed registering inline-menu-ready handler on Payrails client', regErr);
        }
        // Build merged Drop-in configuration
        const mergedConfig = {
          events: {
            onAuthorizeSuccess: async () => {
              // Attempt optimistic redirect if PaymentRecordProvider already holds state
              try {
                // We don't have direct access to context here; evaluatePaymentOutcome kept for parity API
                // In real usage, caller supplies events override referencing provider.
              } catch {/* ignore */}
              /* user can override via dropinConfig.events */
            },
            ...(dropinConfig?.events || {})
          },
          paymentMethodsConfiguration: {
            cards: {
              showExistingCards: true,
              showPaymentMethodLogo: true,
              ...(dropinConfig?.paymentMethodsConfiguration?.cards || {})
            },
            googlePay: {
              showPaymentMethodLogo: true,
              ...(dropinConfig?.paymentMethodsConfiguration?.googlePay || {})
            },
            applePay: {
              showPaymentMethodLogo: true,
              ...(dropinConfig?.paymentMethodsConfiguration?.applePay || {})
            },
            ...Object.fromEntries(
              Object.entries(dropinConfig?.paymentMethodsConfiguration || {}).filter(([k]) => !['cards','googlePay','applePay'].includes(k))
            )
          },
          styles: dropinConfig?.styles || defaultDropinStyles,
          translations: dropinConfig?.translations
        };
        dropinInstanceRef.current = payrailsClientRef.current.dropin(mergedConfig);
        // Auto-mount if conditions satisfied
          if (autoMount && visible && containerRef.current) {
          if (!containerRef.current.id) containerRef.current.id = containerIdRef.current;
          mountOnce(() => {
              try { dropinInstanceRef.current.mount(`#${containerRef.current!.id}`); } catch (e) { createLogger({ route: 'hooks/usePayrailsDropin' }).warn('Initial drop-in mount failed', e); }
          });
        }
        setStatus('ready');
      } catch (e: any) {
        setError(e.message || 'Unknown error');
        setStatus('error');
        onError?.(e);
      }
    });
  }, [enabled, initOnce, amount, currency, holderReference, invoiceId, onError, onReady, onSessionExpired, autoMount, visible, dropinConfig, mountOnce]);

  // Public mount ref setter
  const mount = useCallback((el: HTMLElement | null) => {
    containerRef.current = el;
    if (!el) return;
    if (!el.id) el.id = containerIdRef.current; else containerIdRef.current = el.id;
              if (status === 'ready' && dropinInstanceRef.current && visible) {
      mountOnce(() => {
        try { dropinInstanceRef.current.mount(`#${el.id}`); } catch (e) { createLogger({ route: 'hooks/usePayrailsDropin' }).warn('Mount after ready failed', e); }
      });
    }
  }, [status, visible, mountOnce]);

  // Refresh: unmount + reset guards + re-init
  const refresh = useCallback(async () => {
        if (dropinInstanceRef.current?.unmount) {
      try { dropinInstanceRef.current.unmount(); } catch {/* ignore */}
    }
    dropinInstanceRef.current = null;
    payrailsClientRef.current = null;
    resetMount();
    resetInit();
    setStatus('idle');
    await performInit();
    if (containerRef.current && dropinInstanceRef.current && visible) {
      mountOnce(() => {
        try { dropinInstanceRef.current.mount(`#${containerRef.current!.id || containerIdRef.current}`); } catch {/* ignore */}
      });
    }
  }, [performInit, resetInit, resetMount, mountOnce, visible]);

  // Initial one-time init
  useEffect(() => { performInit(); }, [performInit]);

  // Visibility toggling
  useEffect(() => {
    if (!visible && didMount.current && dropinInstanceRef.current?.unmount) {
      try { dropinInstanceRef.current.unmount(); } catch {/* ignore */}
      resetMount();
      return;
    }
        if (visible && status === 'ready' && dropinInstanceRef.current && containerRef.current) {
      mountOnce(() => {
        try { dropinInstanceRef.current.mount(`#${containerRef.current!.id || containerIdRef.current}`); } catch (e) { createLogger({ route: 'hooks/usePayrailsDropin' }).warn('Remount on visibility toggle failed', e); }
      });
    }
  }, [visible, status, mountOnce, resetMount, didMount]);

  return { status, error, executionId, mount, refresh };
}
