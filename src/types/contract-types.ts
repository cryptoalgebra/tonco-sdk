import {
  PoolContract as PoolV1Contract,
  RouterContract as RouterV1Contract,
  AccountContract as AccountV1Contract,
  PositionNFTContract as PositionNFTV1Contract,
  PoolFactoryContract as PoolFactoryV1Contract,
  PoolStateAndConfiguration as PoolV1StateAndConfiguration,
} from '../contracts/v1';
import {
  PoolContract as PoolV1_5_Contract,
  RouterContract as RouterV1_5_Contract,
  PositionNFTContract as PositionNFTV1_5_Contract,
  PoolFactoryContract as PoolFactoryV1_5_Contract,
  PoolStateAndConfiguration as PoolV1_5_StateAndConfiguration,
} from '../contracts/v1.5';

export type RouterContractType =
  | typeof RouterV1Contract
  | typeof RouterV1_5_Contract;
export type RouterContractInstanceType = RouterV1Contract | RouterV1_5_Contract;

export type PoolContractType = typeof PoolV1Contract | typeof PoolV1_5_Contract;
export type PoolContractInstanceType = PoolV1Contract | PoolV1_5_Contract;

export type PositionNFTContractType =
  | typeof PositionNFTV1Contract
  | typeof PositionNFTV1_5_Contract;
export type PositionNFTContractInstanceType =
  | PositionNFTV1Contract
  | PositionNFTV1_5_Contract;

export type PoolFactoryContractType =
  | typeof PoolFactoryV1Contract
  | typeof PoolFactoryV1_5_Contract;
export type PoolFactoryContractInstanceType =
  | PoolFactoryV1Contract
  | PoolFactoryV1_5_Contract;

export type AccountContractType = typeof AccountV1Contract;
export type AccountContractInstanceType = AccountV1Contract;

export type PoolStateAndConfiguration = {
  ['v1']: PoolV1StateAndConfiguration;
  ['v1.5']: PoolV1_5_StateAndConfiguration;
};
