import {
  PoolContractConfig as PoolV1ContractConfig,
  RouterContractConfig as RouterV1ContractConfig,
  AccountContractConfig as AccountV1ContractConfig,
  PoolFactoryContractConfig as PoolFactoryV1ContractConfig,
  PositionNFTContractConfig as PositionNFTV1ContractConfig,
} from '../contracts/v1';
import {
  PoolContractConfig as PoolV1_5_ContractConfig,
  RouterContractConfig as RouterV1_5_ContractConfig,
  PoolFactoryContractConfig as PoolFactoryV1_5_ContractConfig,
  PositionNFTContractConfig as PositionNFTV1_5_ContractConfig,
} from '../contracts/v1.5';

export type RouterContractConfig = {
  ['v1']: RouterV1ContractConfig;
  ['v1.5']: RouterV1_5_ContractConfig;
};

export type PoolContractConfig = {
  ['v1']: PoolV1ContractConfig;
  ['v1.5']: PoolV1_5_ContractConfig;
};

export type AccountContractConfig = {
  ['v1']: AccountV1ContractConfig;
  ['v1.5']: AccountV1ContractConfig; // same
};

export type PositionNFTContractConfig = {
  ['v1']: PositionNFTV1ContractConfig;
  ['v1.5']: PositionNFTV1_5_ContractConfig;
};

export type PoolFactoryContractConfig = {
  ['v1']: PoolFactoryV1ContractConfig;
  ['v1.5']: PoolFactoryV1_5_ContractConfig;
};
