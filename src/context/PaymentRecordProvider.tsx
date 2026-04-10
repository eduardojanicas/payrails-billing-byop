"use client";
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Minimal shape based on usage in checkout page
export interface PaymentRecord {
	id?: string;
	userId?: string;
	paymentRecordId?: string;
	invoiceId?: string;
	paymentMethodId?: string;
	customerId?: string;
	subscriptionId?: string;
	amount?: number; // minor units
	currency?: string;
	successAt?: number | string; // server may return seconds; UI converts
	status?: string; // e.g. 'paid' for Chargebee stub
	engine?: 'stripe' | 'chargebee' | 'recurly';
	[key: string]: any; // allow additional server fields
}

interface PaymentRecordContextValue {
	paymentRecord: PaymentRecord | null;
	paymentRecordError: string | null;
	setPaymentRecord: (record: PaymentRecord | null) => void;
	setPaymentRecordError: (err: string | null) => void;
	resetPaymentRecord: () => void;
}

const PaymentRecordContext = createContext<PaymentRecordContextValue | undefined>(undefined);

export const PaymentRecordProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
		// Keys for session storage
		const RECORD_KEY = 'paymentRecord';
		const RECORD_ERR_KEY = 'paymentRecordError';

		// Lazy initialization to avoid synchronous setState inside an effect (ESLint warning)
		const [paymentRecord, internalSetPaymentRecord] = useState<PaymentRecord | null>(() => {
			try {
				const raw = typeof window !== 'undefined' ? sessionStorage.getItem(RECORD_KEY) : null;
				if (!raw) return null;
				const parsed: PaymentRecord = JSON.parse(raw);
				return parsed || null;
			} catch { return null; }
		});
		const [paymentRecordError, internalSetPaymentRecordError] = useState<string | null>(() => {
			try {
				return typeof window !== 'undefined' ? sessionStorage.getItem(RECORD_ERR_KEY) : null;
			} catch { return null; }
		});

		const setPaymentRecord = useCallback((record: PaymentRecord | null) => {
			internalSetPaymentRecord(record);
		}, []);

		const setPaymentRecordError = useCallback((err: string | null) => {
			internalSetPaymentRecordError(err);
		}, []);

		const resetPaymentRecord = useCallback(() => {
			internalSetPaymentRecord(null);
			internalSetPaymentRecordError(null);
			try {
				sessionStorage.removeItem(RECORD_KEY);
				sessionStorage.removeItem(RECORD_ERR_KEY);
			} catch { /* ignore remove errors */ }
		}, []);

		// Persist changes
		useEffect(() => {
			try {
				if (paymentRecord) {
					sessionStorage.setItem(RECORD_KEY, JSON.stringify(paymentRecord));
				} else {
					sessionStorage.removeItem(RECORD_KEY);
				}
			} catch { /* ignore write errors */ }
		}, [paymentRecord]);

		useEffect(() => {
			try {
				if (paymentRecordError) {
					sessionStorage.setItem(RECORD_ERR_KEY, paymentRecordError);
				} else {
					sessionStorage.removeItem(RECORD_ERR_KEY);
				}
			} catch { /* ignore write errors */ }
		}, [paymentRecordError]);

	return (
		<PaymentRecordContext.Provider value={{ paymentRecord, paymentRecordError, setPaymentRecord, setPaymentRecordError, resetPaymentRecord }}>
			{children}
		</PaymentRecordContext.Provider>
	);
};

export function usePaymentRecord() {
	const ctx = useContext(PaymentRecordContext);
	if (!ctx) throw new Error('usePaymentRecord must be used within PaymentRecordProvider');
	return ctx;
}
