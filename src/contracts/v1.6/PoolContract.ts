import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  DictionaryValue,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
  DictionaryKey,
} from '@ton/core';
import { ContractOpcodes } from './opCodes';
import {
  BLACK_HOLE_ADDRESS,
  IMPOSSIBLE_FEE,
  MaxUint120,
} from '../../constants';
import { TickMath } from '../../utils';
import { packReforgeMessage, ReforgeMessage } from './ReforgeOrder';

const MaxUint64 = 0xffffffffffffffffn;

export class TickInfoWrapper {
  constructor(
    public priceCache: bigint = 0n,
    public liquidityGross: bigint = 0n,
    public liquidityNet: bigint = 0n,
    public outerFeeGrowth0Token: bigint = 0n,
    public outerFeeGrowth1Token: bigint = 0n
  ) {}
}

export type NumberedTickInfo = TickInfoWrapper & { tickNum: number };

export const DictionaryTickInfo: DictionaryValue<TickInfoWrapper> = {
  serialize(src, builder) {
    builder.storeUint(src.priceCache, 160);

    //console.log(src)

    builder.storeUint(src.liquidityGross, 256);
    builder.storeInt(src.liquidityNet, 128);
    builder.storeInt(src.outerFeeGrowth0Token, 224);
    builder.storeInt(src.outerFeeGrowth1Token, 224);
  },
  parse(src) {
    let tickInfo = new TickInfoWrapper();
    tickInfo.priceCache = src.loadUintBig(160);

    tickInfo.liquidityGross = src.loadUintBig(256);
    tickInfo.liquidityNet = src.loadIntBig(128);
    tickInfo.outerFeeGrowth0Token = src.loadIntBig(224);
    tickInfo.outerFeeGrowth1Token = src.loadIntBig(224);
    return tickInfo;
  },
};

export interface PoolStateAndConfiguration {
  router_address: Address;
  admin_address: Address | null;
  controller_address: Address;

  jetton0_wallet: Address;
  jetton1_wallet: Address;

  jetton0_minter: Address;
  jetton1_minter: Address;

  pool_active: boolean;
  tick_spacing: number;

  lp_fee_base: number;
  protocol_fee: number;
  lp_fee_current: number;

  tick: number;
  price_sqrt: bigint;
  liquidity: bigint;

  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
  collectedProtocolFee0: bigint;
  collectedProtocolFee1: bigint;

  nftItemCounter: bigint;

  reserve0: bigint;
  reserve1: bigint;

  nftItemsActive: bigint;
  ticks_occupied: number;

  seqno: bigint;

  arbiter_address: Address | null;
  version: bigint;
  alm_address: Address | null;
  creator_address: Address | null;
  oracle_address: Address | null;
  flags: bigint;
}

/** Initial data structures and settings **/
export type PoolContractConfig = {
  router_address: Address;
  pool_deployed?: boolean;

  admin_address?: Address;
  controller_address?: Address;
  arbiter_address?: Address | null;
  alm_address?: Address | null;
  creator_address?: Address | null;

  oracle_address?: Address | null;

  seqno?: bigint;
  flags?: bigint;

  lp_fee_base?: number;
  protocol_fee?: number;

  jetton0_wallet: Address;
  jetton1_wallet: Address;

  jetton0_minter?: Address;
  jetton1_minter?: Address;

  tick_spacing?: number;

  tick?: number;
  price_sqrt?: bigint;
  liquidity?: bigint;
  lp_fee_current?: number;

  ticks?: Dictionary<number, TickInfoWrapper> | NumberedTickInfo[];

  account_code?: Cell;
  position_nft_code?: Cell;

  nftContent?: Cell;
  nftItemContent?: Cell;

  ticks_occupied?: number;
  nftItemCounter?: bigint;
  nftItemsActive?: bigint;

  feeGrowthGlobal0X128?: bigint;
  feeGrowthGlobal1X128?: bigint;
  collectedProtocolFee0?: bigint;
  collectedProtocolFee1?: bigint;

  reserve0?: bigint;
  reserve1?: bigint;

  timelockDelay?: bigint;
};

export function embedJettonData(
  content: Cell,
  jetton0Name: string,
  decimals0: number,
  jetton1Name: string,
  decimals1: number
): Cell {
  let p = content.beginParse();

  //console.log("embedJettonData l0 ", Buffer.from(jetton0Name).length )
  //console.log("embedJettonData l1 ", Buffer.from(jetton1Name).length )

  const result: Cell = beginCell()
    .storeInt(p.loadUint(8), 8)
    .storeMaybeRef(p.loadRef())
    .storeUint(decimals0, 6)
    .storeUint(Buffer.from(jetton0Name).length, 8)
    .storeBuffer(Buffer.from(jetton0Name))
    .storeUint(decimals1, 6)
    .storeUint(Buffer.from(jetton1Name).length, 8)
    .storeBuffer(Buffer.from(jetton1Name))
    .endCell();
  return result;
}

type DeployOptions = {
  is_from_admin?: boolean;
  activate_pool?: boolean;

  jetton0Minter?: Address;
  jetton1Minter?: Address;

  admin?: Address;
  controller?: Address;
  arbiter?: Address;
  alm?: Address;
  creator?: Address;
  oracle?: Address;

  poolCode?: Cell;
  accountСode?: Cell;
  positionNftСode?: Cell;

  nftContentPacked?: Cell;
  nftItemContentPacked?: Cell;

  protocolFee?: number;
  lpFee?: number;
  currentFee?: number;

  initialFlags?: bigint;
};

