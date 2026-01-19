declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHAIN: 'MAINNET' | 'TESTNET' | 'TETRA';
      ROUTER: string;
      POOL_FACTORY: string;
      PTON_MINTER: string;
      PTON_ROUTER: string;
      ROUTER_CODE: string;
      POOL_CODE: string;
      ACCOUNT_CODE: string;
      POSITION_CODE: string;
      FARMING_DISTRIBUTOR: string;
      TONCO_MIGRATE: string;
    }
  }
}

export {};
