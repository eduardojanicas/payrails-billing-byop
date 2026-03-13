/**
 * Currency utilities
 * Centralizes validation + normalization to reduce regex duplication across API routes.
 * ISO 4217 alpha codes are 3 letters. We accept case-insensitive input and always output uppercase.
 */

const CURRENCY_REGEX = /^[A-Za-z]{3}$/;

/** Returns true if the provided code matches ISO 4217 3-letter format (case-insensitive). */
export function isValidCurrency(code: unknown): code is string {
  return typeof code === 'string' && CURRENCY_REGEX.test(code.trim());
}

/** Uppercases a currency code without validating it. */
export function normalizeCurrency(code: string): string {
  return code.toUpperCase();
}

/** Validates and returns an uppercased currency or throws with a helpful message. */
export function assertCurrency(code: unknown): string {
  if (!isValidCurrency(code)) {
    throw new Error(`Invalid currency code: ${code}`);
  }
  return normalizeCurrency(code as string);
}

/** Safely normalize if valid; else return fallback (default 'USD'). */
export function safeCurrency(code: unknown, fallback: string = 'USD'): string {
  return isValidCurrency(code) ? normalizeCurrency(code as string) : fallback;
}

export const CURRENCY_UTIL_VERSION = '1.0.0';
