import { Address, Cell, beginCell } from '@ton/core';
import { ROUTER } from '../constants/addresses';
import { ACCOUNT_CODE, POOL_CODE, POSITION_CODE } from '../constants';
import { RouterVersion } from '../types/RouterVersion';
import { PoolContract, PoolContractConfig } from '../contracts';
import { poolContractConfigToCell } from './poolContractConfigToCell';

export function packPoolData(
  jetton0Wallet: Address,
  jetton1Wallet: Address,
  accountV3Code: Cell,
  positionNftV3Code: Cell,
  routerAddress: Address,
  routerVersion: RouterVersion
): Cell {
  const config = {
    router_address: routerAddress,

    jetton0_wallet: jetton0Wallet,
    jetton1_wallet: jetton1Wallet,

    accountv3_code: accountV3Code,
    position_nftv3_code: positionNftV3Code,
  };
  return poolContractConfigToCell[routerVersion](config);
}

export function calculatePoolStateInit(
  jetton0Address: Address,
  jetton1Address: Address,
  poolCode: Cell,
  accountV3Code: Cell,
  positionNftV3Code: Cell,
  routerAddress: Address,
  routerVersion: RouterVersion
): Cell {
  let poolData: Cell;
  if (
    PoolContract[routerVersion].orderJettonId(jetton0Address, jetton1Address)
  ) {
    poolData = packPoolData(
      jetton0Address,
      jetton1Address,
      accountV3Code,
      positionNftV3Code,
      routerAddress,
      routerVersion
    );
  } else {
    poolData = packPoolData(
      jetton1Address,
      jetton0Address,
      accountV3Code,
      positionNftV3Code,
      routerAddress,
      routerVersion
    );
  }

  return beginCell()
    .storeUint(0, 2)
    .storeMaybeRef(poolCode)
    .storeMaybeRef(poolData)
    .storeUint(0, 1)
    .endCell();
}

function calculateAddress(stateInit: Cell, workchain: number): Address {
  return new Address(workchain, stateInit.hash());
}

export function computePoolAddress(
  jettonWallet0: Address,
  jettonWallet1: Address,
  routerVersion: RouterVersion = RouterVersion.v1
): Address {
  const routerAddress = Address.parse(ROUTER[routerVersion]);
  const stateInit = calculatePoolStateInit(
    jettonWallet0,
    jettonWallet1,
    POOL_CODE[routerVersion],
    ACCOUNT_CODE[routerVersion],
    POSITION_CODE[routerVersion],
    routerAddress,
    routerVersion
  );

  return calculateAddress(stateInit, routerAddress.workChain);
}
