import { DEX_VERSION } from '../types/DexVersion';
import {
  PoolContract as PoolV1Contract,
  RouterContract as RouterV1Contract,
  AccountContract as AccountV1Contract,
  PositionNFTContract as PositionNFTV1Contract,
  PoolFactoryContract as PoolFactoryV1Contract,
  ContractOpcodes as ContractOpcodesV1,
} from './v1';
import {
  PoolContract as PoolV1_5_Contract,
  RouterContract as RouterV1_5_Contract,
  PositionNFTContract as PositionNFTV1_5_Contract,
  PoolFactoryContract as PoolFactoryV1_5_Contract,
  ContractOpcodes as ContractOpcodesV1_5,
} from './v1.5';

export const RouterContract = {
  [DEX_VERSION.v1]: RouterV1Contract,
  [DEX_VERSION.v1_5]: RouterV1_5_Contract,
};

export const PoolContract = {
  [DEX_VERSION.v1]: PoolV1Contract,
  [DEX_VERSION.v1_5]: PoolV1_5_Contract,
};

export const AccountContract = {
  [DEX_VERSION.v1]: AccountV1Contract,
  [DEX_VERSION.v1_5]: AccountV1Contract, // same
};

export const PositionNFTContract = {
  [DEX_VERSION.v1]: PositionNFTV1Contract,
  [DEX_VERSION.v1_5]: PositionNFTV1_5_Contract,
};

export const PoolFactoryContract = {
  [DEX_VERSION.v1]: PoolFactoryV1Contract,
  [DEX_VERSION.v1_5]: PoolFactoryV1_5_Contract,
};

export const ContractOpcodes = {
  [DEX_VERSION.v1]: ContractOpcodesV1,
  [DEX_VERSION.v1_5]: ContractOpcodesV1_5,
};

export * from './common';
export * from './farming';
