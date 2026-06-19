import { Address, Cell, beginCell } from '@ton/core';
import { ROUTER } from '../constants/addresses';
import { ACCOUNT_CODE, POOL_CODE, POSITION_CODE } from '../constants';
import { DEX_VERSION } from '../types/DexVersion';
import { PoolContract } from '../contracts';

/**
 * Computes the address of a liquidity pool based on the router's jetton wallet addresses.
 * @param jetton0Wallet - Address of the first jetton wallet attached to the router
 * @param jetton1Wallet - Address of the second jetton wallet attached to the router
 * @param dexVersion - DEX version (defaults to v1)
 * @param timelockDelay - Optional timelock delay for v1.6+ (defaults to 24 hours)
 * @returns The computed pool address
 */
export function computePoolAddress(
  jetton0Wallet: Address,
  jetton1Wallet: Address,
  dexVersion: DEX_VERSION = DEX_VERSION.v1,
  timelockDelay: bigint = 24n * 60n * 60n
): Address {
  const routerAddress = Address.parse(ROUTER[dexVersion]);

  const poolData = packPoolData(
    jetton0Wallet,
    jetton1Wallet,
    routerAddress,
    dexVersion,
    timelockDelay
  );

  const stateInit = beginCell()
    .storeUint(0, 2)
    .storeMaybeRef(POOL_CODE[dexVersion])
    .storeMaybeRef(poolData)
    .storeUint(0, 1)
    .endCell();

  return new Address(routerAddress.workChain, stateInit.hash());
}

export function packPoolData(
  jetton0Wallet: Address,
  jetton1Wallet: Address,
  routerAddress: Address,
  dexVersion: DEX_VERSION,
  timelockDelay: bigint
): Cell {
  if (dexVersion === DEX_VERSION.v1) {
    const config = PoolContract[DEX_VERSION.v1].poolStateInitConfig(
      jetton0Wallet,
      jetton1Wallet,
      ACCOUNT_CODE[dexVersion],
      POSITION_CODE[dexVersion],
      routerAddress
    );
    return PoolContract[DEX_VERSION.v1].poolContractConfigToCell(config);
  }

  const config = PoolContract[DEX_VERSION.v1_6].poolStateInitConfig(
    jetton0Wallet,
    jetton1Wallet,
    routerAddress,
    timelockDelay
  );

  return PoolContract[DEX_VERSION.v1_6].poolContractConfigToCell(config);
}
