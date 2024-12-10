import { SqrtPriceMath } from './';
import JSBI from 'jsbi';

export function mulDivRoundingUp(
  a: bigint,
  b: bigint,
  denominator: bigint
): bigint {
  const product = a * b;
  let result = product / denominator;
  if (product % denominator !== 0n) {
    result += 1n;
  }
  return result;
}

export abstract class SwapMath {
  static FEE_DENOMINATOR: bigint = 10000n;

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static computeSwapStep(
    sqrtRatioCurrentX96: JSBI,
    sqrtRatioTargetX96: JSBI,
    liquidity: JSBI,
    amountRemaining: JSBI,
    feePips: number // Fee computions is done our way in 1/10^4 parts, not like in uniswap were they use 1/10^6 scaler
  ) {
    let sqrtRatioNextX96: bigint = 0n;
    let amountIn: bigint = 0n;
    let amountOut: bigint = 0n;
    let feeAmount: bigint = 0n;

    const amountRemainingBn = BigInt(amountRemaining.toString());

    const zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;
    const exactIn = amountRemainingBn >= 0n;

    if (exactIn) {
      const amountRemainingLessFee =
        (amountRemainingBn * (this.FEE_DENOMINATOR - BigInt(feePips))) /
        this.FEE_DENOMINATOR;

      if (zeroForOne) {
        amountIn = BigInt(
          SqrtPriceMath.getAmount0Delta(
            sqrtRatioTargetX96,
            sqrtRatioCurrentX96,
            liquidity,
            true
          ).toString()
        );
      } else {
        amountIn = BigInt(
          SqrtPriceMath.getAmount1Delta(
            sqrtRatioCurrentX96,
            sqrtRatioTargetX96,
            liquidity,
            true
          ).toString()
        );
      }

      if (amountRemainingLessFee >= amountIn) {
        sqrtRatioNextX96 = BigInt(sqrtRatioTargetX96.toString());
      } else {
        sqrtRatioNextX96 = BigInt(
          SqrtPriceMath.getNextSqrtPriceFromInput(
            sqrtRatioCurrentX96,
            liquidity,
            JSBI.BigInt(amountRemainingLessFee.toString()),
            zeroForOne
          ).toString()
        );
      }
    } else {
      if (zeroForOne) {
        amountOut = BigInt(
          SqrtPriceMath.getAmount1Delta(
            sqrtRatioTargetX96,
            sqrtRatioCurrentX96,
            liquidity,
            false
          ).toString()
        );
      } else {
        amountOut = BigInt(
          SqrtPriceMath.getAmount0Delta(
            sqrtRatioCurrentX96,
            sqrtRatioTargetX96,
            liquidity,
            false
          ).toString()
        );
      }

      if (-amountRemaining >= amountOut) {
        sqrtRatioNextX96 = BigInt(sqrtRatioTargetX96.toString());
      } else {
        sqrtRatioNextX96 = BigInt(
          SqrtPriceMath.getNextSqrtPriceFromOutput(
            sqrtRatioCurrentX96,
            liquidity,
            JSBI.multiply(JSBI.BigInt(-1), amountRemaining),
            zeroForOne
          ).toString()
        );
      }
    }

    const max = BigInt(sqrtRatioTargetX96.toString()) === sqrtRatioNextX96;

    if (zeroForOne) {
      if (max && exactIn) {
        amountIn = amountIn;
      } else {
        amountIn = BigInt(
          SqrtPriceMath.getAmount0Delta(
            JSBI.BigInt(sqrtRatioNextX96.toString()),
            sqrtRatioCurrentX96,
            liquidity,
            true
          ).toString()
        );
      }

      if (max && !exactIn) {
        amountOut = amountOut;
      } else {
        amountOut = BigInt(
          SqrtPriceMath.getAmount1Delta(
            JSBI.BigInt(sqrtRatioNextX96.toString()),
            sqrtRatioCurrentX96,
            liquidity,
            false
          ).toString()
        );
      }
    } else {
      if (max && exactIn) {
        amountIn = amountIn;
      } else {
        amountIn = BigInt(
          SqrtPriceMath.getAmount1Delta(
            sqrtRatioCurrentX96,
            JSBI.BigInt(sqrtRatioNextX96.toString()),
            liquidity,
            true
          ).toString()
        );
      }

      if (max && !exactIn) {
        amountOut = amountOut;
      } else {
        amountOut = BigInt(
          SqrtPriceMath.getAmount0Delta(
            sqrtRatioCurrentX96,
            JSBI.BigInt(sqrtRatioNextX96.toString()),
            liquidity,
            false
          ).toString()
        );
      }
    }

    if (!exactIn && amountOut > -amountRemaining) {
      amountOut = -amountRemainingBn;
    }

    if (exactIn && sqrtRatioNextX96 !== BigInt(sqrtRatioTargetX96.toString())) {
      // we didn't reach the target, so take the remainder of the maximum input as fee
      feeAmount = amountRemainingBn - amountIn;
    } else {
      feeAmount = mulDivRoundingUp(
        amountIn,
        BigInt(feePips),
        SwapMath.FEE_DENOMINATOR - BigInt(feePips)
      );
    }

    const returnValues = {
      sqrtRatioNextX96: JSBI.BigInt(sqrtRatioNextX96.toString()),
      amountIn: JSBI.BigInt(amountIn.toString()),
      amountOut: JSBI.BigInt(amountOut.toString()),
      feeAmount: JSBI.BigInt(feeAmount.toString()),
    };

    return [
      returnValues.sqrtRatioNextX96!,
      returnValues.amountIn!,
      returnValues.amountOut!,
      returnValues.feeAmount!,
    ] as [JSBI, JSBI, JSBI, JSBI];
  }
}
