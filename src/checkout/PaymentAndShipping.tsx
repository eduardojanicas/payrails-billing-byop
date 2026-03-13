"use client"
/**
 * PaymentAndShipping (Getting Started)
 * ---------------------------------------------------------------------------
 * Minimal UI that:
 *  1. Collects basic customer + address data.
 *  2. Lets the user pick a payment method (currently only 'Card' is functional).
 *  3. Derives a total amount (sum of product price strings).
 *  4. Delegates Payrails SDK work to the usePayrailsElements hook.
 *  5. Disables the payment button until form + SDK are both ready.
 *
 * Omissions: robust validation, localization, tax/shipping calculations, accessibility polish.
 */
import React, { useCallback, useMemo, useState } from 'react'

import Spinner from './Spinner'

import EmailField from './EmailField'
import AddressFields from './AddressFields'
import PaymentDetails from './PaymentDetails'
import PaymentButton from './PaymentButton'

import PayPalPaymentContainer from '@/checkout/PayPalPaymentContainer'

import { usePayrailsElements } from '@/hooks/usePayrailsElements'
import type { ProductSummaryItem } from './OrderSummary'

interface PaymentAndShippingProps {
    products: ProductSummaryItem[]
    currency?: string // default USD for demo
    holderReference: string
}

export const PaymentAndShipping: React.FC<PaymentAndShippingProps> = ({ products, currency = 'USD', holderReference }) => {
    // STEP 0: Collect basic customer + address fields (flat state for clarity)
    const [form, setForm] = useState({
        email: '',
        address: '',
        city: '',
        region: '',
        postal: ''
    })
    const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

    // STEP 2: Derive subtotal from product list (demo parsing)
    const subtotal = useMemo(
        () =>
            products.reduce((acc, p) => {
                const n = parseFloat(p.price.replace(/[^0-9.]/g, ''))
                return acc + (isNaN(n) ? 0 : n)
            }, 0),
        [products]
    )

    // Minimal validation: non-empty fields + crude email pattern (ensure boolean result)
    const formValid = useMemo(() => {
        const emailOk = /.+@.+/.test(form.email)
        return !!(emailOk && form.address && form.city && form.region && form.postal)
    }, [form])

    // STEP 3 (indirect): Provide a lazy form snapshot so hook can enrich before authorization
    const customerInfoProvider = useCallback(() => ({
        email: form.email,
        address: form.address,
        city: form.city,
        region: form.region,
        postal: form.postal,
    }), [form.email, form.address, form.city, form.region, form.postal])

    // Billing engine differences handled inside usePayrailsElements onAuthorizeSuccess; UI remains unified.

    const { status, error, mountCardFormRef, mountPaymentButtonRef, mountPayPalButtonRef, authorizing, cardFormReady } = usePayrailsElements({
        amount: subtotal,
        currency,
        holderReference,
        customerInfoProvider,
    })

    // Enable payment only when SDK ready, form valid, and payment method chosen
    const canPay: boolean = formValid

    return (
        <section
            aria-labelledby="payment-and-shipping-heading"
            className="relative py-16 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-lg lg:pt-0 lg:pb-24"
        >
            <h2 id="payment-and-shipping-heading" className="sr-only">
                Payment and shipping details
            </h2>

            {/* Loading spinner shown until card form is ready */}
            {!cardFormReady && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Spinner size="lg" label="Loading payment form…" />
                    <span className="text-sm text-gray-500">Loading payment form…</span>
                </div>
            )}

            <div className={cardFormReady ? '' : 'invisible h-0 overflow-hidden'}>
                <form>
                    <div className="mx-auto max-w-2xl px-4 lg:max-w-none lg:px-0">
                        <PayPalPaymentContainer status={status} error={error} mountRef={mountPayPalButtonRef} />
                        <div className="relative mt-8">
                            <div aria-hidden="true" className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-white px-4 text-sm font-medium text-gray-500">or</span>
                            </div>
                        </div>

                        <EmailField value={form.email} onChange={(v) => update({ email: v })} />

                        <PaymentDetails
                            mountCardFormRef={mountCardFormRef}
                        />

                        <AddressFields
                            value={{ address: form.address, city: form.city, region: form.region, postal: form.postal }}
                            onChange={(patch) => update(patch)}
                        />

                        <PaymentButton canPay={canPay} mountRef={mountPaymentButtonRef} />
                    </div>
                </form>
            </div>

            {authorizing && (
                <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-gray-300/70 backdrop-blur-sm animate-pulse">
                    <div className="text-gray-700 font-medium mb-2">Processing payment...</div>
                    <div className="text-xs text-gray-600">Please wait, do not close the page.</div>
                </div>
            )}
        </section>
    )
}

export default PaymentAndShipping
