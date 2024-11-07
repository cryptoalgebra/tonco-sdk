import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from '@ton/core';
import { ContractOpcodes, OpcodesLookup } from './opCodes';
import { ContractMessageMeta, DummyCell } from './DummyCell';
import {
  nftContentPackedDefault,
  nftItemContentPackedDefault,
} from './PoolV3Contract';

/** Initial data structures and settings **/
export type RouterV3ContractConfig = {
  active: boolean;
  adminAddress: Address;
  poolv3_code: Cell;
  accountv3_code: Cell;
  position_nftv3_code: Cell;
  nonce?: bigint;
};

export function routerv3ContractConfigToCell(
  config: RouterV3ContractConfig
): Cell {
  return beginCell()
    .storeUint(config.active ? 1 : 0, 1)
    .storeAddress(config.adminAddress)
    .storeUint(0, 64)
    .storeRef(config.poolv3_code)
    .storeRef(config.accountv3_code)
    .storeRef(config.position_nftv3_code)
    .storeUint(config.nonce ?? 0, 64)
    .endCell();
}

export function routerv3ContractCellToConfig(c: Cell): RouterV3ContractConfig {
  let s: Slice = c.beginParse();

  const active: boolean = s.loadUint(1) == 1;
  const adminAddress: Address = s.loadAddress();
  //   const seqno = s.loadUintBig(64);
  const poolv3_code: Cell = s.loadRef();
  const accountv3_code: Cell = s.loadRef();
  const position_nftv3_code: Cell = s.loadRef();
  const nonce: bigint = s.loadUintBig(64);

  return {
    active,
    adminAddress,
    poolv3_code,
    accountv3_code,
    position_nftv3_code,
    nonce,
  };
}

