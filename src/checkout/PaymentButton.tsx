"use client"
/**
 * PaymentButton
 * ---------------------------------------------------------------------------
 * Hosts the Payrails payment button element mount point. Applies disabled styling
 * and aria-disabled when prerequisites (form + SDK readiness) are not met.
 */
import React from 'react'

interface PaymentButtonProps {
  canPay: boolean
  mountRef: React.RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({ canPay, mountRef }) => {
  return (
    <div className="mt-10 flex justify-end border-t border-gray-200 pt-6">
      {/* STEP 1e: Payment button container component */}
      <div
        id="payment-button-container"
        ref={mountRef}
        aria-disabled={!canPay}
        className={
          'w-full flex justify-end relative ' + (!canPay ? 'pointer-events-none opacity-50' : '')
        }
      >
        {/* Payrails payment button element will mount here */}
      </div>
    </div>
  )
}

export default PaymentButton
