"use client"
/**
 * usePayrailsElements (Getting Started Demo)
 * ---------------------------------------------------------------------------
 * Minimal hook showing how to:
 *  1. Fetch an init payload from /api/init (server performs OAuth + Payrails init).
 *  2. Initialize the Payrails Web SDK.
 *  3. Mount the Card Form (when paymentMethod === 'card').
 *  4. Mount a Payment Button that optionally performs a lookup enrichment before authorization.
 *  5. Redirect to simple success / failure pages.
 *
 * Kept intentionally small: no advanced retries, analytics, styling config, or edge‑case handling.
 * Feel free to fork and enhance for production.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Payrails } from '@payrails/web-sdk'
import { useInitGuard, useMountGuard } from './shared/mountGuards'
import { useSubscription } from '@/context/SubscriptionProvider'
import { usePaymentRecord } from '@/context/PaymentRecordProvider'
import { evaluatePaymentOutcome } from '@/utils/paymentRedirect'
import { resolvePreferredInstrument } from '@/utils/resolveInstrument'
import { useBillingEngine } from '@/context/BillingEngineProvider'
import { cloudApi } from '@/api/cloudApi'

export interface UsePayrailsElementsOptions {
    amount: number          // Minor units (e.g. 9995 == $99.95)
    currency: string        // ISO 4217 currency code
    workflowCode?: string   // Workflow to execute (default 'payment-acceptance')
    workspaceId?: string    // Optional override (normally handled server-side)
    holderReference?: string // Merchant-side customer identifier
    customerInfoProvider?: () => ({ // Called right before authorization to enrich metadata
        email: string
        address: string
        city: string
        region: string
        postal: string
    }) | null
    onCardFormReady?: () => void // Called when card form fires onReady
}

export type PayrailsElementsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsePayrailsElementsReturn {
    status: PayrailsElementsStatus
    error: string | null
    /** Attach to an empty div where the Card Form should mount */
    mountCardFormRef: (node: HTMLDivElement | null) => void
    /** Attach to an empty div where the Payment Button should mount */
    mountPaymentButtonRef: (node: HTMLDivElement | null) => void
    /** Attach to an empty div where the PayPal button element should mount */
    mountPayPalButtonRef: (node: HTMLDivElement | null) => void
    /** Workflow execution identifier (best-effort extraction from init payload) */
    executionId: string | null
    /** True while post-authorization processing (record payment, etc.) is in progress */
    authorizing: boolean
    /** True once the card form element has fired its onReady event */
    cardFormReady: boolean
}

// Workspace ID is not secret
const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_PAYRAILS_WORKSPACE_ID

