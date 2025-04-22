import { RouterVersion } from '../types/RouterVersion';
import {
  PoolV3Contract as PoolV1Contract,
  PoolV3ContractConfig as PoolV1ContractConfig,
  RouterV3Contract as RouterV1Contract,
  RouterV3ContractConfig as RouterV1ContractConfig,
  AccountV3Contract as AccountV1Contract,
  PositionNFTV3Contract as PositionNFTV1Contract,
  PoolFactoryContract as PoolFactoryV1Contract,
} from './v1';
import {
  PoolV3Contract as PoolV2Contract,
  PoolV3ContractConfig as PoolV2ContractConfig,
  RouterV3Contract as RouterV2Contract,
  RouterV3ContractConfig as RouterV2ContractConfig,
  AccountV3Contract as AccountV2Contract,
  PositionNFTV3Contract as PositionNFTV2Contract,
  PoolFactoryContract as PoolFactoryV2Contract,
} from './v2';

export * from './common';
export * from './farming';

export const RouterContract = {
  [RouterVersion.v1]: RouterV1Contract,
  [RouterVersion.v2]: RouterV2Contract,
};

export type RouterContractConfig = {
  [RouterVersion.v1]: RouterV1ContractConfig;
  [RouterVersion.v2]: RouterV2ContractConfig;
};

export const PoolContract = {
  [RouterVersion.v1]: PoolV1Contract,
  [RouterVersion.v2]: PoolV2Contract,
};

export type PoolContractConfig = {
  [RouterVersion.v1]: PoolV1ContractConfig;
  [RouterVersion.v2]: PoolV2ContractConfig;
};

export const AccountContract = {
  [RouterVersion.v1]: AccountV1Contract,
  [RouterVersion.v2]: AccountV2Contract,
};

export const PositionNFTContract = {
  [RouterVersion.v1]: PositionNFTV1Contract,
  [RouterVersion.v2]: PositionNFTV2Contract,
};

export const PoolFactoryContract = {
  [RouterVersion.v1]: PoolFactoryV1Contract,
  [RouterVersion.v2]: PoolFactoryV2Contract,
};
