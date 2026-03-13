"use client";
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionProvider';
import { usePaymentRecord } from '../../context/PaymentRecordProvider';

export default function PaymentFailurePage() {
  const navigate = useNavigate();
  const { subData } = useSubscription();
  const { paymentRecordError, paymentRecord } = usePaymentRecord();

  // Guard: if navigated here but we have a paymentRecord (success) redirect to success; if no error or success, go back to checkout.
  useEffect(() => {
    if (paymentRecord) {
      navigate('/checkout/success', { replace: true });
    } else if (!paymentRecordError) {
      navigate('/checkout', { replace: true });
    }
  }, [paymentRecord, paymentRecordError, navigate]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        {paymentRecordError && (
          <div className="space-y-6">
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <p className="font-semibold">Payment failed</p>
              <p className="mt-1 break-words">{paymentRecordError}</p>
              <p className="mt-2">Return to <Link to="/checkout" className="text-indigo-600 hover:underline">checkout</Link> to try again.</p>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subscription (Context)</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {subData?.currency && <div className="flex"><dt className="text-gray-600 mr-2">Currency:</dt><dd className="text-indigo-600 font-medium break-words">{subData.currency}</dd></div>}
                  {subData?.holderReference && <div className="flex"><dt className="text-gray-600 mr-2">Holder:</dt><dd className="font-mono text-indigo-600 break-all">{subData.holderReference}</dd></div>}
                  {subData?.invoiceId && <div className="flex"><dt className="text-gray-600 mr-2">Invoice:</dt><dd className="font-mono text-indigo-600 break-all">{subData.invoiceId}</dd></div>}
                  {subData?.customerId && <div className="flex"><dt className="text-gray-600 mr-2">Customer:</dt><dd className="font-mono text-indigo-600 break-all">{subData.customerId}</dd></div>}
                  {subData?.subscriptionId && <div className="flex"><dt className="text-gray-600 mr-2">Subscription:</dt><dd className="font-mono text-indigo-600 break-all">{subData.subscriptionId}</dd></div>}
                </dl>
              </div>
            </div>
            <div className="flex gap-3">
              <Link to="/checkout" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">Retry Checkout</Link>
              <Link to="/profile" className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300">Profile</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
