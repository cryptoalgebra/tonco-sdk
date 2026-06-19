import {
  PoolContractConfig as PoolV1ContractConfig,
  RouterContractConfig as RouterV1ContractConfig,
  AccountContractConfig as AccountV1ContractConfig,
  PoolFactoryContractConfig as PoolFactoryV1ContractConfig,
  PositionNFTContractConfig as PositionNFTV1ContractConfig,
} from '../contracts/v1';
import {
  PoolContractConfig as PoolV1_6_ContractConfig,
  RouterContractConfig as RouterV1_6_ContractConfig,
  AccountContractConfig as AccountV1_6ContractConfig,
  PoolFactoryContractConfig as PoolFactoryV1_6_ContractConfig,
  PositionNFTContractConfig as PositionNFTV1_6_ContractConfig,
} from '../contracts/v1.6';

export type RouterContractConfig = {
  v1: RouterV1ContractConfig;
  v1_6: RouterV1_6_ContractConfig;
};

export type PoolContractConfig = {
  v1: PoolV1ContractConfig;
  v1_6: PoolV1_6_ContractConfig;
};

export type AccountContractConfig = {
  v1: AccountV1ContractConfig;
  v1_6: AccountV1_6ContractConfig;
};

export type PositionNFTContractConfig = {
  v1: PositionNFTV1ContractConfig;
  v1_6: PositionNFTV1_6_ContractConfig;
};

export type PoolFactoryContractConfig = {
  v1: PoolFactoryV1ContractConfig;
  v1_6: PoolFactoryV1_6_ContractConfig;
};
