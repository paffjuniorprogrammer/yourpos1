/**
 * Formats a number as a currency string with English-style separators.
 * Uses comma (,) for thousands and dot (.) for decimals.
 */
export const formatCurrency = (amount: number): string => {
  const value = typeof amount === 'number' ? amount : Number(amount) || 0;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' RWF';
};

/**
 * Simplified format for cases where decimals are not needed (standard for RWF).
 */
export const formatCurrencyCompact = (amount: number): string => {
  const value = typeof amount === 'number' ? amount : Number(amount) || 0;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' RWF';
};
