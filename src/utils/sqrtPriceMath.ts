import { MaxUint160, MaxUint256, Q96 } from '../constants';

function multiplyIn256(x: bigint, y: bigint): bigint {
  return (x * y) & BigInt(MaxUint256.toString());
}

function addIn256(x: bigint, y: bigint): bigint {
  return (x + y) & BigInt(MaxUint256.toString());
}

export function mulDivRoundingUp(
  a: bigint,
  b: bigint,
  denominator: bigint
): bigint {
  const product = a * b;
  let result = product / denominator;
  if (product % denominator != BigInt(0)) {
    result += BigInt(1);
  }
  return result;
}

export abstract class SqrtPriceMath {
  /**
   * Cannot be constructed.
   */

  public static getAmount0Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    const numerator1 = liquidity << BigInt(96);
    const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

    return roundUp
      ? mulDivRoundingUp(
          mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96),
          BigInt(1),
          sqrtRatioAX96
        )
      : (numerator1 * numerator2) / sqrtRatioBX96 / sqrtRatioAX96;
  }

  public static getAmount1Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean
  ): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return roundUp
      ? mulDivRoundingUp(
          liquidity,
          sqrtRatioBX96 - sqrtRatioAX96,
          BigInt(Q96.toString())
        )
      : (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / BigInt(Q96.toString());
  }

  public static getNextSqrtPriceFromInput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountIn: bigint,
    zeroForOne: boolean
  ): bigint {
    // invariant(JSBI.greaterThan(sqrtPX96, ZERO));
    // invariant(JSBI.greaterThan(liquidity, ZERO));

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount0RoundingUp(
          sqrtPX96,
          liquidity,
          amountIn,
          true
        )
      : this.getNextSqrtPriceFromAmount1RoundingDown(
          sqrtPX96,
          liquidity,
          amountIn,
          true
        );
  }

  public static getNextSqrtPriceFromOutput(
    sqrtPX96: bigint,
    liquidity: bigint,
    amountOut: bigint,
    zeroForOne: boolean
  ): bigint {
    // invariant(JSBI.greaterThan(sqrtPX96, ZERO));
    // invariant(JSBI.greaterThan(liquidity, ZERO));

    return zeroForOne
      ? this.getNextSqrtPriceFromAmount1RoundingDown(
          sqrtPX96,
          liquidity,
          amountOut,
          false
        )
      : this.getNextSqrtPriceFromAmount0RoundingUp(
          sqrtPX96,
          liquidity,
          amountOut,
          false
        );
  }

  public static getNextSqrtPriceFromAmount0RoundingUp(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
  ): bigint {
    if (amount == BigInt(0)) {
      return sqrtPX96;
    }

    const numerator1 = liquidity << BigInt(96);

    if (add) {
      const product = multiplyIn256(amount, sqrtPX96);
      if (product / amount == sqrtPX96) {
        const denominator = addIn256(numerator1, product);
        if (denominator >= numerator1) {
          return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
        }
      }

      return mulDivRoundingUp(
        numerator1,
        BigInt(1),
        numerator1 / sqrtPX96 + amount
      );
    } else {
      const product = multiplyIn256(amount, sqrtPX96);

      // invariant(JSBI.equal(JSBI.divide(product, amount), sqrtPX96));
      // invariant(JSBI.greaterThan(numerator1, product));
      const denominator = numerator1 - product;
      return mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
  }

  private static getNextSqrtPriceFromAmount1RoundingDown(
    sqrtPX96: bigint,
    liquidity: bigint,
    amount: bigint,
    add: boolean
  ): bigint {
    if (add) {
      const quotient =
        amount <= BigInt(MaxUint160.toString())
          ? (amount << BigInt(96)) / liquidity
          : (amount * BigInt(Q96.toString())) / liquidity;

      return sqrtPX96 + quotient;
    } else {
      const quotient = mulDivRoundingUp(
        amount,
        BigInt(Q96.toString()),
        liquidity
      );

      //invariant(JSBI.greaterThan(sqrtPX96, quotient));
      return sqrtPX96 - quotient;
    }
  }
}
