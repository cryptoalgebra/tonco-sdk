import { Address, Cell, beginCell } from '@ton/core';
import {
  PoolV3Contract,
  PoolV3ContractConfig,
  poolv3ContractConfigToCell,
} from '../contracts/PoolV3Contract';
import { ROUTER } from '../constants/addresses';
import {
  ACCOUNTV3_CODE,
  POOLV3_CODE,
  POSITIONV3_CODE,
} from '../constants/code';

export function packPoolData(
  jetton0Wallet: Address,
  jetton1Wallet: Address,
  accountV3Code: Cell,
  positionNftV3Code: Cell,
  routerAddress: Address
): Cell {
  const config = {
    router_address: routerAddress,

    jetton0_wallet: jetton0Wallet,
    jetton1_wallet: jetton1Wallet,

    accountv3_code: accountV3Code,
    position_nftv3_code: positionNftV3Code,
  };
  return poolv3ContractConfigToCell(config as PoolV3ContractConfig);
}

export function calculatePoolStateInit(
  jetton0Address: Address,
  jetton1Address: Address,
  poolCode: Cell,
  accountV3Code: Cell,
  positionNftV3Code: Cell,
  routerAddress: Address
): Cell {
  let poolData: Cell;
  if (PoolV3Contract.orderJettonId(jetton0Address, jetton1Address)) {
    poolData = packPoolData(
      jetton0Address,
      jetton1Address,
      accountV3Code,
      positionNftV3Code,
      routerAddress
    );
  } else {
    poolData = packPoolData(
      jetton1Address,
      jetton0Address,
      accountV3Code,
      positionNftV3Code,
      routerAddress
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
  jettonWallet1: Address
): Address {
  const routerAddress = Address.parse(ROUTER);

  const stateInit = calculatePoolStateInit(
    jettonWallet0,
    jettonWallet1,
    POOLV3_CODE,
    ACCOUNTV3_CODE,
    POSITIONV3_CODE,
    routerAddress
  );
  return calculateAddress(stateInit, routerAddress.workChain);
}
