import JSBI from 'jsbi';
import { BigintIsh } from '../types/BigIntish';
import { Fraction } from './Fraction';
import { Rounding } from '../enums/rounding';

const ONE_HUNDRED = new Fraction(JSBI.BigInt(100));

/**
 * Converts a fraction to a percent
 * @param fraction the fraction to convert
 */
function toPercent(fraction: Fraction): Percent {
  return new Percent(fraction.numerator, fraction.denominator);
}

export class Percent extends Fraction {
  /**
   * This boolean prevents a fraction from being interpreted as a Percent
   */
  public readonly isPercent: true = true;

  public constructor(
    numerator: BigintIsh,
    denominator: BigintIsh = JSBI.BigInt(1)
  ) {
    super(numerator, denominator);
  }

  add(other: Fraction | BigintIsh): Percent {
    return toPercent(super.add(other));
  }

  subtract(other: Fraction | BigintIsh): Percent {
    return toPercent(super.subtract(other));
  }

  multiply(other: Fraction | BigintIsh): Percent {
    return toPercent(super.multiply(other));
  }

  divide(other: Fraction | BigintIsh): Percent {
    return toPercent(super.divide(other));
  }

  public toSignificant(
    significantDigits: number = 5,
    format?: object,
    rounding?: Rounding
  ): string {
    return super
      .multiply(ONE_HUNDRED)
      .toSignificant(significantDigits, format, rounding);
  }

  public toFixed(
    decimalPlaces: number = 2,
    format?: object,
    rounding?: Rounding
  ): string {
    return super.multiply(ONE_HUNDRED).toFixed(decimalPlaces, format, rounding);
  }
}
