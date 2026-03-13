"use client"
/**
 * CardPaymentContainer
 * ---------------------------------------------------------------------------
 * Wraps the Payrails card form element mount target. Stays mounted (hidden when
 * not selected) to avoid remount churn. Shows simple status messaging (no spinner).
 */
import React from 'react'

export type CardContainerStatus = 'idle' | 'loading' | 'ready' | 'error'

type MountRef = React.RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)

interface CardPaymentContainerProps {
  mountRef: MountRef
}

export const CardPaymentContainer: React.FC<CardPaymentContainerProps> = ({ mountRef }) => {
  return (
    <div className="rounded-md border border-gray-300" aria-live="polite">
      {/* Empty inner mount target (library expects a clean container without existing children) */}
      <div id="card-form-container" ref={mountRef} className="" />
    </div>
  )
}

export default CardPaymentContainer
