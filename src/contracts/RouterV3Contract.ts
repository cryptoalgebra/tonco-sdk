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
import { ContractOpcodes } from './opCodes';
import {
  nftContentPackedDefault,
  nftItemContentPackedDefault,
} from './PoolV3Contract';
import { BLACK_HOLE_ADDRESS, IMPOSSIBLE_FEE } from '../constants';

/** Initial data structures and settings **/
export const TIMELOCK_DELAY_DEFAULT: bigint = 2n * 24n * 60n * 60n;

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
  static FLAG_PAYLOADS: bigint = 0x1n;
  static FLAG_MULTIHOP_SHORTCUT: bigint = 0x2n;
  static FLAG_DIRECT_TON: bigint = 0x4n;

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
      arbiter_address?: Address;

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
          .storeMaybeRef(
            opts.arbiter_address
              ? beginCell()
                  .storeAddress(opts.arbiter_address)
                  .endCell()
              : null
          )
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
    arbiter_address?: Address;

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

    let arbiter_address = undefined;
    if (s1.remainingRefs > 0) {
      arbiter_address = s1
        .loadRef()
        .beginParse()
        .loadAddress();
    }

    return {
      jetton0WalletAddr,
      jetton1WalletAddr,
      tickSpacing,
      sqrtPriceX96,
      activatePool,
      jetton0Minter,
      jetton1Minter,
      controllerAddress,
      arbiter_address,
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
      arbiter_address?: Address;

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

  /* ============= Payloads for JETTON_TRANSFER_NOTIFICATION =========== */

  static swapPayloadMessage(
    originAddress: Address, // Address to receive result of the swap

    targetRW: Address, // JettonWallet attached to Router is used to identify target token
    priceLimit?: bigint, // Minimum/maximum internal pool price that we are ready to reach
    minOutAmount?: bigint, // Minimum amount to get back
    payloads?: {
      targetAddress: Address;
      okForwardAmount: bigint;
      okForwardPayload: Cell;
      retForwardAmount: bigint;
      retForwardPayload: Cell;
    },
    referral?: {
      code: number;
    }
  ): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOLV3_SWAP, 32) // Request to swap
      .storeAddress(targetRW)
      .storeUint(priceLimit ?? BigInt(0), 160)
      .storeCoins(minOutAmount ?? BigInt(0))
      .storeAddress(originAddress)
      .storeMaybeRef(
        payloads
          ? beginCell()
              .storeAddress(payloads.targetAddress)
              .storeCoins(payloads.okForwardAmount)
              .storeRef(payloads.okForwardPayload)
              .storeCoins(payloads.retForwardAmount)
              .storeRef(payloads.retForwardPayload)
              .endCell()
          : null
      )
      .storeMaybeRef(
        referral
          ? beginCell()
              .storeUint(referral.code, 32)
              .endCell()
          : null
      )
      .endCell();
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
    return beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_CHANGE_PARAMS, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .storeUint(opts.newPoolFactory ? 1 : 0, 1)
      .storeAddress(opts.newPoolFactory ?? BLACK_HOLE_ADDRESS)
      .storeUint(opts.newPoolAdmin ? 1 : 0, 1)
      .storeAddress(opts.newPoolAdmin ?? BLACK_HOLE_ADDRESS)
      .endCell();
  }

  static unpackChangeRouterParamMessage(
    body: Cell
  ): {
    newPoolAdmin?: Address;
    newPoolFactory?: Address;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CHANGE_PARAMS)
      throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
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

  /* =============  EMERGENCY RECOVERY =============  */
  static emergencyRecoveryMessage(opts: {
    target0: Address;
    target1: Address;
    exit_code?: bigint;
    seqno?: bigint;
    jetton0Wallet?: Address;
    jetton0Amount?: bigint;
    jetton1Wallet?: Address;
    jetton1Amount?: bigint;
  }): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTERV3_PAY_TO, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .storeAddress(opts.target0)
      .storeAddress(opts.target1)
      .storeUint(opts.exit_code ?? 0, 32)
      .storeUint(opts.seqno ?? 0, 64)
      .storeUint(1, 1) // Coins info
      .storeUint(0, 1) // Indexer info
      .storeRef(
        beginCell() // 124 + 267 + 124 + 267 = 782
          .storeCoins(opts.jetton0Amount ?? 0)
          .storeAddress(opts.jetton0Wallet ?? null)
          .storeCoins(opts.jetton1Amount ?? 0)
          .storeAddress(opts.jetton1Wallet ?? null)
          .endCell()
      )
      .endCell();
  }

  static unpackEmergencyRecoveryMessage(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_PAY_TO) throw Error('Wrong opcode');
    const query_id = s.loadUint(64);
    let target0 = s.loadAddressAny();
    let target1 = s.loadAddressAny();

    let exit_code = s.loadUint(32);
    let seqno = s.loadUintBig(64);
    let has_coins = s.loadUint(1);

    let coinsSlice = s.loadRef().beginParse();

    let jetton0Amount = coinsSlice.loadCoins();
    let jetton0Wallet = coinsSlice.loadAddressAny();
    let jetton1Amount = coinsSlice.loadCoins();
    let jetton1Wallet = coinsSlice.loadAddressAny();

    return {
      target0,
      target1,
      exit_code,
      seqno,
      jetton0Amount,
      jetton0Wallet,
      jetton1Amount,
      jetton1Wallet,
    };
  }

  async sendEmergencyRecoveryMessage(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    opts: {
      target0: Address;
      target1: Address;
      exit_code?: bigint;
      seqno?: bigint;
      jetton0Wallet?: Address;
      jetton0Amount?: bigint;
      jetton1Wallet?: Address;
      jetton1Amount?: bigint;
    }
  ) {
    const msg_body = RouterV3Contract.emergencyRecoveryMessage(opts);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* ============= Merge with above ======  */
  static unpackPayToMessagePartial(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_PAY_TO) throw Error('Wrong opcode');
    const query_id = s.loadUintBig(64);
    let reciever0 = s.loadAddressAny();
    let reciever1 = s.loadAddressAny();
    let exit_code = s.loadUint(32);
    let seqno = s.loadUintBig(64);
    let has_coins = s.loadUint(1);

    let coinsSlice = s.loadRef().beginParse();

    let jetton0Amount = coinsSlice.loadCoins();
    let jetton0Wallet = coinsSlice.loadAddressAny();
    let jetton1Amount = coinsSlice.loadCoins();
    let jetton1Wallet = coinsSlice.loadAddressAny();

    return {
      query_id,
      reciever0,
      reciever1,
      exit_code,
      seqno,
      jetton0Amount,
      jetton0Wallet,
      jetton1Amount,
      jetton1Wallet,
    };
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
}
