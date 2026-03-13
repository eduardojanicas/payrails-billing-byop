"use client";
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionProvider';
import { usePaymentRecord } from '../../context/PaymentRecordProvider';

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const { subData } = useSubscription();
  const { paymentRecord, paymentRecordError } = usePaymentRecord();

  const successAtIso = paymentRecord?.successAt ? (() => {
    const v = paymentRecord.successAt;
    const ts = typeof v === 'number' ? v * 1000 : Date.parse(v);
    return isNaN(ts) ? null : new Date(ts).toISOString();
  })() : null;

  // Guard: if we have an error or no record, redirect appropriately.
  useEffect(() => {
    if (paymentRecordError) {
      navigate('/checkout/failure', { replace: true });
    } else if (!paymentRecord) {
      navigate('/checkout', { replace: true });
    }
  }, [paymentRecord, paymentRecordError, navigate]);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        {paymentRecord && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-indigo-600">Payment successful</h2>
              <p className="text-4xl font-bold tracking-tight text-gray-900">Thanks for ordering</p>
              <p className="text-base text-gray-500">We appreciate your order, we are processing it now and you will receive a confirmation shortly.</p>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subscription</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {subData?.currency && <div className="flex"><dt className="text-gray-600 mr-2">Currency:</dt><dd className="text-indigo-600 font-medium break-words">{subData.currency}</dd></div>}
                  {paymentRecord.paymentMethodId && <div className="flex"><dt className="text-gray-600 mr-2">Method ID:</dt><dd className="font-mono text-indigo-600 break-all">{paymentRecord.paymentMethodId}</dd></div>}
                  {subData?.invoiceId && <div className="flex"><dt className="text-gray-600 mr-2">Invoice:</dt><dd className="font-mono text-indigo-600 break-all">{subData.invoiceId}</dd></div>}
                  {subData?.customerId && <div className="flex"><dt className="text-gray-600 mr-2">Customer:</dt><dd className="font-mono text-indigo-600 break-all">{subData.customerId}</dd></div>}
                  {subData?.subscriptionId && <div className="flex"><dt className="text-gray-600 mr-2">Subscription:</dt><dd className="font-mono text-indigo-600 break-all">{subData.subscriptionId}</dd></div>}
                </dl>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Record</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  {paymentRecord.paymentRecordId && <div className="flex"><dt className="text-gray-600 mr-2">Record ID:</dt><dd className="font-mono text-indigo-600 break-all">{paymentRecord.paymentRecordId}</dd></div>}
                  {subData?.holderReference && <div className="flex"><dt className="text-gray-600 mr-2">Holder:</dt><dd className="font-mono text-indigo-600 break-all">{subData.holderReference}</dd></div>}
                  {(paymentRecord.amount && paymentRecord.currency) && <div className="flex"><dt className="text-gray-600 mr-2">Amount:</dt><dd className="text-indigo-600 font-medium break-words">{(paymentRecord.amount/100).toFixed(2)} {paymentRecord.currency.toUpperCase()}</dd></div>}
                  {successAtIso && <div className="flex"><dt className="text-gray-600 mr-2">Timestamp:</dt><dd className="font-mono text-indigo-600 break-words">{successAtIso}</dd></div>}
                </dl>
              </div>
            </div>
            <div className="flex gap-3">
              <Link to="/checkout" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">Back to Checkout</Link>
              <Link to="/profile" className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300">Profile</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
