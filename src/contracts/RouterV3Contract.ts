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
import { ContractErrors, ContractOpcodes } from './opCodes';
import {
  nftContentPackedDefault,
  nftItemContentPackedDefault,
} from './PoolV3Contract';
import { IMPOSSIBLE_FEE } from '../constants';

/** Initial data structures and settings **/
export type RouterV3ContractConfig = {
  adminAddress: Address;
  poolFactoryAddress: Address;
  flags?: bigint;
  poolv3_code: Cell;
  accountv3_code: Cell;
  position_nftv3_code: Cell;
  nonce?: bigint;
};

export function routerv3ContractConfigToCell(
  config: RouterV3ContractConfig
): Cell {
  return beginCell()
    .storeAddress(config.adminAddress)
    .storeAddress(config.poolFactoryAddress)
    .storeUint(config.flags ?? 0, 64)
    .storeUint(0, 64)
    .storeRef(config.poolv3_code)
    .storeRef(config.accountv3_code)
    .storeRef(config.position_nftv3_code)
    .storeUint(config.nonce ?? 0, 64)
    .endCell();
}

export function routerv3ContractCellToConfig(c: Cell): RouterV3ContractConfig {
  let s: Slice = c.beginParse();

  const adminAddress: Address = s.loadAddress();
  const poolFactoryAddress: Address = s.loadAddress();
  const flags = s.loadUintBig(64);

  const seqno = s.loadUintBig(64);
  const poolv3_code: Cell = s.loadRef();
  const accountv3_code: Cell = s.loadRef();
  const position_nftv3_code: Cell = s.loadRef();

  let nonce: bigint | undefined = undefined;
  if (s.remainingBits != 0) {
    nonce = s.loadUintBig(64);
  }

  return {
    adminAddress,
    poolFactoryAddress,
    flags,
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

      protocolFee?: number;
      lpFee?: number;
      currentFee?: number;
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
      .storeUint(opts.protocolFee ? opts.protocolFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.lpFee ? opts.lpFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.currentFee ? opts.currentFee : IMPOSSIBLE_FEE, 16)

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

    protocolFee?: number;
    lpFee?: number;
    currentFee?: number;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CREATE_POOL) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    const jetton0WalletAddr = s.loadAddress();
    const jetton1WalletAddr = s.loadAddress();
    let tickSpacing = s.loadInt(24);
    let sqrtPriceX96 = s.loadUintBig(160);
    let activatePool = s.loadUint(1) != 0;

    const protocolFeeV = s.loadUint(16);
    const protocolFee =
      protocolFeeV < IMPOSSIBLE_FEE ? protocolFeeV : undefined;
    const lpFeeV = s.loadUint(16);
    const lpFee = lpFeeV < IMPOSSIBLE_FEE ? lpFeeV : undefined;
    const currentFeeV = s.loadUint(16);
    const currentFee = currentFeeV < IMPOSSIBLE_FEE ? currentFeeV : undefined;

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
      protocolFee,
      lpFee,
      currentFee,
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

      protocolFee?: number;
      lpFee?: number;
      currentFee?: number;
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

    const query_id = s.loadUint(64);
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

  static changePoolFactoryMessage(newPoolFactory: Address): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_POOL_FACTORY, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .storeAddress(newPoolFactory)
      .endCell();
  }

  static unpackChangePoolFactoryMessage(
    body: Cell
  ): { newPoolFactory: Address } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_POOL_FACTORY)
      throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    const newPoolFactory = s.loadAddress();
    return { newPoolFactory };
  }

  async sendChangePoolFactory(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    newPoolFactory: Address
  ) {
    const msg_body = RouterV3Contract.changeAdminMessage(newPoolFactory);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  static changeFlagsMessage(flags: bigint): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_FLAGS, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .storeUint(flags, 64)
      .endCell();
  }

  static unpackChangeFlagsMessage(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_FLAGS)
      throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    const flags = s.loadUintBig(64);
    return { flags: flags };
  }

  async sendChangeFlagsFactory(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    flags: bigint
  ) {
    const msg_body = RouterV3Contract.changeFlagsMessage(flags);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /** Getters **/
  async getState(provider: ContractProvider) {
    const { stack } = await provider.get('getRouterState', []);
    return {
      admin: stack.readAddress(),
      pool_factory: stack.readAddress(),
      flags: stack.readBigNumber(),
      pool_seqno: stack.readBigNumber(),
    };
  }

  async getAdminAddress(provider: ContractProvider): Promise<Address> {
    const state = await this.getState(provider);
    return state.admin;
  }

  async getPoolFactoryAddress(provider: ContractProvider): Promise<Address> {
    const state = await this.getState(provider);
    return state.pool_factory;
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

  public static RESULT_SWAP_OK = ContractErrors.POOLV3_RESULT_SWAP_OK;
  public static RESULT_BURN_OK = ContractErrors.POOLV3_RESULT_BURN_OK;
}
