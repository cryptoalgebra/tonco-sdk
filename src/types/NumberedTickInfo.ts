import { DictionaryValue } from '@ton/core';

export type TickInfoWrapper = {
  liquidityGross: bigint;
  liquidityNet: bigint;
  outerFeeGrowth0Token: bigint;
  outerFeeGrowth1Token: bigint;
};

export type NumberedTickInfo = TickInfoWrapper & { tickNum: number };

export const DictionaryTickInfo: DictionaryValue<TickInfoWrapper> = {
  serialize(src, builder) {
    builder.storeUint(src.liquidityGross, 256);
    builder.storeInt(src.liquidityNet, 128);
    builder.storeInt(src.outerFeeGrowth0Token, 256);
    builder.storeInt(src.outerFeeGrowth1Token, 256);
  },
  parse(src) {
    let tickInfo = {
      liquidityGross: src.loadUintBig(256),
      liquidityNet: src.loadIntBig(128),
      outerFeeGrowth0Token: src.loadIntBig(256),
      outerFeeGrowth1Token: src.loadIntBig(256),
    };
    return tickInfo;
  },
};
