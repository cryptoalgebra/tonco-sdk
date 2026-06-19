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
  PoolContract as PoolV1_6_Contract,
  RouterContract as RouterV1_6_Contract,
  PositionNFTContract as PositionNFTV1_6_Contract,
  PoolFactoryContract as PoolFactoryV1_6_Contract,
  ContractOpcodes as ContractOpcodesV1_6,
  AccountContract as AccountV1_6_Contract,
} from './v1.6';

export const RouterContract = {
  [DEX_VERSION.v1]: RouterV1Contract,
  [DEX_VERSION.v1_6]: RouterV1_6_Contract,
};

export const PoolContract = {
  [DEX_VERSION.v1]: PoolV1Contract,
  [DEX_VERSION.v1_6]: PoolV1_6_Contract,
};

export const AccountContract = {
  [DEX_VERSION.v1]: AccountV1Contract,
  [DEX_VERSION.v1_6]: AccountV1_6_Contract,
};

export const PositionNFTContract = {
  [DEX_VERSION.v1]: PositionNFTV1Contract,
  [DEX_VERSION.v1_6]: PositionNFTV1_6_Contract,
};

export const PoolFactoryContract = {
  [DEX_VERSION.v1]: PoolFactoryV1Contract,
  [DEX_VERSION.v1_6]: PoolFactoryV1_6_Contract,
};

export const ContractOpcodes = {
  [DEX_VERSION.v1]: ContractOpcodesV1,
  [DEX_VERSION.v1_6]: ContractOpcodesV1_6,
};

export * from './common';
export * from './farming';
