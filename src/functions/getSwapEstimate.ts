// @ts-nocheck
import { Address } from '@ton/core';
import { TickMath } from '../utils';
import { TonClient, TonClient4 } from '@ton/ton';
import { PoolContract } from '../contracts';
import { DEX_VERSION } from '../types/DexVersion';

export async function getSwapEstimate(
  // inputJetton: Jetton,
  amountIn: bigint,
  poolAddress: string,
  zeroToOne: boolean,
  client: TonClient | TonClient4,
  DEX_VERSION: DEX_VERSION = DEX_VERSION.v1
): Promise<bigint> {
  const poolV3Contract = client.open(
    new PoolContract[DEX_VERSION](Address.parse(poolAddress))
  );

  // /* pool.jetton0 and pool.jetton1 are always sorted, so jetton0 is always first */
  // const zeroToOne = amountIn.jetton.equals(pool.jetton0);
  // or
  // const zeroToOne = PoolV3Contract.orderJettonId(jetton0RouterWallet, jetton1RouterWallet);
  // or
  // const { jetton0_minter } = await poolV3Contract.getPoolStateAndConfiguration();
  // const zeroToOne = Address.parse(inputJetton.address).equals(Address.parse(jetton0_minter));

  if (zeroToOne) {
    const res = await poolV3Contract.getSwapEstimate(
      zeroToOne,
      amountIn,
      BigInt(TickMath.MIN_SQRT_RATIO.toString()) + BigInt(1)
    );
    return -res.amount1;
  } else {
    const res = await poolV3Contract.getSwapEstimate(
      zeroToOne,
      amountIn,
      BigInt(TickMath.MAX_SQRT_RATIO.toString()) - BigInt(1)
    );
    return -res.amount0;
  }
}