export function usePayrailsElements(options: UsePayrailsElementsOptions): UsePayrailsElementsReturn {
    const { amount, currency, workflowCode = 'payment-acceptance', workspaceId = DEFAULT_WORKSPACE_ID, holderReference = 'holder-abc', customerInfoProvider, onCardFormReady } = options

    // Subscription + PaymentRecord contexts (replicating Drop-in behavior)
    const { subData } = useSubscription()
    // Ref to always read latest subscription data inside event handlers (avoids stale closure)
    const subDataRef = useRef(subData)
    useEffect(() => { subDataRef.current = subData }, [subData])
    const { setPaymentRecord, setPaymentRecordError, paymentRecord, paymentRecordError } = usePaymentRecord()
    const { engine } = useBillingEngine()
    const engineRef = useRef(engine)
    useEffect(() => { engineRef.current = engine }, [engine])

    const [status, setStatus] = useState<PayrailsElementsStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const [cardFormReady, setCardFormReady] = useState(false)
    const [authorizing, setAuthorizing] = useState<boolean>(false)
    const navigate = useNavigate()
    const navigateRef = useRef(navigate)
    useEffect(() => { navigateRef.current = navigate }, [navigate])

    // DOM container refs where SDK elements will mount.
    const cardFormContainerRef = useRef<HTMLDivElement | null>(null)
    const paymentButtonContainerRef = useRef<HTMLDivElement | null>(null)
    const paypalButtonContainerRef = useRef<HTMLDivElement | null>(null)

    // Deterministic IDs allow mounting via CSS selector (simpler for examples).
    const CARD_FORM_ID = 'card-form-container'
    const PAYMENT_BUTTON_ID = 'payment-button-container'
    const PAYPAL_BUTTON_ID = 'paypal-button-container'

    const [executionId, setExecutionId] = useState<string | null>(null)
    const executionIdRef = useRef<string | null>(null)
    useEffect(() => { executionIdRef.current = executionId }, [executionId])
    const customerInfoProviderRef = useRef<typeof customerInfoProvider | null>(null)
    useEffect(() => { customerInfoProviderRef.current = customerInfoProvider }, [customerInfoProvider])

    // Stable value refs so one-time init effect can read latest values without re-running.
    const amountRef = useRef(amount)
    const currencyRef = useRef(currency)
    const workflowCodeRef = useRef(workflowCode)
    const holderRefRef = useRef(holderReference)
    const workspaceIdRef = useRef(workspaceId)
    useEffect(() => { amountRef.current = amount }, [amount])
    useEffect(() => { currencyRef.current = currency }, [currency])
    useEffect(() => { workflowCodeRef.current = workflowCode }, [workflowCode])
    useEffect(() => { holderRefRef.current = holderReference }, [holderReference])
    useEffect(() => { workspaceIdRef.current = workspaceId }, [workspaceId])
    // Initialization guard (prevents StrictMode double-init)
    const { initOnce } = useInitGuard()
    const clientRef = useRef<PayrailsClient | null>(null) // hold SDK client for post-init mounts

    // Element mount flags (DOM attribute detection unreliable – SDK may not add predictable markers)
    // Mount guards for individual elements
    const cardFormMount = useMountGuard()
    const paymentButtonMount = useMountGuard()
    const paypalButtonMount = useMountGuard()

    const mountCardFormRef = useCallback((node: HTMLDivElement | null) => {
        cardFormContainerRef.current = node
    }, [])

    const mountPaymentButtonRef = useCallback((node: HTMLDivElement | null) => {
        paymentButtonContainerRef.current = node
    }, [])

    const mountPayPalButtonRef = useCallback((node: HTMLDivElement | null) => {
        paypalButtonContainerRef.current = node
    }, [])

    // Helpers ---------------------------------------------------------------

    type PayrailsClient = {
        cardForm?: (cfg: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void }
        paymentButton?: (cfg: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void }
        paypalButton?: (cfg: Record<string, unknown>) => { mount: (sel: string | HTMLElement) => void }
    }

    // Stable merchant reference (initialized once). Use lazy initializer to avoid purity lint.
    const merchantReferenceRef = useRef<string>('')
    // Use performance.now via effect to avoid render-time impurity complaints.
    useEffect(() => {
        if (!merchantReferenceRef.current) {
            merchantReferenceRef.current = `order-${Math.round(performance.now())}`
        }
    }, [])

    const fetchInitPayload = useCallback(async (): Promise<Parameters<typeof Payrails.init>[0]> => {
        // STEP 3.1: Request init payload from backend (reads current refs not triggering re-init)
        const resp = await cloudApi('/payrails/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amountRef.current,
                currency: currencyRef.current,
                workflowCode: workflowCodeRef.current,
                merchantReference: merchantReferenceRef.current,
                holderReference: holderRefRef.current,
                workspaceId: workspaceIdRef.current,
            }),
        })
        if (!resp.ok) throw new Error('Init request failed')
        const initPayload: unknown = await resp.json()
        const payloadObj = initPayload as Record<string, unknown> | null
        return (payloadObj && 'res' in payloadObj ? (payloadObj as Record<string, unknown>)['res'] : initPayload) as Parameters<typeof Payrails.init>[0]
    }, [])

    const initSdk = useCallback((raw: Parameters<typeof Payrails.init>[0]): PayrailsClient => {
        // STEP 3.2: Initialize SDK
        return Payrails.init(raw, {
            redirectFor3DS: false,
            events: {

                onClientInitialized: async (execution: any) => {
                    setExecutionId(execution?.response?.id ?? null)
                },
            },
            returnInfo: {
                success: 'payrails.com/success',
                cancel: 'payrails.com/failure',
                error: 'payrails.com/error',
                pending: 'payrails.com/pending',
            },
        }) as unknown as PayrailsClient
    }, [])

    const mountCardFormIfNeeded = useCallback((client: PayrailsClient) => {
        if (!cardFormContainerRef.current || !client.cardForm) return
        cardFormMount.mountOnce(() => {
            const cardForm = client.cardForm!({
                showCardHolderName: false,
                alwaysStoreInstrument: true,
                events: {
                    onReady: () => {
                        setCardFormReady(true)
                        onCardFormReady?.()
                    },
                },
                styles: {
                    inputFields: {
                        all: {
                            base: {
                                border: '1px solid hsl(0 0% 90%)',
                                borderRadius: '8px',
                                margin: { top: 5, right: 0, bottom: 5, left: 0 },
                                backgroundColor: '#ffffff',
                                color: '#333333',
                            },
                            focus: {
                                backgroundColor: '#ffffff',
                                borderColor: 'hsl(24 100% 50%)',
                                color: '#333333',
                            },
                            invalid: {
                                backgroundColor: '#ffffff',
                                borderColor: 'hsl(0 84% 60%)',
                                color: '#333333',
                            },
                            complete: {
                                backgroundColor: '#ffffff',
                                borderColor: 'hsl(24 100% 50%)',
                                color: '#333333',
                            },
                        },
                    },
                },
            })
            cardForm.mount(`#${CARD_FORM_ID}`)
        })
    }, [cardFormMount, onCardFormReady])

    // Optional enrichment hook removed (unused) – retain pattern via comment for future.

    const mountPaymentButton = useCallback((client: PayrailsClient) => {
        // STEP 3.4: Mount payment button (CARD only). Guard against mounting when not selected
        // or when its container isn't present (prevents init loop retrying /api/init).
        if (!paymentButtonContainerRef.current || !client.paymentButton) return
        paymentButtonMount.mountOnce(() => {
            const paymentButton = client.paymentButton!({
                translations: { label: 'Pay' },
                events: {
                    onAuthorizeSuccess: async () => {
                        setAuthorizing(true)
                        // Replicate Drop-in onAuthorizeSuccess using latest subscription data
                        const currentSub = subDataRef.current
                        if (!currentSub) {
                            setPaymentRecordError('Missing subscription data for payment recording')
                            navigateRef.current('/checkout/success', { replace: true })
                            return
                        }
                        const { invoiceId, customerId, holderReference: holderRef, subscriptionId } = currentSub
                        if (!invoiceId || !customerId) {
                            setPaymentRecordError('Missing invoiceId or customerId')
                            navigateRef.current('/checkout/success', { replace: true })
                            return
                        }
                        let instrumentId: string | null = holderRef ? (await resolvePreferredInstrument(holderRef, { attempts: 1 })) : null
                        if (!instrumentId) instrumentId = 'instrument-unknown'
                        const amountMinor = parseInt(currentSub.amount, 10)
                        const currency = currentSub.currency
                        const successAt = new Date().toISOString()
                        try {
                            setPaymentRecord(null)
                            setPaymentRecordError(null)
                            const currentEngine = engineRef.current
                            let endpoint: string
                            let payload: any
                            if (currentEngine === 'recurly') {
                                endpoint = '/recurly/record-payment'
                                payload = { invoiceId, amountMinor, currency, subscriptionId, instrumentId }
                            } else if (currentEngine === 'chargebee') {
                                endpoint = '/chargebee/record-payment'
                                payload = { invoiceId, amountMinor, currency, subscriptionId, instrumentId }
                            } else {
                                endpoint = '/stripe/record-payment'
                                payload = { invoiceId, instrumentId, customerId, amount: amountMinor, currency, successAt, subscriptionId }
                            }
                            const res = await cloudApi(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            })
                            if (!res.ok) {
                                const txt = await res.text()
                                setPaymentRecordError(`Record payment failed: ${res.status} ${txt}`)
                                setAuthorizing(false)
                                navigateRef.current('/checkout/failure', { replace: true })
                                return
                            }
                            const data = await res.json()
                            setPaymentRecord({ ...data, engine: currentEngine })
                            setAuthorizing(false)
                            navigateRef.current('/checkout/success', { replace: true })
                        } catch (e: any) {
                            setPaymentRecordError(e?.message || 'Unknown record-payment error')
                            setAuthorizing(false)
                            navigateRef.current('/checkout/failure', { replace: true })
                        }
                    },
                    onAuthorizeFailed: () => {
                        setPaymentRecordError('Authorization failed')
                        setAuthorizing(false)
                        navigateRef.current('/checkout/failure', { replace: true })
                    },
                },
            })
            paymentButton.mount(`#${PAYMENT_BUTTON_ID}`)
            // Light post-mount styling to align with Tailwind examples.
            setTimeout(() => {
                const btn = paymentButtonContainerRef.current?.querySelector('button')
                if (btn) {
                    (btn as HTMLButtonElement).className = 'w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-background focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed'
                }
            }, 0)
        })
    }, [setPaymentRecord, setPaymentRecordError, paymentButtonMount])

    const mountPayPalButton = useCallback((client: PayrailsClient) => {
        // STEP 3.4b: Mount PayPal button when payment method is PayPal.
        if (!client.paypalButton || !paypalButtonContainerRef.current) return
        paypalButtonMount.mountOnce(() => {
            const paypalButton = client.paypalButton!({
                alwaysStoreInstrument: true,
                styles: {
                    color: 'gold',
                    shape: 'rect',
                    label: 'pay',
                    tagline: false,
                },
                events: {
                    onAuthorizeSuccess: async () => {
                        setAuthorizing(true)
                        // Reuse same success flow as card payment button
                        const currentSub = subDataRef.current
                        if (!currentSub) {
                            setPaymentRecordError('Missing subscription data for PayPal payment recording')
                            navigateRef.current('/checkout/success', { replace: true })
                            return
                        }
                        const { invoiceId, customerId, holderReference: holderRef, subscriptionId } = currentSub
                        if (!invoiceId || !customerId) {
                            setPaymentRecordError('Missing invoiceId or customerId')
                            navigateRef.current('/checkout/success', { replace: true })
                            return
                        }
                        let instrumentId: string | null = holderRef ? (await resolvePreferredInstrument(holderRef, { attempts: 1 })) : null
                        if (!instrumentId) instrumentId = 'instrument-unknown'
                        const amountMinor = parseInt(currentSub.amount, 10)
                        const currency = currentSub.currency
                        const successAt = new Date().toISOString()
                        try {
                            setPaymentRecord(null)
                            setPaymentRecordError(null)
                            const currentEngine = engineRef.current
                            let endpoint: string
                            let payload: any
                            if (currentEngine === 'recurly') {
                                endpoint = '/recurly/record-payment'
                                payload = { invoiceId, amountMinor, currency, subscriptionId, instrumentId }
                            } else if (currentEngine === 'chargebee') {
                                endpoint = '/chargebee/record-payment'
                                payload = { invoiceId, amountMinor, currency, subscriptionId, instrumentId }
                            } else {
                                endpoint = '/stripe/record-payment'
                                payload = { invoiceId, instrumentId, customerId, amount: amountMinor, currency, successAt, subscriptionId }
                            }
                            const res = await cloudApi(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            })
                            if (!res.ok) {
                                const txt = await res.text()
                                setPaymentRecordError(`Record PayPal payment failed: ${res.status} ${txt}`)
                                setAuthorizing(false)
                                navigateRef.current('/checkout/failure', { replace: true })
                                return
                            }
                            const data = await res.json()
                            setPaymentRecord({ ...data, engine: currentEngine })
                            setAuthorizing(false)
                            navigateRef.current('/checkout/success', { replace: true })
                        } catch (e: any) {
                            setPaymentRecordError(e?.message || 'Unknown PayPal record-payment error')
                            setAuthorizing(false)
                            navigateRef.current('/checkout/failure', { replace: true })
                        }
                    },
                    onAuthorizeFailed: () => {
                        setPaymentRecordError('PayPal authorization failed')
                        setAuthorizing(false)
                        navigateRef.current('/checkout/failure', { replace: true })
                    },
                },
            })
            paypalButton.mount(`#${PAYPAL_BUTTON_ID}`)
            // Light post-styling: mimic card button (PayPal renders its own iframe/buttons; minimal wrapper styling only)
            setTimeout(() => {
                const wrapper = paypalButtonContainerRef.current
                if (wrapper) {
                    wrapper.className = 'w-full flex justify-end'
                }
            }, 0)
        })
    }, [setPaymentRecord, setPaymentRecordError, paypalButtonMount])

    // STEP 3: One-time SDK initialization. StrictMode may double-call in dev; guard with refs.
    useEffect(() => {
        let cancelled = false
        initOnce(async () => {
            setStatus('loading')
            setError(null)
            try {
                const raw = await fetchInitPayload()
                const client = initSdk(raw)
                clientRef.current = client
                mountCardFormIfNeeded(client)
                mountPaymentButton(client)
                mountPayPalButton(client)
                if (!cancelled) setStatus('ready')
            } catch {
                if (!cancelled) {
                    setError('Initialization failed')
                    setStatus('error')
                }
            }
        })
        return () => { cancelled = true }
    }, [fetchInitPayload, initSdk, mountCardFormIfNeeded, mountPaymentButton, mountPayPalButton, initOnce])

    // If payment state already exists (e.g. page refresh after success), ensure redirect.
    useEffect(() => {
        evaluatePaymentOutcome(navigateRef.current, paymentRecord, paymentRecordError)
    }, [paymentRecord, paymentRecordError])

    return { status, error, mountCardFormRef, mountPaymentButtonRef, mountPayPalButtonRef, executionId, authorizing, cardFormReady }
}
