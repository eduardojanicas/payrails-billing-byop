"use client"
/**
 * PaymentDetails
 * ---------------------------------------------------------------------------
 * Wraps payment method selection and the dynamic payment containers. Acts as a
 * focused unit for payment UI concerns.
 */
import React from 'react'
import CardPaymentContainer from './CardPaymentContainer'

interface PaymentDetailsProps {
  mountCardFormRef: React.RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)
}

export const PaymentDetails = ({
  mountCardFormRef,
}: PaymentDetailsProps) => {
  return (
    <div className="mt-10">
      {/* STEP 1: Payment details wrapper component */}
      <div className="mt-6 space-y-4">
          <CardPaymentContainer mountRef={mountCardFormRef} />
      </div>
    </div>
  )
}

export default PaymentDetails
