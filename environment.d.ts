declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHAIN: 'MAINNET' | 'TESTNET';
      ROUTER: string;
      POOL_FACTORY: string;
      PTON_MINTER: string;
      PTON_ROUTER: string;
      ROUTER_CODE: string;
      POOL_CODE: string;
      ROUTER_V1_5: string;
      POOL_CODE_V1_5: string;
      POOL_FACTORY_V1_5: string;
      PTON_MINTER_V1_5: string;
      PTON_ROUTER_V1_5: string;
      ROUTER_CODE_V1_5: string;

      FARMING_DISTRIBUTOR: string;
      TONCO_MIGRATE: string;
    }
  }
}

export {};
