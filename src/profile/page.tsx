"use client";
import { useSubscription } from '../context/SubscriptionProvider';
import { usePaymentRecord } from '../context/PaymentRecordProvider';
import { useBillingEngine } from '../context/BillingEngineProvider';
import { useEffect, useState, useCallback } from 'react';
import AddInstrumentDropin from './AddInstrumentDropin';
import { createLogger } from '@/utils/logger';
import { cloudApi } from '@/api/cloudApi';

export default function ProfilePage() {
  const { subData, loadingSub, subError, refresh, restartDemo } = useSubscription();
  const { resetPaymentRecord } = usePaymentRecord();
  const { engine, setEngine } = useBillingEngine();
  const [instruments, setInstruments] = useState<any[]>([]);
  const [loadingInstruments, setLoadingInstruments] = useState(false);
  const [instrumentsError, setInstrumentsError] = useState<string | null>(null);

  const fetchInstruments = useCallback(async () => {
    if (!subData?.holderReference) return;
    setLoadingInstruments(true);
    setInstrumentsError(null);
    try {
      const resp = await cloudApi(`/payrails/instruments?holderReference=${encodeURIComponent(subData.holderReference)}`);
      if (!resp.ok) {
        const txt = await resp.text();
        setInstrumentsError(`Failed to load instruments: ${resp.status} ${txt}`);
        return;
      }
      const json = await resp.json();
      const list: any[] = json.instruments || [];
      // Normalize & sort newest first
      const normalized = list.map(i => {
        const statusRaw = (i.status || '').toString().toLowerCase();
        const isActive = statusRaw === 'enabled' || statusRaw === 'active' || !!i.active;
        const createdTs = new Date(i.createdAt || i.created_at || 0).getTime();
        return { ...i, _isActive: isActive, _createdTs: createdTs };
      })
        // filter out deleted instruments (status deleted or explicit flag)
        .filter(i => {
          const s = (i.status || '').toString().toLowerCase();
          return s !== 'deleted' && !i.deleted;
        })
        .sort((a, b) => b._createdTs - a._createdTs);
      setInstruments(normalized);
    } catch (e: any) {
      setInstrumentsError(e.message || 'Unknown instruments error');
    } finally {
      setLoadingInstruments(false);
    }
  }, [subData?.holderReference]);

  useEffect(() => {
    if (subData?.holderReference) {
      void fetchInstruments();
    }
  }, [fetchInstruments, subData?.holderReference]);

  // Retry helper to ensure newly added instrument appears (eventual consistency)
  const refreshInstrumentsWithRetry = async (expectedId?: string) => {
    const attempts = expectedId ? 5 : 1;
    for (let i = 1; i <= attempts; i++) {
      await fetchInstruments();
      if (!expectedId) break;
      if (instruments.some(inst => inst.id === expectedId)) break;
      // wait with incremental backoff
      await new Promise(r => setTimeout(r, 250 * i));
    }
  };
  return (
    <div className='bg-white px-25'>
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        {loadingSub && <div className="text-xs text-blue-600">Loading subscription...</div>}
        {subError && <div className="text-xs text-red-600">{subError}</div>}
        {/* Billing engine selection (demo only) */}
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Billing Engine</h2>
          <p className="text-xs text-gray-600">Select whether the demo uses Stripe Billing or Chargebee. Changing this will recreate the subscription context for demo clarity.</p>
          <div className="flex gap-6 items-center">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="billing-engine"
                value="stripe"
                checked={engine === 'stripe'}
                onChange={async () => {
                  setEngine('stripe');
                  resetPaymentRecord();
                  // Allow state update to commit before recreating subscription (avoid stale engine closure)
                  await new Promise(r => setTimeout(r, 0));
                  await restartDemo();
                }}
              />
              Stripe Billing
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="billing-engine"
                value="chargebee"
                checked={engine === 'chargebee'}
                onChange={async () => {
                  setEngine('chargebee');
                  resetPaymentRecord();
                  // microtask delay to ensure SubscriptionProvider re-renders with new engine before restart
                  await new Promise(r => setTimeout(r, 0));
                  await restartDemo();
                }}
              />
              Chargebee
            </label>
          </div>
          <div className="text-[10px] text-gray-500">Current: <code>{engine}</code></div>
        </div>
      </div>
      {/* Settings forms */}
      <div className="divide-y divide-gray-200">
        {subData && (
          <div className="grid max-w-7xl grid-cols-1 gap-x-8 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
            <div className="md:col-span-2">
              <h2 className="text-base/7 font-semibold text-gray-900">Subscription Data Information</h2>
              <p className="mt-1 text-sm/6 text-gray-500">Details about the objects created in Stripe and Payrails.</p>
            </div>

            <div className="md:col-span-2">
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                <div className="col-span-full">
                  <label htmlFor="holder-reference" className="block text-sm/6 font-medium text-gray-900">
                    Holder reference
                  </label>
                  <div className="mt-2">
                    <p className="block w-full rounded-md bg-gray-100 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                      {subData.holderReference}
                    </p>
                  </div>
                </div>

                <div className="col-span-full">
                  <label htmlFor="customer-id" className="block text-sm/6 font-medium text-gray-900">
                    Customer ID
                  </label>
                  <div className="mt-2">
                    <p className="block w-full rounded-md bg-gray-100 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                      {subData.customerId}
                    </p>
                  </div>
                </div>

                <div className="col-span-full">
                  <label htmlFor="subscription-id" className="block text-sm/6 font-medium text-gray-900">
                    Subscription ID
                  </label>
                  <div className="mt-2">
                    <p className="block w-full rounded-md bg-gray-100 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                      {subData.subscriptionId}
                    </p>
                  </div>
                </div>

                <div className="col-span-full">
                  <label htmlFor="invoice-id" className="block text-sm/6 font-medium text-gray-900">
                    Invoice ID
                  </label>
                  <div className="mt-2">
                    <div className="mt-2">
                      <p className="block w-full rounded-md bg-gray-100 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                        {subData.invoiceId}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <h2 className="text-base/7 font-semibold text-gray-900">Manage Instruments</h2>
            <p className="mt-1 text-sm/6 text-gray-500">Update your payment instruments associated with your account.</p>
          </div>

          <div className="md:col-span-2">
            {loadingInstruments && <div className="text-xs text-blue-600">Loading instruments...</div>}
            {instrumentsError && <div className="text-xs text-red-600">{instrumentsError}</div>}
            {!loadingInstruments && !instrumentsError && instruments.length === 0 && (
              <div className="text-xs text-gray-500">No instruments found for holder.</div>
            )}
            {subData && (
              <section className="space-y-2">
                {instruments.length > 0 && (
                  <div className="flex flex-col gap-6 w-full">
                    {instruments.map(inst => (
                      <div key={inst.id} className="rounded-lg bg-gray-100 p-4 flex flex-col gap-2 shadow ring-1 ring-gray-200 w-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-300">{inst.id}</span>
                          </div>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/30"
                            title="Remove instrument"
                            onClick={async () => {
                              if (!confirm('Remove instrument?')) return;
                              try {
                                const resp = await cloudApi(`/payrails/instruments/${encodeURIComponent(inst.id)}`, {
                                  method: 'DELETE'
                                });
                                if (!resp.ok) {
                                  const txt = await resp.text();
                                  alert(`Delete failed: ${resp.status} ${txt}`);
                                } else {
                                  setInstruments(prev => prev.filter(i => i.id !== inst.id));
                                }
                              } catch (e: any) {
                                alert(e.message || 'Instrument delete error');
                              }
                            }}
                          >Remove</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900">{inst.displayName || inst.data?.maskedPan || '(unknown)'}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">{inst.paymentMethod || inst.paymentMethodCode || inst.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={
                            `text-xs px-2 py-0.5 rounded font-semibold ${inst._isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-400'}`
                          }>
                            {inst._isActive ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-xs text-gray-500">{inst.status}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Created: {inst.createdAt ? new Date(inst.createdAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-8 flex">
                  <AddInstrumentDropin
                    buttonClassName="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    onAdded={async (newId) => {
                      // If we have a newly stored instrument, update Stripe custom payment method metadata before refreshing list
                      createLogger({ route: 'app/profile' }).info('[Profile] Added instrument', { newId });
                      createLogger({ route: 'app/profile' }).info('[Profile] Customer ID', { customerId: subData?.customerId });
                      if (newId && subData?.customerId) {
                        try {
                          const resp = await cloudApi('/stripe/payment-method/update-metadata', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              customerId: subData.customerId,
                              subscriptionId: subData.subscriptionId,
                              instrumentId: newId
                            })
                          });
                          if (!resp.ok) {
                            const txt = await resp.text();
                            createLogger({ route: 'app/profile' }).warn('Failed updating Stripe PM metadata', { status: resp.status, body: txt });
                          } else {
                            createLogger({ route: 'app/profile' }).info('[Profile] Updated Stripe payment method metadata with instrument', { newId });
                          }
                        } catch (e) {
                          createLogger({ route: 'app/profile' }).warn('Error updating Stripe PM metadata', e);
                        }
                      }
                      void refreshInstrumentsWithRetry(newId || undefined);
                    }}
                  />
                </div>
              </section>
            )}
              <button
                disabled={loadingInstruments || !subData?.holderReference}
                onClick={() => fetchInstruments()}
                className="mt-4 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >Refresh Instruments</button>
          </div>
        </div>

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <h2 className="text-base/7 font-semibold text-gray-900">Recreate subscription</h2>
            <p className="mt-1 text-sm/6 text-gray-500">
              Create a new subscription for the current demo user.
              This will delete the existing subscription and all related data,
              but keep your instruments intact.
            </p>
          </div>

          <form className="flex items-start md:col-span-2">
            <button
              type="button"
              disabled={loadingSub}
              onClick={() => refresh()}
              className="rounded-md bg-orange-600/70 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800"
            >
              Recreate subscription
            </button>
          </form>
        </div>

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <h2 className="text-base/7 font-semibold text-gray-900">Reset demo</h2>
            <p className="mt-1 text-sm/6 text-gray-500">
              Completely reset the demo account, removing all subscription and instrument data.
            </p>
          </div>

          <form className="flex items-start md:col-span-2">
            <button
              type="button"
              disabled={loadingSub}
              onClick={async () => { resetPaymentRecord(); await restartDemo(); void fetchInstruments(); }}
              className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400"
            >
              Reset my demo
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
