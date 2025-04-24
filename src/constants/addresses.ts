import { DEX_VERSION } from '../types/DexVersion';

export const ROUTER: Record<DEX_VERSION, string> = {
  [DEX_VERSION['v1']]: process.env.ROUTER,
  [DEX_VERSION['v1.5']]: process.env.ROUTER_V1_5,
};
export const POOL_FACTORY: Record<DEX_VERSION, string> = {
  [DEX_VERSION['v1']]: process.env.POOL_FACTORY,
  [DEX_VERSION['v1.5']]: process.env.POOL_FACTORY_V1_5,
};
export const pTON_MINTER: Record<DEX_VERSION, string> = {
  [DEX_VERSION['v1']]: process.env.PTON_MINTER,
  [DEX_VERSION['v1.5']]: process.env.PTON_MINTER_V1_5,
};
export const pTON_ROUTER_WALLET: Record<DEX_VERSION, string> = {
  [DEX_VERSION['v1']]: process.env.PTON_ROUTER,
  [DEX_VERSION['v1.5']]: process.env.PTON_ROUTER_V1_5,
};

export const DISTRIBUTOR_ADDRESS = process.env.FARMING_DISTRIBUTOR;

export const TONCO_MIGRATE_ADDRESS = process.env.TONCO_MIGRATE;
