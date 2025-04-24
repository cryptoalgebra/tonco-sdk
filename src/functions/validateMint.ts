import { NumberedTickInfo } from '../types/NumberedTickInfo';

export function validateMint(
  mintRequest: {
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
  },
  contractState: {
    tick: number;
    feeGrowthGlobal0X128: bigint;
    feeGrowthGlobal1X128: bigint;
    ticks: NumberedTickInfo[];
  }
): boolean {
  const lower = contractState.ticks.find(
    x => x.tickNum === mintRequest.tickLower
  ) ?? {
    tickNum: mintRequest.tickLower,
    liquidityGross: BigInt(0),
    liquidityNet: BigInt(0),
    outerFeeGrowth0Token: BigInt(0),
    outerFeeGrowth1Token: BigInt(0),
  };
  const upper = contractState.ticks.find(
    x => x.tickNum === mintRequest.tickUpper
  ) ?? {
    tickNum: mintRequest.tickLower,
    liquidityGross: BigInt(0),
    liquidityNet: BigInt(0),
    outerFeeGrowth0Token: BigInt(0),
    outerFeeGrowth1Token: BigInt(0),
  };
  let feeGrowthBelow0X128: bigint;
  let feeGrowthBelow1X128: bigint;

  if (contractState.tick >= mintRequest.tickLower) {
    feeGrowthBelow0X128 = lower.outerFeeGrowth0Token!;
    feeGrowthBelow1X128 = lower.outerFeeGrowth1Token!;
  } else {
    feeGrowthBelow0X128 =
      contractState.feeGrowthGlobal0X128 - lower.outerFeeGrowth0Token!;
    feeGrowthBelow1X128 =
      contractState.feeGrowthGlobal1X128 - lower.outerFeeGrowth1Token!;
  }

  let feeGrowthAbove0X128: bigint;
  let feeGrowthAbove1X128: bigint;

  if (contractState.tick < mintRequest.tickUpper) {
    feeGrowthAbove0X128 = upper.outerFeeGrowth0Token!;
    feeGrowthAbove1X128 = upper.outerFeeGrowth1Token!;
  } else {
    feeGrowthAbove0X128 =
      contractState.feeGrowthGlobal0X128 - upper.outerFeeGrowth0Token!;
    feeGrowthAbove1X128 =
      contractState.feeGrowthGlobal1X128 - upper.outerFeeGrowth1Token!;
  }

  const feeGrowthInside0X128 =
    contractState.feeGrowthGlobal0X128 -
    feeGrowthBelow0X128 -
    feeGrowthAbove0X128;
  const feeGrowthInside1X128 =
    contractState.feeGrowthGlobal1X128 -
    feeGrowthBelow1X128 -
    feeGrowthAbove1X128;

  return feeGrowthInside0X128 >= 0 && feeGrowthInside1X128 >= 0;
}
