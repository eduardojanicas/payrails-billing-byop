export type NavigateFn = (href: string, options?: { replace?: boolean }) => void;

/**
 * Central helper for redirecting after payment attempt based on record or error state.
 * Abstracts duplicated logic across hooks/components.
 */
export function redirectAfterPayment(navigate: NavigateFn, opts: { paymentRecord: any; paymentRecordError: any }) {
  const { paymentRecord, paymentRecordError } = opts;
  if (paymentRecord) {
    navigate('/checkout/success', { replace: true });
  } else if (paymentRecordError) {
    navigate('/checkout/failure', { replace: true });
  }
}

/** React hook-style helper (can be called inside effects). */
export function evaluatePaymentOutcome(navigate: NavigateFn, paymentRecord: any, paymentRecordError: any) {
  redirectAfterPayment(navigate, { paymentRecord, paymentRecordError });
}
