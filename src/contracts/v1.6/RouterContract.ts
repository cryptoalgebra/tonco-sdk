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
import { ContractOpcodes, ContractErrors } from './opCodes';
import { BLACK_HOLE_ADDRESS, IMPOSSIBLE_FEE } from '../../constants';
import {
  nftContentPackedDefault,
  nftItemContentPackedDefault,
} from '../v1/PoolContract';

const MaxUint64 = 0xffffffffffffffffn;

/** Initial data structures and settings **/
export const TIMELOCK_DELAY_DEFAULT: bigint = 2n * 24n * 60n * 60n;

export type RouterTimelockStorage = {
  adminTimelock: bigint;
  adminAddress: Address | null;

  pTonTimelock: bigint;
  pTonAddress: Address | null;

  flagsTimelock: bigint;
  newFlags: bigint;

  codeTimelock: bigint;
  newCode: Cell | null;

  poolCodeTimelock: bigint;
  newPoolCode: Cell | null;
};

export type RouterContractConfig = {
  adminAddress: Address;
  poolAdminAddress?: Address;

  poolFactoryAddress?: Address | null;
  flags?: bigint;

  proxyTonWalletAddress?: Address | null;

  pool_prototype_code?: Cell;
  pool_code: Cell;
  account_code: Cell;
  position_nft_code: Cell;

  timelockDelay?: bigint;
  timelocks?: RouterTimelockStorage;

  nonce?: bigint;
};

export function routerContractTimelocksToCell(
  timelockDelay?: bigint,
  timelocks?: RouterTimelockStorage
): Cell {
  let builder = beginCell().storeUint(
    timelockDelay ?? TIMELOCK_DELAY_DEFAULT,
    64
  ); // timelock Delay

  if (!timelocks) {
    return builder.endCell();
  }

  return builder
    .storeUint(timelocks.adminTimelock, 64)
    .storeAddress(timelocks.adminAddress)

    .storeUint(timelocks.pTonTimelock, 64)
    .storeAddress(timelocks.pTonAddress)

    .storeUint(timelocks.flagsTimelock, 64)
    .storeUint(timelocks.newFlags, 64)

    .storeUint(timelocks.codeTimelock, 64)
    .storeMaybeRef(timelocks.newCode)

    .storeUint(timelocks.poolCodeTimelock, 64)
    .storeMaybeRef(timelocks.newPoolCode)
    .endCell();
}

export function routerContractConfigToCell(config: RouterContractConfig): Cell {
  return beginCell()
    .storeAddress(config.adminAddress)
    .storeAddress(
      config.proxyTonWalletAddress == undefined
        ? null
        : config.proxyTonWalletAddress
    )

    .storeUint(config.flags ?? 0, 64)
    .storeUint(0, 64) // seqno

    .storeRef(
      beginCell()
        .storeAddress(config.poolAdminAddress ?? config.adminAddress)
        .storeAddress(config.poolFactoryAddress)
        .storeRef(config.pool_prototype_code ?? config.pool_code)
        .storeRef(config.pool_code)
        .storeRef(config.account_code)
        .storeRef(config.position_nft_code)
        .endCell()
    )

    .storeRef(
      routerContractTimelocksToCell(config.timelockDelay, config.timelocks)
    )
    .storeUint(config.nonce ?? 0, 64)
    .endCell();
}

export function routerContractCellToConfig(c: Cell): RouterContractConfig {
  let s: Slice = c.beginParse();

  console.log('Parsing V1.6 data');
  const adminAddress: Address = s.loadAddress();
  const proxyTonWalletAddress: Address | null = s.loadAddressAny() as Address | null;
  const flags = s.loadUintBig(64);
  const seqno = s.loadUintBig(64);

  const subcodes = s.loadRef().beginParse();
  const poolAdminAddress: Address = subcodes.loadAddress();
  const poolFactoryAddress: Address = subcodes.loadAddress();

  const pool_prototype_code: Cell = subcodes.loadRef();
  const pool_code: Cell = subcodes.loadRef();
  const account_code: Cell = subcodes.loadRef();
  const position_nft_code: Cell = subcodes.loadRef();

  const timelocksSlice = s.loadRef().beginParse();
  console.log('B:', timelocksSlice.remainingBits);
  console.log('R:', timelocksSlice.remainingRefs);

  let timelocks: Partial<RouterTimelockStorage> | undefined = undefined;
  const timelockDelay = timelocksSlice.loadUintBig(64);

  try {
    timelocks = {};

    timelocks.adminTimelock = timelocksSlice.loadUintBig(64);
    timelocks.adminAddress = timelocksSlice.loadAddress();
    timelocks.pTonTimelock = timelocksSlice.loadUintBig(64);
    timelocks.pTonAddress = timelocksSlice.loadAddress();
    timelocks.flagsTimelock = timelocksSlice.loadUintBig(64);
    timelocks.newFlags = timelocksSlice.loadUintBig(64);

    timelocks.codeTimelock = timelocksSlice.loadUintBig(64);
    timelocks.newCode = timelocksSlice.loadMaybeRef();
    timelocks.poolCodeTimelock = timelocksSlice.loadUintBig(64);
    timelocks.newPoolCode = timelocksSlice.loadMaybeRef();
  } catch {
    timelocks = undefined;
  }

  let nonce: bigint | undefined = undefined;
  if (s.remainingBits != 0) {
    nonce = s.loadUintBig(64);
  }

  return {
    adminAddress,
    proxyTonWalletAddress,
    flags,

    poolAdminAddress,
    poolFactoryAddress,
    pool_prototype_code,
    pool_code: pool_code,
    account_code: account_code,
    position_nft_code: position_nft_code,
    timelockDelay,
    timelocks: timelocks as RouterTimelockStorage,
    nonce,
  };
}

