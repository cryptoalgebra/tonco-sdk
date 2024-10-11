// @ts-expect-error
import _Big from 'big.js';
// @ts-expect-error
import toFormat from 'toformat';

import JSBI from 'jsbi';
import invariant from 'tiny-invariant';
import { MaxUint256 } from '../constants/internalConstants';
import { Rounding } from '../enums/rounding';
import { Jetton } from './Jetton';
import { BigintIsh } from '../types/BigIntish';
import { Fraction } from './Fraction';

const Big = toFormat(_Big);

export class JettonAmount<T extends Jetton> extends Fraction {
  public readonly jetton: T;

  public readonly decimalScale: JSBI;

  /**
   * Returns a new currency amount instance from the unitless amount of token, i.e. the raw amount
   * @param currency the currency in the amount
   * @param rawAmount the raw token or ether amount
   */
  public static fromRawAmount<T extends Jetton>(
    currency: T,
    rawAmount: BigintIsh
  ): JettonAmount<T> {
    return new JettonAmount(currency, rawAmount);
  }

  /**
   * Construct a currency amount with a denominator that is not equal to 1
   * @param currency the currency
   * @param numerator the numerator of the fractional token amount
   * @param denominator the denominator of the fractional token amount
   */
  public static fromFractionalAmount<T extends Jetton>(
    currency: T,
    numerator: BigintIsh,
    denominator: BigintIsh
  ): JettonAmount<T> {
    return new JettonAmount(currency, numerator, denominator);
  }

  protected constructor(
    jetton: T,
    numerator: BigintIsh,
    denominator?: BigintIsh
  ) {
    super(numerator, denominator);
    invariant(JSBI.lessThanOrEqual(this.quotient, MaxUint256), 'AMOUNT');
    this.jetton = jetton;
    this.decimalScale = JSBI.exponentiate(
      JSBI.BigInt(10),
      JSBI.BigInt(jetton.decimals)
    );
  }

  public add(other: JettonAmount<T>): JettonAmount<T> {
    invariant(this.jetton.equals(other.jetton), 'CURRENCY');
    const added = super.add(other);
    return JettonAmount.fromFractionalAmount(
      this.jetton,
      added.numerator,
      added.denominator
    );
  }

  public subtract(other: JettonAmount<T>): JettonAmount<T> {
    invariant(this.jetton.equals(other.jetton), 'CURRENCY');
    const subtracted = super.subtract(other);
    return JettonAmount.fromFractionalAmount(
      this.jetton,
      subtracted.numerator,
      subtracted.denominator
    );
  }

  public multiply(other: Fraction | BigintIsh): JettonAmount<T> {
    const multiplied = super.multiply(other);
    return JettonAmount.fromFractionalAmount(
      this.jetton,
      multiplied.numerator,
      multiplied.denominator
    );
  }

  public divide(other: Fraction | BigintIsh): JettonAmount<T> {
    const divided = super.divide(other);
    return JettonAmount.fromFractionalAmount(
      this.jetton,
      divided.numerator,
      divided.denominator
    );
  }

  public toSignificant(
    significantDigits: number = 6,
    format?: object,
    rounding: Rounding = Rounding.ROUND_DOWN
  ): string {
    return super
      .divide(this.decimalScale)
      .toSignificant(significantDigits, format, rounding);
  }

  public toFixed(
    decimalPlaces: number = this.jetton.decimals,
    format?: object,
    rounding: Rounding = Rounding.ROUND_DOWN
  ): string {
    invariant(decimalPlaces <= this.jetton.decimals, 'DECIMALS');
    return super
      .divide(this.decimalScale)
      .toFixed(decimalPlaces, format, rounding);
  }

  public toExact(format: object = { groupSeparator: '' }): string {
    Big.DP = this.jetton.decimals;
    return new Big(this.quotient.toString())
      .div(this.decimalScale.toString())
      .toFormat(format);
  }

  public get wrapped(): JettonAmount<Jetton> {
    // if (this.jetton.isToken) return this as JettonAmount<Jetton>;
    return JettonAmount.fromFractionalAmount(
      this.jetton,
      this.numerator,
      this.denominator
    );
  }
}
