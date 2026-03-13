import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AppShell from '@/layouts/AppShell';
import HomePage from '@/page';
import CheckoutPage from '@/checkout/page';
import PaymentSuccessPage from '@/checkout/success/page';
import PaymentFailurePage from '@/checkout/failure/page';
import ProfilePage from '@/profile/page';
import { AuthProvider, useAuthSession } from '@/providers/AuthProvider';

function ProtectedRoute() {
  const { loading, user } = useAuthSession();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-sm text-gray-200">
        Initializing secure session...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/checkout/success" element={<PaymentSuccessPage />} />
              <Route path="/checkout/failure" element={<PaymentFailurePage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
