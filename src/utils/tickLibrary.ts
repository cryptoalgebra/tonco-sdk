import JSBI from 'jsbi';
import { ZERO } from '../constants';
import { NumberedTickInfo } from '../types/NumberedTickInfo';

const Q256 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(256));

// TVM getters may expose wrapped int256/int224 accumulators as negative values.
// Fee-growth math expects their canonical unsigned uint256 representation.
export function asUint256(x: JSBI): JSBI {
  return JSBI.remainder(JSBI.add(JSBI.remainder(x, Q256), Q256), Q256);
}

export function subIn256(x: JSBI, y: JSBI): JSBI {
  const difference = JSBI.subtract(x, y);

  if (JSBI.lessThan(difference, ZERO)) {
    return JSBI.add(Q256, difference);
  }
  return difference;
}

export abstract class TickLibrary {
  /**
   * Cannot be constructed.
   */
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  private constructor() {}

  public static getFeeGrowthInside(
    tickLower: number,
    tickUpper: number,
    tickCurrent: number,
    feeGrowthGlobal0X128: JSBI,
    feeGrowthGlobal1X128: JSBI,
    tickList: NumberedTickInfo[]
  ) {
    const normalizedFeeGrowthGlobal0X128 = asUint256(feeGrowthGlobal0X128);
    const normalizedFeeGrowthGlobal1X128 = asUint256(feeGrowthGlobal1X128);

    const tickLowerInfo = tickList.find(t => t.tickNum === tickLower);
    const lowOuterFeeGrowth0Token = asUint256(
      JSBI.BigInt(tickLowerInfo?.outerFeeGrowth0Token?.toString() ?? 0)
    );
    const lowOuterFeeGrowth1Token = asUint256(
      JSBI.BigInt(tickLowerInfo?.outerFeeGrowth1Token?.toString() ?? 0)
    );

    const tickUpperInfo = tickList.find(t => t.tickNum === tickUpper);
    const highOuterFeeGrowth0Token = asUint256(
      JSBI.BigInt(tickUpperInfo?.outerFeeGrowth0Token?.toString() ?? 0)
    );
    const highOuterFeeGrowth1Token = asUint256(
      JSBI.BigInt(tickUpperInfo?.outerFeeGrowth1Token?.toString() ?? 0)
    );

    let feeGrowthBelow0X128: JSBI;
    let feeGrowthBelow1X128: JSBI;

    if (tickCurrent >= tickLower) {
      feeGrowthBelow0X128 = lowOuterFeeGrowth0Token;
      feeGrowthBelow1X128 = lowOuterFeeGrowth1Token;
    } else {
      feeGrowthBelow0X128 = subIn256(
        normalizedFeeGrowthGlobal0X128,
        lowOuterFeeGrowth0Token
      );
      feeGrowthBelow1X128 = subIn256(
        normalizedFeeGrowthGlobal1X128,
        lowOuterFeeGrowth1Token
      );
    }

    let feeGrowthAbove0X128: JSBI;
    let feeGrowthAbove1X128: JSBI;

    if (tickCurrent < tickUpper) {
      feeGrowthAbove0X128 = highOuterFeeGrowth0Token;
      feeGrowthAbove1X128 = highOuterFeeGrowth1Token;
    } else {
      feeGrowthAbove0X128 = subIn256(
        normalizedFeeGrowthGlobal0X128,
        highOuterFeeGrowth0Token
      );
      feeGrowthAbove1X128 = subIn256(
        normalizedFeeGrowthGlobal1X128,
        highOuterFeeGrowth1Token
      );
    }

    return [
      subIn256(
        subIn256(normalizedFeeGrowthGlobal0X128, feeGrowthBelow0X128),
        feeGrowthAbove0X128
      ),
      subIn256(
        subIn256(normalizedFeeGrowthGlobal1X128, feeGrowthBelow1X128),
        feeGrowthAbove1X128
      ),
    ];
  }
}
