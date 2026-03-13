"use client"
/**
 * PayPalPaymentContainer
 * ---------------------------------------------------------------------------
 * Mount target + status messaging for the Payrails `paypalButton` element.
 * Mirrors the card container pattern for consistency. The PayPal SDK renders
 * its own button UI (potentially multiple buttons) inside the provided div.
 */
import React from 'react'

export type PayPalContainerStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PayPalPaymentContainerProps {
  status: PayPalContainerStatus
  error?: string | null
  mountRef: React.RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)
}

const PayPalPaymentContainer: React.FC<PayPalPaymentContainerProps> = ({ mountRef }) => {
  return (
    <div className="" aria-live="polite">
      {/* Empty mount target – Payrails inserts PayPal button iframe(s) here */}
      <div id="paypal-button-container" ref={mountRef} />
    </div>
  )
}

export default PayPalPaymentContainer
