import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { ShoppingBagIcon } from '@heroicons/react/24/outline';
import { BillingEngineProvider } from '@/context/BillingEngineProvider';
import { SubscriptionProvider } from '@/context/SubscriptionProvider';
import { PaymentRecordProvider } from '@/context/PaymentRecordProvider';
import GlobalStatus from '@/components/GlobalStatus';
import { isSupabaseConfigured, missingSupabaseEnv } from '@/lib/supabase';

export default function AppShell() {
  return (
    <div className="min-h-screen bg-gray-900">
      {!isSupabaseConfigured && (
        <div className="border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700">
          Frontend env is incomplete. Missing: <code>{missingSupabaseEnv.join(', ')}</code>. Set these in `.env.local` and restart the dev server.
        </div>
      )}

      <header className="relative overflow-visible bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="group flex items-center gap-3" aria-label="Needle & Groove Home">
            <img
              src="/needleandgroove.png"
              alt="Needle & Groove Logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded object-contain"
            />
            <span className="flex flex-col text-sm font-semibold leading-tight sm:text-base">
              <span className="text-gray-100">
                Needle & Groove <span className="text-xs font-normal text-gray-200">Demo</span>
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center">
            <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:space-x-6">
              <Link to="/profile" className="text-sm font-medium text-gray-200 hover:text-gray-400">
                <span>Profile</span>
              </Link>
            </div>
          </div>
          <div className="ml-4 flow-root lg:ml-6">
            <Link to="/checkout" className="group -m-2 flex items-center p-2">
              <ShoppingBagIcon
                aria-hidden="true"
                className="size-6 shrink-0 text-gray-200 group-hover:text-gray-400"
              />
            </Link>
          </div>
        </div>
      </header>

      <BillingEngineProvider>
        <SubscriptionProvider>
          <PaymentRecordProvider>
            <GlobalStatus />
            <main id="main" className="min-h-screen bg-gray-900">
              <Outlet />
            </main>
          </PaymentRecordProvider>
        </SubscriptionProvider>
      </BillingEngineProvider>
    </div>
  );
}
