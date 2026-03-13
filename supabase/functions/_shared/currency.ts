const CURRENCY_REGEX = /^[A-Za-z]{3}$/;

export function isValidCurrency(code: unknown): code is string {
  return typeof code === 'string' && CURRENCY_REGEX.test(code.trim());
}

export function normalizeCurrency(code: string): string {
  return code.toUpperCase();
}
