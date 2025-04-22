import JSBI from 'jsbi';
import { NumberedTickInfo } from '../contracts/v1/index';
import { ZERO } from '../constants';

const Q256 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(256));

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
    const tickLowerInfo = tickList.find(t => t.tickNum === tickLower);
    const lowOuterFeeGrowth0Token = JSBI.BigInt(
      tickLowerInfo?.outerFeeGrowth0Token?.toString() ?? 0
    );
    const lowOuterFeeGrowth1Token = JSBI.BigInt(
      tickLowerInfo?.outerFeeGrowth1Token?.toString() ?? 0
    );

    const tickUpperInfo = tickList.find(t => t.tickNum === tickUpper);
    const highOuterFeeGrowth0Token = JSBI.BigInt(
      tickUpperInfo?.outerFeeGrowth0Token?.toString() ?? 0
    );
    const highOuterFeeGrowth1Token = JSBI.BigInt(
      tickUpperInfo?.outerFeeGrowth1Token?.toString() ?? 0
    );

    let feeGrowthBelow0X128: JSBI;
    let feeGrowthBelow1X128: JSBI;

    if (tickCurrent >= tickLower) {
      feeGrowthBelow0X128 = lowOuterFeeGrowth0Token;
      feeGrowthBelow1X128 = lowOuterFeeGrowth1Token;
    } else {
      feeGrowthBelow0X128 = subIn256(
        feeGrowthGlobal0X128,
        lowOuterFeeGrowth0Token
      );
      feeGrowthBelow1X128 = subIn256(
        feeGrowthGlobal1X128,
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
        feeGrowthGlobal0X128,
        highOuterFeeGrowth0Token
      );
      feeGrowthAbove1X128 = subIn256(
        feeGrowthGlobal1X128,
        highOuterFeeGrowth1Token
      );
    }

    return [
      subIn256(
        subIn256(feeGrowthGlobal0X128, feeGrowthBelow0X128),
        feeGrowthAbove0X128
      ),
      subIn256(
        subIn256(feeGrowthGlobal1X128, feeGrowthBelow1X128),
        feeGrowthAbove1X128
      ),
    ];
  }
}
