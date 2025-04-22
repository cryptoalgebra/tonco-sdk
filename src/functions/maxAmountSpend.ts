import { Address } from '@ton/core';
import JSBI from 'jsbi';
import { JettonAmount } from '../entities/JettonAmount';
import { Jetton } from '../entities/Jetton';
import { pTON_MINTER } from '../constants/addresses';
import { RouterVersion } from '../types/RouterVersion';

const MIN_NATIVE_CURRENCY_FOR_GAS: JSBI = JSBI.multiply(
  JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(7)),
  JSBI.BigInt(61)
); // 0.61 TON

/**
 * Given some token amount, return the max that can be spent of it
 * @param currencyAmount to return max of
 */
export function maxAmountSpend(
  currencyAmount?: JettonAmount<Jetton>
): JettonAmount<Jetton> | undefined {
  if (!currencyAmount) return undefined;

  const isNative =
    Address.parse(currencyAmount.jetton.address).equals(
      Address.parse(pTON_MINTER[RouterVersion.v1])
    ) ||
    Address.parse(currencyAmount.jetton.address).equals(
      Address.parse(pTON_MINTER[RouterVersion.v2])
    );

  if (isNative) {
    if (
      JSBI.greaterThan(currencyAmount.quotient, MIN_NATIVE_CURRENCY_FOR_GAS)
    ) {
      return JettonAmount.fromRawAmount(
        currencyAmount.jetton,
        JSBI.subtract(currencyAmount.quotient, MIN_NATIVE_CURRENCY_FOR_GAS)
      );
    }
    return JettonAmount.fromRawAmount(currencyAmount.jetton, JSBI.BigInt(0));
  }
  return currencyAmount;
}
