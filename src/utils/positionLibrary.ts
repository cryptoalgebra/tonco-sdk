import JSBI from 'jsbi';
import { asUint256, subIn256 } from './tickLibrary';

const Q128 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128));

export abstract class PositionLibrary {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  // replicates the portions of Position#update required to compute unaccounted fees
  public static getTokensOwed(
    feeGrowthInside0LastX128: JSBI,
    feeGrowthInside1LastX128: JSBI,
    liquidity: JSBI,
    feeGrowthInside0X128: JSBI,
    feeGrowthInside1X128: JSBI
  ) {
    const normalizedFeeGrowthInside0LastX128 = asUint256(
      feeGrowthInside0LastX128
    );
    const normalizedFeeGrowthInside1LastX128 = asUint256(
      feeGrowthInside1LastX128
    );
    const normalizedFeeGrowthInside0X128 = asUint256(feeGrowthInside0X128);
    const normalizedFeeGrowthInside1X128 = asUint256(feeGrowthInside1X128);

    const tokensOwed0 = JSBI.divide(
      JSBI.multiply(
        subIn256(
          normalizedFeeGrowthInside0X128,
          normalizedFeeGrowthInside0LastX128
        ),
        liquidity
      ),
      Q128
    );

    const tokensOwed1 = JSBI.divide(
      JSBI.multiply(
        subIn256(
          normalizedFeeGrowthInside1X128,
          normalizedFeeGrowthInside1LastX128
        ),
        liquidity
      ),
      Q128
    );

    return [tokensOwed0, tokensOwed1];
  }
}
