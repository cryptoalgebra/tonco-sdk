import { RouterVersion } from '../types/RouterVersion';

export const ROUTER = {
  [RouterVersion.v1]: process.env.ROUTER,
  [RouterVersion.v2]: process.env.ROUTER_V2,
};
export const POOL_FACTORY = {
  [RouterVersion.v1]: process.env.POOL_FACTORY,
  [RouterVersion.v2]: process.env.POOL_FACTORY_V2,
};
export const pTON_MINTER = {
  [RouterVersion.v1]: process.env.PTON_MINTER,
  [RouterVersion.v2]: process.env.PTON_MINTER_V2,
};
export const pTON_ROUTER_WALLET = {
  [RouterVersion.v1]: process.env.PTON_ROUTER,
  [RouterVersion.v2]: process.env.PTON_ROUTER_V2,
};

export const DISTRIBUTOR_ADDRESS = process.env.FARMING_DISTRIBUTOR;

export const TONCO_MIGRATE_ADDRESS = process.env.TONCO_MIGRATE;
