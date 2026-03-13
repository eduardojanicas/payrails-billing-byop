"use client";
import { useState } from 'react';
import { useSubscription } from '../context/SubscriptionProvider';
import { createLogger } from '@/utils/logger';
import { usePayrailsDropin } from '@/hooks/usePayrailsDropin';
import { resolvePreferredInstrument } from '@/utils/resolveInstrument';

interface AddInstrumentDropinProps {
  onAdded: (instrumentId: string | null) => void;
  buttonClassName?: string;
}

export default function AddInstrumentDropin({ onAdded, buttonClassName }: AddInstrumentDropinProps) {
  const { subData } = useSubscription();
  const [open, setOpen] = useState(false);

  const { status, error, mount } = usePayrailsDropin({
    amount: 0, // zero amount for instrument storage
    currency: subData?.currency || 'USD',
    holderReference: subData?.holderReference,
    invoiceId: subData?.invoiceId,
    enabled: !!subData?.holderReference && open,
    visible: !!subData?.holderReference && open,
    dropinConfig: {
      paymentMethodsConfiguration: {
        cards: { alwaysStoreInstrument: true }
      },
      events: {
        onAuthorizeSuccess: async (wf: any) => {
          let newInstrumentId: string | null = null;
          // Attempt resolution with retries for eventual consistency
          if (subData?.holderReference) {
            newInstrumentId = await resolvePreferredInstrument(subData.holderReference, { attempts: 5 });
          }
          if (!newInstrumentId) {
            newInstrumentId = wf?.paymentInstrument?.id || wf?.paymentInstrumentId || null;
          }
          onAdded(newInstrumentId);
          setTimeout(() => { setOpen(false); }, 400);
        }
      }
    },
    onError: (e) => createLogger({ route: 'app/profile/AddInstrumentDropin' }).warn('Add instrument error', e)
  });

  return (
    <div className="space-y-2 w-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={buttonClassName || "text-xs border rounded px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"}
        disabled={!subData?.holderReference}
      >{open ? 'Cancel' : 'Add Instrument'}</button>
      {open && (
        <div className="border rounded p-3 space-y-2 w-full">
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div ref={(el) => mount(el)} className="min-h-[180px] w-full" />
          {status === 'loading' && <div className="text-[10px] text-blue-600">Initializing...</div>}
        </div>
      )}
    </div>
  );
}