type ReinitOptions = DeployOptions & {
  tickSpacing?: number;
  sqrtPriceX96?: bigint;
};

/** Pool  **/
export class PoolContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  /* This function creates the config only form the values that affect the address */
  static poolStateInitConfig(
    jetton0Wallet: Address,
    jetton1Wallet: Address,
    routerAddress: Address,
    timelockDelay?: bigint
  ): PoolContractConfig {
    if (timelockDelay === undefined) {
      timelockDelay = 24n * 60n * 60n;
    }

    let order = PoolContract.orderJettonId(jetton0Wallet, jetton1Wallet);

    const config: PoolContractConfig = {
      router_address: routerAddress,

      jetton0_wallet: order ? jetton0Wallet : jetton1Wallet,
      jetton1_wallet: order ? jetton1Wallet : jetton0Wallet,
      timelockDelay,
    };
    return config;
  }

  static poolContractConfigToCell(config: PoolContractConfig): Cell {
    let ticksDict = Dictionary.empty(
      Dictionary.Keys.Int(24),
      DictionaryTickInfo
    );

    if (Array.isArray(config.ticks)) {
      for (let tickInfo of config.ticks) {
        ticksDict.set(tickInfo.tickNum, tickInfo);
      }
    }

    if (config.pool_deployed == undefined) {
      config.pool_deployed = false;
    }

    return beginCell()
      .storeAddress(config.router_address)
      .storeUint(config.pool_deployed ? 1 : 0, 1)
      .storeUint(config.lp_fee_base ?? 30, 16)
      .storeUint(config.protocol_fee ?? 30, 16)
      .storeUint(config.lp_fee_current ?? 30, 16)
      .storeAddress(config.jetton0_wallet)
      .storeAddress(config.jetton1_wallet)
      .storeUint(config.tick_spacing ?? 1, 24)
      .storeUint(config.seqno ?? 0, 64) // pool::seqno
      .storeUint(config.flags ?? 0, 64) // pool::flag

      .storeRef(
        beginCell()
          .storeUint(config.feeGrowthGlobal0X128 ?? 0n, 256) // pool::feeGrowthGlobal0X128
          .storeUint(config.feeGrowthGlobal1X128 ?? 0n, 256) // pool::feeGrowthGlobal1X128
          .storeUint(config.collectedProtocolFee0 ?? 0n, 128) // pool::collectedProtocolFee0
          .storeUint(config.collectedProtocolFee1 ?? 0n, 128) // pool::collectedProtocolFee1

          .storeCoins(config.reserve0 ?? 0n) // pool::reserve0
          .storeCoins(config.reserve1 ?? 0n) // pool::reserve1
          .endCell()
      )
      .storeRef(
        beginCell()
          .storeInt(config.tick ?? 0, 24)
          .storeUint(config.price_sqrt ?? 0, 160)
          .storeUint(config.liquidity ?? 0, 128)
          .storeUint(config.ticks_occupied ?? 0, 24) // Occupied ticks
          .storeDict(ticksDict)
          .storeAddress(config.admin_address ?? BLACK_HOLE_ADDRESS)
          .storeAddress(config.controller_address ?? BLACK_HOLE_ADDRESS) // pool::controller_address
          .storeRef(
            beginCell()
              .storeAddress(config.arbiter_address)
              .storeAddress(config.alm_address)
              .storeAddress(config.creator_address)

              .storeRef(
                beginCell()
                  .storeAddress(config.jetton0_minter ?? BLACK_HOLE_ADDRESS) // pool::jetton0_minter
                  .storeAddress(config.jetton1_minter ?? BLACK_HOLE_ADDRESS) // pool::jetton1_minter
                  .endCell()
              )
              .endCell()
          )
          .storeRef(
            beginCell()
              .storeAddress(config.oracle_address)
              .endCell()
          )
          .endCell()
      )
      .storeRef(
        beginCell()
          .storeUint(config.nftItemCounter ?? 0, 64) // NFT Inital counter
          .storeUint(config.nftItemsActive ?? 0, 64) // NFT Active counter
          .storeRef(
            beginCell()
              .storeRef(config.account_code ?? Cell.EMPTY)
              .storeRef(config.position_nft_code ?? Cell.EMPTY)
              .storeRef(config.nftContent ?? Cell.EMPTY)
              .storeRef(config.nftItemContent ?? Cell.EMPTY)
              .endCell()
          )
          .storeRef(
            beginCell()
              .storeUint(config.timelockDelay ?? 0, 64)
              .endCell()
          )
          .endCell()
      )
      .endCell();
  }

  static poolContractCellToConfig(config: Cell): PoolContractConfig {
    let result: Partial<PoolContractConfig> = {};

    let ds: Slice = config.beginParse();

    result.router_address = ds.loadAddress();
    result.pool_deployed = ds.loadBoolean();
    result.lp_fee_base = ds.loadUint(16);
    result.protocol_fee = ds.loadUint(16);
    result.lp_fee_current = ds.loadUint(16);
    result.jetton0_wallet = ds.loadAddress();
    result.jetton1_wallet = ds.loadAddress();
    result.tick_spacing = ds.loadUint(24);
    result.seqno = ds.loadUintBig(64);
    result.flags = ds.loadUintBig(64);

    let feeCell = ds.loadRef();
    let feeSlice = feeCell.beginParse();
    result.feeGrowthGlobal0X128 = feeSlice.loadUintBig(256); // pool::feeGrowthGlobal0X128
    result.feeGrowthGlobal1X128 = feeSlice.loadUintBig(256); // pool::feeGrowthGlobal1X128
    result.collectedProtocolFee0 = feeSlice.loadUintBig(128); // pool::collectedProtocolFee0
    result.collectedProtocolFee1 = feeSlice.loadUintBig(128); // pool::collectedProtocolFee1
    result.reserve0 = feeSlice.loadCoins(); // pool::reserve0
    result.reserve1 = feeSlice.loadCoins(); // pool::reserve1

    let stateCell = ds.loadRef();
    let stateSlice = stateCell.beginParse();
    result.tick = stateSlice.loadInt(24);
    result.price_sqrt = stateSlice.loadUintBig(160);
    result.liquidity = stateSlice.loadUintBig(128);
    result.ticks_occupied = stateSlice.loadUint(24); // Occupied ticks

    result.ticks = stateSlice.loadDict(
      Dictionary.Keys.Int(24),
      DictionaryTickInfo
    );

    result.admin_address = stateSlice.loadAddress();
    result.controller_address = stateSlice.loadAddress();

    let addressCell = stateSlice.loadRef();
    let addressSlice = addressCell.beginParse();
    result.arbiter_address = addressSlice.loadAddressAny() as Address | null;
    result.alm_address = addressSlice.loadAddressAny() as Address | null;
    result.creator_address = addressSlice.loadAddressAny() as Address | null;

    let mintersCell = addressSlice.loadRef();
    let mintersSlice = mintersCell.beginParse();
    result.jetton0_minter = mintersSlice.loadAddress();
    result.jetton1_minter = mintersSlice.loadAddress();

    let oracleSlice = stateSlice.loadRef().beginParse();
    result.oracle_address = oracleSlice.loadAddressAny() as Address | null;

    let helperCell = ds.loadRef();
    let helperSlice = helperCell.beginParse();
    result.nftItemCounter = helperSlice.loadUintBig(64); // NFT Inital counter
    result.nftItemsActive = helperSlice.loadUintBig(64); // NFT Active counter

    let subcodesCell = helperSlice.loadRef();
    let subcodesSlice = subcodesCell.beginParse();
    result.account_code = subcodesSlice.loadRef();
    result.position_nft_code = subcodesSlice.loadRef();
    result.nftContent = subcodesSlice.loadRef();
    result.nftItemContent = subcodesSlice.loadRef();

    let timelockCell = helperSlice.loadRef();
    let timelockSlice = timelockCell.beginParse();
    result.timelockDelay = timelockSlice.loadUintBig(64);

    return result as PoolContractConfig;
  }

  static orderJettonId(
    jetton0Wallet: Address,
    jetton1Wallet: Address
  ): boolean {
    // let result1 =  beginCell().storeAddress(jetton0Wallet).endCell().hash() > beginCell().storeAddress(jetton1Wallet).endCell().hash()

    let strHex0 = beginCell()
      .storeAddress(jetton0Wallet)
      .endCell()
      .hash()
      .toString('hex');
    let strHex1 = beginCell()
      .storeAddress(jetton1Wallet)
      .endCell()
      .hash()
      .toString('hex');

    let result2 = BigInt('0x' + strHex0) > BigInt('0x' + strHex1);

    //if (result1 != result2) throw Error("Unexpected")

    return result2;
  }

  static createFromConfig(
    config: PoolContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = PoolContract.poolContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);

    return new PoolContract(address, init);
  }

  static createFromDataAndCode(data: Cell, code: Cell, workchain = 0) {
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new PoolContract(address, init);
  }

  static reinitMessage(opts: ReinitOptions): Cell {
    console.log('reinitMessage');
    console.log(opts);

    if (opts.is_from_admin == undefined) {
      opts.is_from_admin = true;
    }

    let minterCell = null;
    if (opts.jetton0Minter && opts.jetton0Minter) {
      minterCell = beginCell()
        .storeAddress(opts.jetton0Minter)
        .storeAddress(opts.jetton1Minter)
        .endCell();
    }
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_INIT, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeUint(opts.is_from_admin ? 1 : 0, 1) // is_from_admin

      .storeRef(
        beginCell()
          .storeUint(opts.admin == undefined ? 0 : 1, 1)
          .storeAddress(opts.admin) // null is an invalid Address, but valid slice
          .storeUint(opts.controller == undefined ? 0 : 1, 1)
          .storeAddress(opts.controller)
          .storeUint(opts.creator == undefined ? 0 : 1, 1)
          .storeAddress(opts.creator)

          .storeRef(
            beginCell()
              .storeUint(opts.arbiter == undefined ? 0 : 1, 1)
              .storeAddress(opts.arbiter)
              .storeUint(opts.alm == undefined ? 0 : 1, 1)
              .storeAddress(opts.alm)
              .endCell()
          )
          .storeRef(
            beginCell()
              .storeUint(opts.oracle == undefined ? 0 : 1, 1)
              .storeAddress(opts.oracle)
              .endCell()
          )

          .endCell()
      )

      .storeUint(opts.tickSpacing == undefined ? 0 : 1, 1)
      .storeUint(opts.tickSpacing ?? 0, 24)
      .storeUint(opts.sqrtPriceX96 == undefined ? 0 : 1, 1)
      .storeUint(opts.sqrtPriceX96 ?? 0, 160)
      .storeUint(opts.activate_pool == undefined ? 0 : 1, 1)
      .storeUint(opts.activate_pool ? 1 : 0, 1)

      .storeUint(opts.protocolFee ? opts.protocolFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.lpFee ? opts.lpFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.currentFee ? opts.currentFee : IMPOSSIBLE_FEE, 16)

      .storeUint(opts.initialFlags == undefined ? 0 : 1, 1)
      .storeUint(opts.initialFlags ? 1 : 0, 32)

      .storeRef(
        beginCell()
          .storeRef(opts.poolCode ?? Cell.EMPTY)
          .storeRef(opts.accountСode ?? Cell.EMPTY)
          .storeRef(opts.positionNftСode ?? Cell.EMPTY)
          .endCell()
      )

      .storeRef(
        beginCell()
          .storeRef(opts.nftContentPacked ?? Cell.EMPTY)
          .storeRef(opts.nftItemContentPacked ?? Cell.EMPTY)
          .endCell()
      )
      .storeMaybeRef(minterCell)
      .endCell();

    return body;
  }

  static unpackReinitMessage(body: Cell): ReinitOptions {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_INIT) throw Error('Wrong opcode');
    const query_id = s.loadUint(64);
    const is_from_admin = s.loadUint(1) != 0;

    const roles: Slice = s.loadRef().beginParse();
    const hasAdmin = roles.loadUint(1);
    const adminV = roles.loadAddressAny();
    const admin = hasAdmin ? (adminV as Address) : undefined;

    const hasController = roles.loadUint(1);
    const controllerV = roles.loadAddressAny();
    const controller = hasController ? (controllerV as Address) : undefined;

    const hasCreator = roles.loadUint(1);
    const creatorV = roles.loadAddressAny();
    const creator = hasCreator ? (creatorV as Address) : undefined;

    const privilege_roles: Slice = roles.loadRef().beginParse();
    const hasArbiter = privilege_roles.loadUint(1);
    const arbiterV = privilege_roles.loadAddressAny();
    const arbiter = hasArbiter ? (arbiterV as Address) : undefined;

    const hasALM = privilege_roles.loadUint(1);
    const almV = privilege_roles.loadAddressAny();
    const alm = hasALM ? (almV as Address) : undefined;

    const additions_roles: Slice = roles.loadRef().beginParse();
    const hasOracle = additions_roles.loadUint(1);
    const oracleV = additions_roles.loadAddressAny();
    const oracle = hasOracle ? (oracleV as Address) : undefined;

    const setTickSpacing = s.loadUint(1);
    let tickSpacingV = s.loadUint(24);
    let tickSpacing = setTickSpacing != 0 ? tickSpacingV : undefined;

    const setPrice = s.loadUint(1);
    let sqrtPriceX96V = s.loadUintBig(160);
    let sqrtPriceX96 = setPrice != 0 ? sqrtPriceX96V : undefined;

    const setActive = s.loadUint(1);
    let activate_poolV = s.loadUint(1) == 1;
    let activate_pool = setActive != 0 ? activate_poolV : undefined;

    const protocolFeeV = s.loadUint(16);
    const protocolFee =
      protocolFeeV < IMPOSSIBLE_FEE ? protocolFeeV : undefined;
    const lpFeeV = s.loadUint(16);
    const lpFee = lpFeeV < IMPOSSIBLE_FEE ? lpFeeV : undefined;
    const currentFeeV = s.loadUint(16);
    const currentFee = currentFeeV < IMPOSSIBLE_FEE ? currentFeeV : undefined;

    const setInitialFlags = s.loadUint(1);
    let initialFlagsV = s.loadUintBig(32);
    let initialFlags = setInitialFlags != 0 ? initialFlagsV : undefined;

    let nftContentPackedV = s.loadRef();
    let nftContentPacked =
      nftContentPackedV.beginParse().remainingBits != 0
        ? nftContentPackedV
        : undefined;

    let nftItemContentPackedV = s.loadRef();
    let nftItemContentPacked =
      nftItemContentPackedV.beginParse().remainingBits != 0
        ? nftItemContentPackedV
        : undefined;

    return {
      is_from_admin,
      admin,
      controller,
      arbiter,
      alm,
      creator,
      oracle,
      tickSpacing,
      sqrtPriceX96,
      activate_pool,
      nftContentPacked,
      nftItemContentPacked,
      protocolFee,
      lpFee,
      currentFee,
      initialFlags,
    };
  }

  async sendDeploy(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    tickSpacing: number,
    sqrtPriceX96: bigint,
    opts: DeployOptions
  ) {
    if (!opts.activate_pool) {
      opts.activate_pool = false;
    }

    let minterCell = null;
    if (opts.jetton0Minter && opts.jetton0Minter) {
      minterCell = beginCell()
        .storeAddress(opts.jetton0Minter)
        .storeAddress(opts.jetton1Minter)
        .endCell();
    }

    if (opts.is_from_admin == undefined) {
      opts.is_from_admin = true;
    }

    let init: ReinitOptions = { ...opts, tickSpacing, sqrtPriceX96 };

    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.reinitMessage(init),
    });
  }

  async sendReinit(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    opts: ReinitOptions
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.reinitMessage(opts),
    });
  }

  static messageSetFees(
    protocolFee: number,
    lpFee: number,
    currentFee: number
  ) {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_SET_FEE, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeUint(protocolFee, 16)
      .storeUint(lpFee, 16)
      .storeUint(currentFee, 16)
      .endCell();
  }

  static unpackSetFeesMessage(
    body: Cell
  ): {
    protocolFee: number;
    lpFee: number;
    currentFee: number;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_SET_FEE) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    const protocolFee = s.loadUint(16);
    const lpFee = s.loadUint(16);
    const currentFee = s.loadUint(16);
    return { protocolFee, lpFee, currentFee };
  }

  async sendSetFees(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,

    protocolFee: number,
    lpFee: number,
    currentFee: number
  ) {
    const msg_body = PoolContract.messageSetFees(
      protocolFee,
      lpFee,
      currentFee
    );
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* ==== LOCK ==== */
  static messageLockPool(): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_LOCK, 32) // OP code
      .storeUint(0, 64) // query_id
      .endCell();
  }

  static unpackLockPoolMessage(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_LOCK) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
  }

  async sendLockPool(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.messageLockPool(),
    });
  }

  /* ==== UNLOCK ==== */
  static messageUnlockPool(): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_UNLOCK, 32) // OP code
      .storeUint(0, 64) // query_id
      .endCell();
  }

  static unpackUnlockPoolMessage(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_UNLOCK) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
  }

  async sendUnlockPool(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.messageUnlockPool(),
    });
  }

  /* ==== RESET GAS ==== */
  static messageResetGas(): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_RESET_GAS, 32) // OP code
      .storeUint(0, 64) // query_id
      .endCell();
  }

  static unpackResetGasMessage(body: Cell) {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_RESET_GAS) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
  }

  async sendResetGas(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.messageResetGas(),
    });
  }

  /* ==== PROTOCOL COLLECT ==== */
  static messageCollectProtocol(
    target_address?: Address,
    collectFeeAmount0?: bigint,
    collectFeeAmount1?: bigint
    // collectIn? : Address | null
  ): Cell {
    let body = beginCell()
      .storeUint(ContractOpcodes.POOL_COLLECT_PROTOCOL, 32) // OP code
      .storeUint(0, 64); // query_id

    if (target_address) {
      body = body
        .storeAddress(target_address)
        .storeCoins(collectFeeAmount0 ?? BigInt(MaxUint120.toString()))
        .storeCoins(collectFeeAmount1 ?? BigInt(MaxUint120.toString()));
      //  .storeAddress(collectIn)
    }
    return body.endCell();
  }

  static unpackCollectProtocolMessage(
    body: Cell
  ): {
    target_address?: Address;
    collectFeeAmount0?: bigint;
    collectFeeAmount1?: bigint;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_COLLECT_PROTOCOL)
      throw Error('Wrong opcode');
    const query_id = s.loadUint(64);

    let target_address;
    let collectFeeAmount0;
    let collectFeeAmount1;

    if (s.remainingBits != 0) {
      target_address = s.loadAddress();
      collectFeeAmount0 = s.loadCoins();
      collectFeeAmount1 = s.loadCoins();
    }

    return { target_address, collectFeeAmount0, collectFeeAmount1 };
  }

  async sendCollectProtocol(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    target_address?: Address,
    collectFeeAmount0?: bigint,
    collectFeeAmount1?: bigint
  ) {
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.messageCollectProtocol(
        target_address,
        collectFeeAmount0,
        collectFeeAmount1
      ),
    });
  }

  static messageBurn(
    nftIndex: bigint,
    tickLower: number,
    tickUpper: number,
    liquidity2Burn: bigint,
    actions?: {
      target_address0?: Address | null;
      target_address1?: Address | null;

      ton_forward0?: bigint;
      forward_payload0?: Cell | null;
      ton_forward1?: bigint;
      forward_payload1?: Cell | null;

      excessAddress?: Address | null;
      // collectIn? : Address | null;
    }
  ): Cell {
    if (actions) {
      actions.target_address0 = actions.target_address0 ?? null;
      actions.target_address1 = actions.target_address1 ?? null;
      actions.forward_payload0 = actions.forward_payload0 ?? null;
      actions.forward_payload1 = actions.forward_payload1 ?? null;

      console.log('Action ton forward0:', actions.ton_forward0);
      console.log('Action ton forward1:', actions.ton_forward1);
    }

    let body = beginCell()
      .storeUint(ContractOpcodes.POOL_START_BURN, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeUint(nftIndex, 64)
      .storeUint(liquidity2Burn, 128)
      .storeInt(tickLower, 24)
      .storeInt(tickUpper, 24)
      .storeMaybeRef(
        actions
          ? beginCell()
              .storeAddress(actions.target_address0)
              .storeAddress(actions.target_address1)
              //       .storeAddress(actions.collectIn)
              .storeMaybeRef(
                beginCell()
                  .storeCoins(actions.ton_forward0 ?? 0n)
                  .storeMaybeRef(actions.forward_payload0 ?? null)
                  .storeCoins(actions.ton_forward1 ?? 0n)
                  .storeMaybeRef(actions.forward_payload1 ?? null)

                  .storeAddress(actions.excessAddress ?? null)
                  .endCell()
              )
              .endCell()
          : null
      );

    return body.endCell();
  }

  static unpackBurnMessage(
    body: Cell
  ): {
    nftIndex: bigint;
    tickLower: number;
    tickUpper: number;
    liquidity2Burn: bigint;
    actions?: {
      target_address0?: Address | null;
      target_address1?: Address | null;

      ton_forward0?: bigint;
      forward_payload0?: Cell | null;
      ton_forward1?: bigint;
      forward_payload1?: Cell | null;

      collectIn?: Address | null;
    };
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_START_BURN) throw Error('Wrong opcode');
    const query_id = s.loadUint(64);

    const nftIndex = s.loadUintBig(64);
    const liquidity2Burn = s.loadUintBig(128);
    const tickLower = s.loadInt(24);
    const tickUpper = s.loadInt(24);

    let actions;

    const action_cell: Cell | null = s.loadMaybeRef();
    if (action_cell) {
      const action_slice = action_cell.beginParse();
      const target_address0 = action_slice.loadAddressAny() as Address | null;
      const target_address1 = action_slice.loadAddressAny() as Address | null;
      const collectIn = action_slice.loadAddressAny() as Address | null;

      const payload_slice = action_slice.loadRef().beginParse();

      const ton_forward0 = payload_slice.loadCoins();
      const forward_payload0 = payload_slice.loadMaybeRef();
      const ton_forward1 = payload_slice.loadCoins();
      const forward_payload1 = payload_slice.loadMaybeRef();

      actions = {
        target_address0,
        target_address1,
        collectIn,
        ton_forward0,
        forward_payload0,
        ton_forward1,
        forward_payload1,
      };
    }
    return { nftIndex, liquidity2Burn, tickLower, tickUpper, actions };
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    nftIndex: bigint,
    tickLower: number,
    tickUpper: number,
    liquidity2Burn: bigint
  ) {
    await provider.internal(via, {
      value: value,
      body: PoolContract.messageBurn(
        nftIndex,
        tickLower,
        tickUpper,
        liquidity2Burn
      ),
    });
  }

  /** Swap (only can be accepted from router) **/
  static messageSwapPool(
    owner: Address,
    sourceWallet: Address,

    amount: bigint,
    sqrtPriceLimitX96: bigint,
    minOutAmount: bigint,

    fromUser?: Address,

    target_address?: Address
  ): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_SWAP, 32) // op
      .storeUint(0, 64) // query id

      .storeAddress(fromUser ?? owner)
      .storeAddress(owner)
      .storeAddress(sourceWallet)
      .storeRef(
        beginCell()
          .storeCoins(amount)
          .storeUint(sqrtPriceLimitX96, 160)
          .storeCoins(minOutAmount)
          .endCell()
      )

      .storeRef(
        beginCell()
          .storeAddress(target_address ?? null)
          .storeCoins(0)
          .storeMaybeRef(null)
          .storeCoins(0)
          .storeMaybeRef(null)
          .endCell()
      )
      .endCell();
  }

  /*START_POOL_GET_DATA*/
  static getDataMessage(
    reply_address: Address,
    forward_payload: Cell | null
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_GET_DATA, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(reply_address)
      .storeMaybeRef(forward_payload)
      .endCell();
    return body;
  }

  static unpackGetDataMessage(
    body: Cell
  ): {
    reply_address: Address;
    forward_payload: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_GET_DATA) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const reply_address = s.loadAddress();
    const forward_payload = s.loadMaybeRef();
    return { reply_address, forward_payload };
  }

  async sendGetData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    reply_address: Address,
    forward_payload: Cell | null
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.getDataMessage(reply_address, forward_payload),
    });
  }
  /*END_POOL_GET_DATA*/

  /*START_POOL_REPORT_DATA*/
  static reportDataMessage(
    priceX96: bigint,
    tick: bigint,
    liquidity: bigint,
    forward_payload: Cell | null
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_REPORT_DATA, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeUint(priceX96, 160)
      .storeInt(tick, 24)
      .storeUint(liquidity, 128)
      .storeMaybeRef(forward_payload)
      .endCell();
    return body;
  }

  static unpackReportDataMessage(
    body: Cell
  ): {
    priceX96: bigint;
    tick: bigint;
    liquidity: bigint;
    forward_payload: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_REPORT_DATA) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const priceX96 = s.loadUintBig(160);
    const tick = s.loadIntBig(24);
    const liquidity = s.loadUintBig(128);
    const forward_payload = s.loadMaybeRef();
    return { priceX96, tick, liquidity, forward_payload };
  }

  async sendReportData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    priceX96: bigint,
    tick: bigint,
    liquidity: bigint,
    forward_payload: Cell | null
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolContract.reportDataMessage(
        priceX96,
        tick,
        liquidity,
        forward_payload
      ),
    });
  }
  /*END_POOL_REPORT_DATA*/

  /** Getters **/

  async getIsActive(provider: ContractProvider) {
    const { stack } = await provider.get('getIsActive', []);
    return stack.readBoolean();
  }

  /* If not debug, it can actually would throw the exception */
  async getIsDebug(provider: ContractProvider) {
    try {
      const { stack } = await provider.get('isDebugBuild', []);
      return stack.readBoolean();
    } catch (err) {
      return false;
    }
  }

  async getPoolStateAndConfiguration(
    provider: ContractProvider
  ): Promise<PoolStateAndConfiguration> {
    const { stack } = await provider.get('getPoolStateAndConfiguration', []);

    return {
      router_address: stack.readAddress(),
      admin_address: stack.readAddressOpt(),
      controller_address: stack.readAddress(),

      jetton0_wallet: stack.readAddress(),
      jetton1_wallet: stack.readAddress(),

      jetton0_minter: stack.readAddress(),
      jetton1_minter: stack.readAddress(),

      pool_active: stack.readBoolean(),
      tick_spacing: stack.readNumber(),

      lp_fee_base: stack.readNumber(),
      protocol_fee: stack.readNumber(),
      lp_fee_current: stack.readNumber(),

      tick: stack.readNumber(),
      price_sqrt: stack.readBigNumber(),
      liquidity: stack.readBigNumber(),

      feeGrowthGlobal0X128: stack.readBigNumber(),
      feeGrowthGlobal1X128: stack.readBigNumber(),
      collectedProtocolFee0: stack.readBigNumber(),
      collectedProtocolFee1: stack.readBigNumber(),

      nftItemCounter: stack.readBigNumber(),

      reserve0: stack.readBigNumber(),
      reserve1: stack.readBigNumber(),

      nftItemsActive: stack.readBigNumber(),
      ticks_occupied: stack.readNumber(),

      seqno: stack.readBigNumber(),

      arbiter_address: stack.remaining > 0 ? stack.readAddressOpt() : null,
      version: stack.remaining > 0 ? stack.readBigNumber() : 10000n,
      alm_address: stack.remaining > 0 ? stack.readAddressOpt() : null,
      creator_address: stack.remaining > 0 ? stack.readAddressOpt() : null,
      oracle_address: stack.remaining > 0 ? stack.readAddressOpt() : null,
      flags: stack.remaining > 0 ? stack.readBigNumber() : 0n,
    };
  }

  /* Tick related getters */
  /**
   *  Returns a tick by tickNumber. If tick not inited - tick filled with zero will be returned.
   *  Also pervious tick and next tick numbers are returned
   *
   *
   *  @param provider   blockchain access provider
   *  @param tickNumber Tick to extract data for
   *
   **/

  async getTickInfo(provider: ContractProvider, tickNumber: number) {
    const result = await this.getTickInfosFromArr(
      provider,
      tickNumber - 1,
      1,
      false,
      true
    );
    if (result.length == 0 || result[0].tickNum != tickNumber)
      return new TickInfoWrapper();

    let tickInfo = new TickInfoWrapper();
    tickInfo.liquidityGross = result[0].liquidityGross;
    tickInfo.liquidityNet = result[0].liquidityNet;
    tickInfo.outerFeeGrowth0Token = result[0].outerFeeGrowth0Token ?? 0n;
    tickInfo.outerFeeGrowth1Token = result[0].outerFeeGrowth1Token ?? 0n;
    return tickInfo;
  }

  public static cellDictToTicks(dictCell: Cell): NumberedTickInfo[] {
    const dict = Dictionary.loadDirect(
      Dictionary.Keys.Int(24),
      DictionaryTickInfo,
      dictCell
    );

    let result: NumberedTickInfo[] = [];

    let tickKeys = dict.keys();
    tickKeys.sort((a, b) => a - b);
    for (let key of tickKeys) {
      const info = dict.get(key);
      result.push({
        tickNum: key,
        ...info!,
        /*priceCache           :info!.priceCache,
                liquidityGross       :info!.liquidityGross, 
                liquidityNet         :info!.liquidityNet, 
                outerFeeGrowth0Token :info!.outerFeeGrowth0Token, 
                outerFeeGrowth1Token :info!.outerFeeGrowth1Token */
      });
    }
    return result;
  }

  async getTickInfosAll(
    provider: ContractProvider
  ): Promise<NumberedTickInfo[]> {
    const { stack } = await provider.get('getAllTickInfos', []);

    if (stack.peek().type !== 'cell') {
      return [];
    }
    let dictCell: Cell = stack.readCell();
    return PoolContract.cellDictToTicks(dictCell);
  }

  /**
   *  Returns a hash object of ticks infos with all internal data starting from key >=tickNumber  or key <= tickNumber
   *  and no more then number. Unfortunately there is an internal limit of 255 tickInfos
   *
   *
   *  @param provider   blockchain access provider
   *  @param tickNumber Starting tick. Ticks greater or equal will be returned with back == false, with back == true - less or equal keys will be enumerated
   *  @param amount     Number of tick infos to be returned
   *  @param back       directions of ticks
   *  @param full       should fee related fields be filled
   *
   *
   **/
  async getTickInfosFromArr(
    provider: ContractProvider,
    tickNumber: number,
    amount: number,
    back: boolean = false,
    full: boolean = false
  ) {
    const { stack } = await provider.get('getTickInfosFrom', [
      { type: 'int', value: BigInt(tickNumber) },
      { type: 'int', value: BigInt(amount) },
      { type: 'int', value: BigInt(back ? 1 : 0) },
      { type: 'int', value: BigInt(full ? 1 : 0) },
    ]);

    if (stack.peek().type !== 'tuple') {
      return [];
    }
    let valueReader = stack.readTuple();

    let result: NumberedTickInfo[] = [];

    while (valueReader.remaining) {
      // console.log("Outer iteration")
      let internalReader = valueReader.readTuple();
      while (internalReader.remaining) {
        // console.log("Inner iteration")
        const infoTuple = internalReader.readTuple();
        const tickInfo: NumberedTickInfo = {
          tickNum: infoTuple.readNumber(),
          priceCache: 0n,
          liquidityGross: infoTuple.readBigNumber(),
          liquidityNet: infoTuple.readBigNumber(),
          outerFeeGrowth0Token: full ? infoTuple.readBigNumber() : 0n,
          outerFeeGrowth1Token: full ? infoTuple.readBigNumber() : 0n,
        };
        result.push(tickInfo);
      }
    }
    return result;
  }

  async getMintEstimate(
    provider: ContractProvider,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint
  ) {
    const { stack } = await provider.get('getMintEstimate', [
      { type: 'int', value: BigInt(tickLower) },
      { type: 'int', value: BigInt(tickUpper) },
      { type: 'int', value: BigInt(liquidity) },
    ]);
    return {
      amount0: stack.readBigNumber(),
      amount1: stack.readBigNumber(),
      mintErrors: stack.readNumber(),
    };
  }

  async getSwapEstimate(
    provider: ContractProvider,
    zeroForOne: boolean,
    amount: bigint,
    sqrtPriceLimitX96: bigint = 0n,
    minOutAmount: bigint = 0n,
    gasLimit: bigint = 0n
  ) {
    if (sqrtPriceLimitX96 == 0n) {
      sqrtPriceLimitX96 = zeroForOne
        ? BigInt(TickMath.MIN_SQRT_RATIO.toString()) + 1n
        : BigInt(TickMath.MAX_SQRT_RATIO.toString()) - 1n;
    }

    const { stack } = await provider.get('getSwapEstimateGas', [
      { type: 'int', value: BigInt(zeroForOne ? 1 : 0) },
      { type: 'int', value: BigInt(amount) },
      { type: 'int', value: BigInt(sqrtPriceLimitX96) },
      { type: 'int', value: BigInt(minOutAmount) },
      { type: 'int', value: BigInt(gasLimit) },
    ]);
    return { amount0: stack.readBigNumber(), amount1: stack.readBigNumber() };
  }

  async getCollectedFees(
    provider: ContractProvider,
    tickLower: number,
    tickUpper: number,
    posLiquidityDelta: bigint,
    posFeeGrowthInside0X128: bigint,
    posFeeGrowthInside1X128: bigint
  ) {
    const { stack } = await provider.get('getCollectedFees', [
      { type: 'int', value: BigInt(tickLower) },
      { type: 'int', value: BigInt(tickUpper) },
      { type: 'int', value: BigInt(posLiquidityDelta) },
      { type: 'int', value: BigInt(posFeeGrowthInside0X128) },
      { type: 'int', value: BigInt(posFeeGrowthInside1X128) },
    ]);
    return { amount0: stack.readBigNumber(), amount1: stack.readBigNumber() };
  }

  async getFeeGrowthInside(
    provider: ContractProvider,
    tickLower: number,
    tickUpper: number,
    tickCurrent: number,
    feeGrowthGlobal0X128: bigint,
    feeGrowthGlobal1X128: bigint
  ) {
    const { stack } = await provider.get('getFeeGrowthInside', [
      { type: 'int', value: BigInt(tickLower) },
      { type: 'int', value: BigInt(tickUpper) },
      { type: 'int', value: BigInt(tickCurrent) },
      { type: 'int', value: BigInt(feeGrowthGlobal0X128) },
      { type: 'int', value: BigInt(feeGrowthGlobal1X128) },
    ]);
    return {
      feeGrowthInside0X128: stack.readBigNumber(),
      feeGrowthInside1X128: stack.readBigNumber(),
    };
  }

  async sendReforgeMessage(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    message: ReforgeMessage
  ) {
    const msg_body = packReforgeMessage(message);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* Subcontracts getters */
  async getUserAccountAddress(
    provider: ContractProvider,
    owner: Address
  ): Promise<Address> {
    const res = await provider.get('getUserAccountAddress', [
      {
        type: 'slice',
        cell: beginCell()
          .storeAddress(owner)
          .endCell(),
      },
    ]);
    return res.stack.readAddress();
  }

  async getNFTAddressByIndex(
    provider: ContractProvider,
    index: bigint
  ): Promise<Address> {
    const res = await provider.get('get_nft_address_by_index', [
      { type: 'int', value: BigInt(index) },
    ]);
    return res.stack.readAddress();
  }

  async getNFTCollectionContent(provider: ContractProvider) {
    const res = await provider.get('get_collection_data', []);
    return {
      nftItemCounter: res.stack.readBigNumber(),
      nftContent: res.stack.readCell(),
      router_address: res.stack.readAddress(),
    };
  }

  async getNFTContent(
    provider: ContractProvider,
    index: bigint,
    nftItemContent: Cell
  ): Promise<Cell> {
    const res = await provider.get('get_nft_content', [
      { type: 'int', value: BigInt(index) },
      { type: 'cell', cell: nftItemContent },
    ]);
    return res.stack.readCell();
  }

  /* Access code of subcontracts */
  async getChildContracts(provider: ContractProvider) {
    const { stack } = await provider.get('getChildContracts', []);
    return {
      accountCode: stack.readCell(),
      positionNFTCode: stack.readCell(),
      nftCollectionContent: stack.readCell(),
      nftItemContent: stack.readCell(),
    };
  }

  static TIMELOCK_NEVER = MaxUint64;

  /* Get timelocks */
  async getTimelockedUpdates(provider: ContractProvider) {
    console.log('Running : getTimelockedUpdates()');
    const { stack } = await provider.get('get_pending_timelocks', []);
    return {
      timelockDelay: stack.readBigNumber(),

      codeTimelock: stack.readBigNumber(),
      timelockedCode: stack.readCellOpt(),

      almAddressTimelock: stack.readBigNumber(),
      timelockedAlmAddress: stack.readAddressOpt(),

      arbiterAddressTimelock: stack.readBigNumber(),
      timelockedArbiterAddress: stack.readAddressOpt(),

      flagsTimelock: stack.readBigNumber(),
      timelockedFlags: stack.readBigNumber(),
    };
  }
}
