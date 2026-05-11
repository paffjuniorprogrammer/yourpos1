/**
 * Formats a number as a currency string with specific decimal and thousands separators.
 * Uses dot (.) for thousands and comma (,) for decimals to avoid confusion in POS systems.
 */
export const formatCurrency = (amount: number): string => {
  const value = typeof amount === 'number' ? amount : Number(amount) || 0;
  
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' RWF';
};

/**
 * Simplified format for cases where decimals are not needed (common in RWF).
 */
export const formatCurrencyCompact = (amount: number): string => {
  const value = typeof amount === 'number' ? amount : Number(amount) || 0;
  
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' RWF';
};