export type PoolDeployAdditionalOptions = {
  jetton0Minter?: Address;
  jetton1Minter?: Address;

  controllerAddress?: Address | null;
  creatorAddress?: Address | null;
  oracleAddress?: Address | null;

  arbiterAddress?: Address | null;
  almAddress?: Address | null;

  nftContentPacked?: Cell;
  nftItemContentPacked?: Cell;

  protocolFee?: number;
  lpFee?: number;
  currentFee?: number;
};

export class RouterContract implements Contract {
  static FLAG_PAYLOADS: bigint = 0x1n;
  static FLAG_MULTIHOP_SHORTCUT: bigint = 0x2n;
  static FLAG_DIRECT_TON: bigint = 0x4n;

  static KEEP_PRICE_UNCHANGED: bigint = 0n;
  static KEEP_TICKSPACING_UNCHANGED: number = 0;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: RouterContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = routerContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new RouterContract(address, init);
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
    opts: PoolDeployAdditionalOptions
  ): Cell {
    const msg_body: Cell = beginCell()
      .storeUint(ContractOpcodes.ROUTER_CREATE_POOL, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(jetton0WalletAddr)
      .storeAddress(jetton1WalletAddr)
      .storeUint(tickSpacing, 24)
      .storeUint(sqrtPriceX96, 160)
      .storeUint(activatePool ? 1 : 0, 1)
      .storeUint(opts.protocolFee ? opts.protocolFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.lpFee ? opts.lpFee : IMPOSSIBLE_FEE, 16)
      .storeUint(opts.currentFee ? opts.currentFee : IMPOSSIBLE_FEE, 16)

      .storeRef(
        beginCell()
          .storeUint(opts.controllerAddress == undefined ? 0 : 1, 1)
          .storeAddress(opts.controllerAddress)
          .storeUint(opts.creatorAddress == undefined ? 0 : 1, 1)
          .storeAddress(opts.creatorAddress)
          .storeRef(
            beginCell()
              .storeUint(opts.arbiterAddress == undefined ? 0 : 1, 1)
              .storeAddress(opts.arbiterAddress)
              .storeUint(opts.almAddress == undefined ? 0 : 1, 1)
              .storeAddress(opts.almAddress)
              .endCell()
          )
          .storeRef(
            beginCell()
              .storeUint(opts.oracleAddress == undefined ? 0 : 1, 1)
              .storeAddress(opts.oracleAddress)
              .endCell()
          )
          .endCell()
      )
      .storeRef(
        beginCell()
          .storeRef(opts.nftContentPacked ?? nftContentPackedDefault)
          .storeRef(opts.nftItemContentPacked ?? nftItemContentPackedDefault)
          .endCell()
      )
      .storeRef(
        beginCell()
          .storeAddress(opts.jetton0Minter)
          .storeAddress(opts.jetton1Minter)
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
  } & PoolDeployAdditionalOptions {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTER_CREATE_POOL) throw Error('Wrong opcode');

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
      arbiterAddress: arbiter_address,
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
    opts: PoolDeployAdditionalOptions
  ) {
    const msg_body = RouterContract.deployPoolMessage(
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

  /* ============= Payloads for JETTON_TRANSFER_NOTIFICATION =========== */

  static swapPayloadMessage(
    originAddress: Address, // Address to receive result of the swap

    targetRW: Address, // JettonWallet attached to Router is used to identify target token
    priceLimit?: bigint, // Minimum/maximum internal pool price that we are ready to reach
    minOutAmount?: bigint, // Minimum amount to get back
    payloads?:
      | {
          targetAddress: Address;
          okForwardAmount: bigint;
          okForwardPayload: Cell | null;
          retForwardAmount: bigint;
          retForwardPayload: Cell | null;
          excessAddress: Address | null;
        }
      | Cell,
    referral?: {
      code: number;
    }
  ): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.POOL_SWAP, 32) // Request to swap
      .storeAddress(targetRW)
      .storeUint(priceLimit ?? 0n, 160)
      .storeCoins(minOutAmount ?? 0n)
      .storeAddress(originAddress)
      .storeMaybeRef(
        payloads
          ? payloads instanceof Cell
            ? payloads
            : beginCell()
                .storeAddress(payloads.targetAddress)
                .storeCoins(payloads.okForwardAmount)
                .storeMaybeRef(payloads.okForwardPayload)
                .storeCoins(payloads.retForwardAmount)
                .storeMaybeRef(payloads.retForwardPayload)
                .storeAddress(payloads.excessAddress)
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

  static fundSomeoneMessage(
    targetRW: Address, // JettonWallet attached to Router is used to identify target token
    otherUserAddress: Address // Address of the user whose userAccount would be refilled
    //    onBehalfAddress?    : Address, // If in fact that is ALM, it needs to know to whom to mint LP
  ): Cell {
    return (
      beginCell()
        .storeUint(ContractOpcodes.POOL_FUND_SOMEONES_ACCOUNT, 32) // Request to minting part 1
        .storeAddress(targetRW) // Jetton1 Wallet attached to Router is used to identify target token. Note part0 has second token
        .storeAddress(otherUserAddress)
        // .storeAddress(onBehalfAddress ?? null)
        .endCell()
    );
  }

  static fundRouterMessage(): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTER_TO_ROUTER_WALLETS, 32)
      .endCell();
  }

  /* =============  CHANGE PARAMS =============  */

  static changeRouterParamMessage(opts: {
    newPoolAdmin?: Address;
    newPoolFactory?: Address;
    //   newFlags? : bigint
  }): Cell {
    return beginCell()
      .storeUint(ContractOpcodes.ROUTER_CHANGE_PARAMS, 32) // OP code
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
    if (op != ContractOpcodes.ROUTER_CHANGE_PARAMS) throw Error('Wrong opcode');

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
    const msg_body = RouterContract.changeRouterParamMessage(opts);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /** Getters **/
  async getRouterState(provider: ContractProvider) {
    const { stack } = await provider.get('getRouterState', []);
    return {
      admin: stack.readAddress(),
      pool_admin: stack.readAddress(),
      pool_factory: stack.readAddress(),
      proxy_ton: stack.readAddressOpt(),

      flags: stack.readBigNumber(),
      pool_seqno: stack.readBigNumber(),
      version: stack.readNumber(),
    };
  }

  async getAdminAddress(provider: ContractProvider): Promise<Address> {
    const state = await this.getRouterState(provider);
    return state.admin;
  }

  async getPoolFactoryAddress(provider: ContractProvider): Promise<Address> {
    const state = await this.getRouterState(provider);
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
    const poolCode = stack.readCell();
    const accountCode = stack.readCell();
    const positionNFTCode = stack.readCell();

    let poolPrototypeCode = undefined;
    if (stack.remaining > 0) {
      poolPrototypeCode = stack.readCell();
    }

    return {
      poolCode,
      accountCode,
      positionNFTCode,
      poolPrototypeCode,
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

  static TIMELOCK_NEVER = MaxUint64;

  /* Get timelocks */
  async getTimelockedUpdates(provider: ContractProvider) {
    console.log('Running : getTimelockedUpdates()');
    const { stack } = await provider.get('get_pending_timelocks', []);
    return {
      timelockDelay: stack.readBigNumber(),

      adminAddressTimelock: stack.readBigNumber(),
      timelockedAdminAddress: stack.readAddressOpt(),

      pTonAddressTimelock: stack.readBigNumber(),
      timelockedPTonAddress: stack.readAddressOpt(),

      flagsTimelock: stack.readBigNumber(),
      timelockedFlags: stack.readBigNumber(),

      codeTimelock: stack.readBigNumber(),
      timelockedCode: stack.readCellOpt(),

      poolCodeTimelock: stack.readBigNumber(),
      timelockedPoolCode: stack.readCellOpt(),
    };
  }

  public static RESULT_SWAP_OK = ContractErrors.POOL_RESULT_SWAP_OK;
  public static RESULT_BURN_OK = ContractErrors.POOL_RESULT_BURN_OK;
}
