"use client";
import { useSubscription } from '../context/SubscriptionProvider';

export default function GlobalStatus() {
  const { loadingSub, subError, subData } = useSubscription();
  if (!loadingSub && !subError) return null;
  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900 px-4 py-2 flex items-center justify-between">
      <span>
        {loadingSub && 'Initializing subscription & customer...'}
        {subError && !loadingSub && `Subscription error: ${subError}`}
      </span>
      {subData && <span className="text-[10px] text-gray-500">Holder: {subData.holderReference}</span>}
    </div>
  );
}
