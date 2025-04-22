declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHAIN: 'MAINNET' | 'TESTNET';
      ROUTER: string;
      POOL_FACTORY: string;
      PTON_MINTER: string;
      PTON_ROUTER: string;
      ROUTER_CODE: string;
      FARMING_DISTRIBUTOR: string;
      TONCO_MIGRATE: string;
      ROUTER_V2: string;
      POOL_FACTORY_V2: string;
      PTON_MINTER_V2: string;
      PTON_ROUTER_V2: string;
      ROUTER_CODE_V2: string;
    }
  }
}

export {};
