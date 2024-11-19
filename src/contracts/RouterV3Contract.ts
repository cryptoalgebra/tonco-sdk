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
import { BLACK_HOLE_ADDRESS, IMPOSSIBLE_FEE } from '../constants';

/** Initial data structures and settings **/
export const TIMELOCK_DELAY_DEFAULT: bigint =
  BigInt(2) * BigInt(24) * BigInt(60) * BigInt(60);

export type RouterV3ContractConfig = {
  adminAddress: Address;
  poolAdminAddress?: Address;

  poolFactoryAddress: Address;
  flags?: bigint;
  poolv3_code: Cell;
  accountv3_code: Cell;
  position_nftv3_code: Cell;

  timelockDelay?: bigint;

  nonce?: bigint;
};

export function routerv3ContractConfigToCell(
  config: RouterV3ContractConfig
): Cell {
  return beginCell()
    .storeAddress(config.adminAddress)
    .storeAddress(config.poolAdminAddress ?? config.adminAddress)
    .storeAddress(config.poolFactoryAddress)
    .storeUint(config.flags ?? 0, 64)
    .storeUint(0, 64) // seqno

    .storeRef(
      beginCell()
        .storeRef(config.poolv3_code)
        .storeRef(config.accountv3_code)
        .storeRef(config.position_nftv3_code)
        .endCell()
    )

    .storeRef(
      beginCell()
        .storeUint(config.timelockDelay ?? TIMELOCK_DELAY_DEFAULT, 64) // timelock Delay
        .storeUint(0, 3) // 3 maybe refs for active timelocks
        .endCell()
    )
    .storeUint(config.nonce ?? 0, 64)
    .endCell();
}

export function routerv3ContractCellToConfig(c: Cell): RouterV3ContractConfig {
  let s: Slice = c.beginParse();

  const adminAddress: Address = s.loadAddress();
  const poolAdminAddress: Address = s.loadAddress();
  const poolFactoryAddress: Address = s.loadAddress();
  const flags = s.loadUintBig(64);

  const seqno = s.loadUintBig(64);

  const subcodes = s.loadRef().beginParse();
  const poolv3_code: Cell = subcodes.loadRef();
  const accountv3_code: Cell = subcodes.loadRef();
  const position_nftv3_code: Cell = subcodes.loadRef();

  const timelocks = s.loadRef().beginParse();
  const timelockDelay: bigint = timelocks.loadUintBig(64);

  let nonce: bigint | undefined = undefined;
  if (s.remainingBits != 0) {
    nonce = s.loadUintBig(64);
  }

  return {
    adminAddress,
    poolAdminAddress,
    poolFactoryAddress,
    flags,
    poolv3_code,
    accountv3_code,
    position_nftv3_code,
    timelockDelay,
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

  /* =============  CHANGE ADMIN =============  */

  static changeAdminStartMessage(opts: {
    newCode?: Cell;
    newAdmin?: Address;
    newFlags?: bigint;
  }): Cell {
    let msg = beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_ADMIN_START, 32) // OP code
      .storeUint(0, 64); // QueryID what for?

    if (opts.newAdmin == undefined) {
      msg.storeUint(0, 1);
      msg.storeAddress(null);
    } else {
      msg.storeUint(1, 1);
      msg.storeAddress(opts.newAdmin);
    }

    if (opts.newFlags == undefined) {
      msg.storeUint(0, 1);
      msg.storeUint(0, 64);
    } else {
      msg.storeUint(1, 1);
      msg.storeUint(opts.newFlags, 64);
    }

    if (opts.newCode == undefined) {
      msg.storeUint(0, 1);
    } else {
      msg.storeMaybeRef(opts.newCode);
    }
    return msg.endCell();
  }

  static unpackChangeAdminStartMessage(
    body: Cell
  ): {
    newCode?: Cell;
    newAdmin?: Address;
    newFlags?: bigint;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_ADMIN_START)
      throw Error('Wrong opcode');

    const query_id = s.loadUint(64);

    const setAdmin = s.loadBoolean();
    const newAdmin = setAdmin ? s.loadAddress() : undefined;
    if (!setAdmin) {
      s.loadUint(2);
    }

    const setFlags = s.loadBoolean();
    const newFlags = setFlags ? s.loadUintBig(64) : undefined;
    if (!setFlags) {
      s.loadUintBig(64);
    }

    const newCodeV = s.loadMaybeRef();
    const newCode = newCodeV != null ? newCodeV : undefined;

    return { newAdmin, newFlags, newCode };
  }

  async sendChangeAdminStart(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    opts: {
      newCode?: Cell;
      newAdmin?: Address;
      newFlags?: bigint;
    }
  ) {
    const msg_body = RouterV3Contract.changeAdminStartMessage(opts);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  static changeAdminCommitMessage(): Cell {
    let msg = beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_ADMIN_COMMIT, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .endCell();
    return msg;
  }

  static unpackChangeAdminCommitMessage(body: Cell): {} {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_ADMIN_COMMIT)
      throw Error('Wrong opcode');
    const query_id = s.loadUint(64);
    return {};
  }

  async sendChangeAdminCommit(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    const msg_body = RouterV3Contract.changeAdminCommitMessage();
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* =============  CHANGE PARAMS =============  */

  static changeRouterParamMessage(opts: {
    newPoolAdmin?: Address;
    newPoolFactory?: Address;
    //   newFlags? : bigint
  }): Cell {
    return (
      beginCell()
        .storeUint(ContractOpcodes.ROUTERV3_CHANGE_PARAMS, 32) // OP code
        .storeUint(0, 64) // QueryID what for?
        //            .storeUint(opts.newFlags ? 1 : 0, 1)
        //            .storeUint(opts.newFlags ?? 0, 64)
        .storeUint(opts.newPoolFactory ? 1 : 0, 1)
        .storeAddress(opts.newPoolFactory ?? BLACK_HOLE_ADDRESS)
        .storeUint(opts.newPoolAdmin ? 1 : 0, 1)
        .storeAddress(opts.newPoolAdmin ?? BLACK_HOLE_ADDRESS)
        .endCell()
    );
  }

  static unpackChangeRouterParamMessage(
    body: Cell
  ): {
    newPoolAdmin?: Address;
    newPoolFactory?: Address;
    //        newFlags? : bigint
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_PARAMS)
      throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    //        const hasNewFlags = s.loadBit()
    //        const newFlags = hasNewFlags ? s.loadUintBig(64) : undefined

    const hasPoolFactory = s.loadBit();
    const newPoolFactoryV = s.loadAddress();
    const newPoolFactory = hasPoolFactory ? newPoolFactoryV : undefined;

    const hasPoolAdmin = s.loadBit();
    const newPoolAdminV = s.loadAddress();
    const newPoolAdmin = hasPoolAdmin ? newPoolAdminV : undefined;

    return { newPoolAdmin, newPoolFactory };
  }

  async sendChangeRouterParams(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    opts: {
      newPoolAdmin?: Address;
      newPoolFactory?: Address;
    }
  ) {
    const msg_body = RouterV3Contract.changeRouterParamMessage(opts);
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
      pool_admin: stack.readAddress(),
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
