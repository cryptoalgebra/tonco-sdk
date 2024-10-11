export function parseUnits(amount: number | string, decimals: number): bigint {
  const amountNum = Number(amount);
  if (isNaN(amountNum)) return BigInt(0);

  return BigInt(Math.round(amountNum * 10 ** decimals));
}