export class RouterV3Contract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: RouterV3ContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = routerv3ContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new RouterV3Contract(address, init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  static deployPoolMessage(
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address,
    tickSpacing: number,
    sqrtPriceX96: bigint,
    activatePool: boolean,
    opts: {
      jetton0Minter?: Address;
      jetton1Minter?: Address;
      controllerAddress?: Address;

      nftContentPacked?: Cell;
      nftItemContentPacked?: Cell;
    }
  ): Cell {
    const msg_body: Cell = beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CREATE_POOL, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(jetton0WalletAddr)
      .storeAddress(jetton1WalletAddr)
      .storeUint(tickSpacing, 24)
      .storeUint(sqrtPriceX96, 160)
      .storeUint(activatePool ? 1 : 0, 1)
      .storeRef(opts.nftContentPacked ?? nftContentPackedDefault)
      .storeRef(opts.nftItemContentPacked ?? nftItemContentPackedDefault)
      .storeRef(
        beginCell()
          .storeAddress(opts.jetton0Minter)
          .storeAddress(opts.jetton1Minter)
          .storeAddress(opts.controllerAddress)
          .endCell()
      )
      .endCell();
    return msg_body;
  }

  /* We need to rework printParsedInput not to double the code */
  static unpackDeployPoolMessage(
    body: Cell
  ): {
    jetton0WalletAddr: Address;
    jetton1WalletAddr: Address;
    tickSpacing: number;
    sqrtPriceX96: bigint;
    activatePool: boolean;
    jetton0Minter?: Address;
    jetton1Minter?: Address;
    controllerAddress?: Address;

    nftContentPacked?: Cell;
    nftItemContentPacked?: Cell;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CREATE_POOL) throw Error('Wrong opcode');

    // const query_id = s.loadUint(64);
    const jetton0WalletAddr = s.loadAddress();
    const jetton1WalletAddr = s.loadAddress();
    let tickSpacing = s.loadInt(24);
    let sqrtPriceX96 = s.loadUintBig(160);
    let activatePool = s.loadUint(1) != 0;
    let nftContentPacked = s.loadRef();
    let nftItemContentPacked = s.loadRef();

    let s1 = s.loadRef().beginParse();
    let jetton0Minter = s1.loadAddress();
    let jetton1Minter = s1.loadAddress();
    let controllerAddress = s1.loadAddress();

    return {
      jetton0WalletAddr,
      jetton1WalletAddr,
      tickSpacing,
      sqrtPriceX96,
      activatePool,
      jetton0Minter,
      jetton1Minter,
      controllerAddress,
      nftContentPacked,
      nftItemContentPacked,
    };
  }

  /* Deploy pool */

  async sendDeployPool(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address,
    tickSpacing: number,
    sqrtPriceX96: bigint,
    activatePool: boolean,
    opts: {
      jetton0Minter?: Address;
      jetton1Minter?: Address;
      controllerAddress?: Address;

      nftContentPacked?: Cell;
      nftItemContentPacked?: Cell;
    }
  ) {
    const msg_body = RouterV3Contract.deployPoolMessage(
      jetton0WalletAddr,
      jetton1WalletAddr,
      tickSpacing,
      sqrtPriceX96,
      activatePool,
      opts
    );
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  async sendResetGas(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    const msg_body = beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_RESET_GAS, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .endCell();

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  static changeAdminMessage(newAdmin: Address): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_ADMIN, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .storeAddress(newAdmin)
      .endCell();
  }

  static unpackChangeAdminMessage(body: Cell): { newAdmin: Address } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_ADMIN)
      throw Error('Wrong opcode');

    // const query_id = s.loadUint(64);
    const newAdmin = s.loadAddress();
    return { newAdmin };
  }

  async sendChangeAdmin(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    newAdmin: Address
  ) {
    const msg_body = RouterV3Contract.changeAdminMessage(newAdmin);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /** Getters **/
  async getIsLocked(provider: ContractProvider): Promise<boolean> {
    const { stack } = await provider.get('getIsLocked', []);
    return stack.readBoolean();
  }

  async getAdminAddress(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getAdminAddress', []);
    return stack.readAddress();
  }

  async getPoolAddress(
    provider: ContractProvider,
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address
  ): Promise<Address> {
    const { stack } = await provider.get('getPoolAddress', [
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton0WalletAddr)
          .endCell(),
      },
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton1WalletAddr)
          .endCell(),
      },
    ]);
    return stack.readAddress();
  }

  async getChildContracts(provider: ContractProvider) {
    const { stack } = await provider.get('getChildContracts', []);
    return {
      poolCode: stack.readCell(),
      accountCode: stack.readCell(),
      positionNFTCode: stack.readCell(),
    };
  }

  async getPoolInitialData(
    provider: ContractProvider,
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address
  ): Promise<Cell> {
    const { stack } = await provider.get('getPoolInitialData', [
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton0WalletAddr)
          .endCell(),
      },
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton1WalletAddr)
          .endCell(),
      },
    ]);
    return stack.readCell();
  }

  async getPoolStateInit(
    provider: ContractProvider,
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address
  ): Promise<Cell> {
    const { stack } = await provider.get('getPoolStateInit', [
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton0WalletAddr)
          .endCell(),
      },
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(jetton1WalletAddr)
          .endCell(),
      },
    ]);
    return stack.readCell();
  }

  public static RESULT_SWAP_OK = 0xc64370e5;
  public static RESULT_BURN_OK = 0xdda48b6a;

  static printParsedInput(body: Cell | DummyCell): ContractMessageMeta[] {
    let result: ContractMessageMeta[] = [];

    const OpLookup: { [key: number]: string } = OpcodesLookup;
    let p = body.beginParse();
    let op: number = p.loadUint(32);
    console.log('op == ', OpLookup[op]);

    p = body.beginParse();
    if (op == ContractOpcodes.JETTON_TRANSFER_NOTIFICATION) {
      result.push({
        name: `op`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) op`,
      });
      result.push({
        name: `query_id`,
        value: `${p.loadUint(64)}`,
        type: `Uint(64) `,
      });
      result.push({
        name: `jetton_amount`,
        value: `${p.loadCoins()}`,
        type: `Coins() `,
      });
      result.push({
        name: `from_user`,
        value: `${p.loadAddress()}`,
        type: `Address() `,
      });

      let forwardPayload = p.loadMaybeRef();
      if (forwardPayload) {
        result.push({
          name: `forward_payload`,
          value: forwardPayload.toBoc().toString('hex'),
          type: `Cell(), Payload`,
        });
      } else {
        result.push({ name: `forward_payload`, value: `none`, type: `Cell()` });
      }
    }

    if (op == ContractOpcodes.ROUTERV3_CREATE_POOL) {
      result.push({
        name: `op`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) op`,
        comment:
          'Operation that deploys and inits new [Pool](pool.md) contract for two given jettons identified by their wallets. New pool would reorder the jettons to match the ' +
          'invariant `slice_hash(jetton0_address) > slice_hash(jetton1_address).`',
      });
      result.push({
        name: `query_id`,
        value: `${p.loadUint(64)}`,
        type: `Uint(64) `,
        comment: 'queryid as of the TON documentation',
      });
      result.push({
        name: `jetton_wallet0`,
        value: `${p.loadAddress()}`,
        type: `Address()`,
        comment: 'Address of the jetton0 wallet. Used to compute pool address',
      });
      result.push({
        name: `jetton_wallet1`,
        value: `${p.loadAddress()}`,
        type: `Address()`,
        comment: 'Address of the jetton1 wallet. Used to compute pool address',
      });
      result.push({
        name: `tick_spacing`,
        value: `${p.loadInt(24)}`,
        type: `Int(24)  `,
        comment: 'Tick spacing to be used in the pool',
      });
      result.push({
        name: `initial_priceX96`,
        value: `${p.loadUintBig(160)}`,
        type: `Uint(160),PriceX96`,
        comment: 'Initial price for the pool',
      });
      p.loadRef();
      result.push({
        name: `nftv3_content`,
        value: `metadata`,
        type: `Cell(),Metadata`,
      });
      p.loadRef();
      result.push({
        name: `nftv3item_content`,
        value: `metadata`,
        type: `Cell(),Metadata`,
      });

      let p1 = p.loadRef().beginParse();
      result.push({
        name: `jetton0_minter`,
        value: `${p1.loadAddress()}`,
        type: `Address()`,
        comment: 'Address of the jetton0 minter, used by indexer and frontend',
      });
      result.push({
        name: `jetton1_minter`,
        value: `${p1.loadAddress()}`,
        type: `Address()`,
        comment: 'Address of the jetton1 minter, used by indexer and frontend',
      });
      if (p1.preloadUint(2) == 0) {
        result.push({
          name: `controller_addr`,
          value: `null`,
          type: `Address()`,
          comment:
            'Address that is allowed to change the fee. Can always be updated by admin',
        });
      } else {
        result.push({
          name: `controller_addr`,
          value: `${p1.loadAddress()}`,
          type: `Address()`,
        });
      }
    }

    if (op == ContractOpcodes.POOLV3_FUND_ACCOUNT) {
      result.push({
        name: `op`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) op`,
      });
      result.push({
        name: `jetton_target_w`,
        value: `${p.loadAddress()}`,
        type: `Address() `,
      });
      result.push({
        name: `enough0`,
        value: `${p.loadCoins()}`,
        type: `Coins()  `,
      });
      result.push({
        name: `enough1`,
        value: `${p.loadCoins()}`,
        type: `Coins()  `,
      });
      result.push({
        name: `liquidity`,
        value: `${p.loadUint(128)}`,
        type: `Uint(128)`,
      });
      result.push({
        name: `tickLower`,
        value: `${p.loadInt(24)}`,
        type: `Int(24)  `,
      });
      result.push({
        name: `tickUpper`,
        value: `${p.loadInt(24)}`,
        type: `Int(24)  `,
      });
    }

    if (op == ContractOpcodes.ROUTERV3_PAY_TO) {
      result.push({
        name: `op`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) op`,
      });
      result.push({
        name: `query_id`,
        value: `${p.loadUint(64)}`,
        type: `Uint(64) `,
      });
      result.push({
        name: `owner`,
        value: `${p.loadAddress()}`,
        type: `Address()`,
      });

      let exit_code = p.preloadUint(32);
      result.push({
        name: `exit_code`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) `,
      });

      let hasCoinsInfo = p.loadBoolean();
      let hasIndexerInfo = p.loadBoolean();

      if (hasCoinsInfo) {
        let p1 = p.loadRef().beginParse();
        result.push({
          name: `amount0`,
          value: `${p1.loadCoins()}`,
          type: `Coins()  `,
        });
        result.push({
          name: `jetton0_address`,
          value: `${p1.loadAddress()}`,
          type: `Address()`,
        });
        result.push({
          name: `amount1`,
          value: `${p1.loadCoins()}`,
          type: `Coins()  `,
        });
        result.push({
          name: `jetton1_address`,
          value: `${p1.loadAddress()}`,
          type: `Address()`,
        });
      }

      if (hasIndexerInfo) {
        let p1 = p.loadRef().beginParse();

        if (exit_code == RouterV3Contract.RESULT_SWAP_OK) {
          result.push({
            name: `liquidity`,
            value: `${p1.loadUint(128)}`,
            type: `Uint(128),Indexer`,
          });
          result.push({
            name: `price_sqrt`,
            value: `${p1.loadUintBig(160)}`,
            type: `Uint(160),Indexer,PriceX96`,
          });
          result.push({
            name: `tick`,
            value: `${p1.loadInt(24)}`,
            type: `Int(24),Indexer`,
          });
          result.push({
            name: `feeGrowthGlobal0X128`,
            value: `${p1.loadInt(24)}`,
            type: `Int(256),Indexer`,
          });
          result.push({
            name: `feeGrowthGlobal1X128`,
            value: `${p1.loadInt(24)}`,
            type: `Int(256),Indexer`,
          });
        }

        if (exit_code == RouterV3Contract.RESULT_BURN_OK) {
          result.push({
            name: `nftIndex`,
            value: `${p1.loadUint(64)}`,
            type: `Uint(64),Indexer`,
          });
          result.push({
            name: `liquidityBurned`,
            value: `${p1.loadUint(128)}`,
            type: `Uint(128),Indexer`,
          });
          result.push({
            name: `tickLower`,
            value: `${p1.loadInt(24)}`,
            type: `Int(24),Indexer`,
          });
          result.push({
            name: `tickUpper`,
            value: `${p1.loadInt(24)}`,
            type: `Int(24),Indexer`,
          });
          result.push({
            name: `tick`,
            value: `${p1.loadInt(24)}`,
            type: `Int(24),Indexer`,
          });
        }
      }
    }

    if (op == ContractOpcodes.POOLV3_SWAP) {
      result.push({
        name: `op`,
        value: `${p.loadUint(32)}`,
        type: `Uint(32) op`,
      });
      result.push({
        name: `sender`,
        value: `${p.loadAddress()}`,
        type: `Address()`,
      });
      result.push({
        name: `sqrtPriceLimitX96`,
        value: `${p.loadUintBig(160)}`,
        type: `Uint(160),PriceX96`,
      });
      result.push({
        name: `minOutAmount`,
        value: `${p.loadCoins()}`,
        type: `Coins()  `,
      });
      result.push({
        name: `to_address`,
        value: `${p.loadAddress()}`,
        type: `Address()`,
      });
    }

    return result;
  }
}
