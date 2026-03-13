"use client";

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../context/SubscriptionProvider';
import { usePaymentRecord } from '../context/PaymentRecordProvider';

import OrderSummary from './OrderSummary'
import { PaymentAndShipping } from './PaymentAndShipping';

import { Payrails } from '@payrails/web-sdk'

const products = [
  {
    id: 1,
    name: 'Deep Groove Plan Subscription',
    href: '#',
    price: '$25.00',
    startDate: 'Start Date: 2025-11-01',
    period: 'Period: Monthly',
  }
]

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { subData, loadingSub, subError } = useSubscription();
  const { paymentRecord, paymentRecordError } = usePaymentRecord();

  useEffect(() => {
    Payrails.preloadCardForm();
    
    if (paymentRecord) {
      navigate('/checkout/success', { replace: true });
    } else if (paymentRecordError) {
      navigate('/checkout/failure', { replace: true });
    }
  }, [paymentRecord, paymentRecordError, navigate]);

  // Wait for subData to be present before rendering payment UI
  if (loadingSub || !subData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-lg font-medium text-gray-700">Preparing subscription...</div>
        {subError && <div className="text-red-600 mt-2">{subError}</div>}
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div aria-hidden="true" className="fixed left-0 hidden h-full w-1/2 bg-white lg:block" />
      <div aria-hidden="true" className="fixed right-0 top-0 hidden h-full w-1/2 bg-gray-900 lg:block" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-x-16 lg:grid-cols-2 lg:px-8 lg:pt-16">
        <h1 className="sr-only">Checkout</h1>

        <OrderSummary products={products} />

        <PaymentAndShipping products={products} holderReference={subData.holderReference} currency={subData.currency || 'USD'} />
      </div>
    </div>
  );
}
