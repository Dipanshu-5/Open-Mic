const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** @param {number} amountInPaise */
export function formatMoney(amountInPaise) {
  if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 0) {
    throw new RangeError('Money must be a non-negative safe integer in paise.');
  }
  return formatter.format(amountInPaise / 100);
}
