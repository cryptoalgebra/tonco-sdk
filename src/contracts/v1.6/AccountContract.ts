import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from '@ton/core';
import { ContractOpcodes } from './opCodes';
import { RouterContract } from './RouterContract';
import {
  BurnOrder,
  packBurnOrder,
  packReforgeOrder,
  ReforgeOrder,
  unpackBurnOrder,
} from './ReforgeOrder';

export type AccountPosition = {
  liquidity: bigint; // uint128;
  tickLower: number; // int24;
  tickUpper: number; // int24;
};

/** Initial data structures and settings **/
export type AccountContractConfig = {
  user: Address;
  pool: Address;
  stored0: bigint;
  stored1: bigint;

  flags?: bigint;

  positions?: [
    BurnOrder | null,
    BurnOrder | null,
    BurnOrder | null,
    BurnOrder | null
  ];

  order?: Cell | null;
};

export function accountContractConfigToCell(
  config: AccountContractConfig
): Cell {
  const positions = config.positions ?? [null, null, null, null];

  return beginCell()
    .storeAddress(config.user)
    .storeAddress(config.pool)
    .storeCoins(config.stored0)
    .storeCoins(config.stored1)

    .storeUint(config.flags ?? 0n, 32)

    .storeRef(
      beginCell()
        .storeMaybeRef(positions[0] ? packBurnOrder(positions[0]) : null)
        .storeMaybeRef(positions[1] ? packBurnOrder(positions[1]) : null)
        .storeMaybeRef(positions[2] ? packBurnOrder(positions[2]) : null)
        .storeMaybeRef(positions[3] ? packBurnOrder(positions[3]) : null)
        .endCell()
    )
    .storeMaybeRef(config.order ?? null)
    .endCell();
}

export function accountContractCellToConfig(c: Cell): AccountContractConfig {
  let res: Partial<AccountContractConfig> = {};
  let s = c.beginParse();
  res.user = s.loadAddress();
  res.pool = s.loadAddress();
  res.stored0 = s.loadCoins();
  res.stored1 = s.loadCoins();

  res.flags = s.loadUintBig(32);

  let pos = s.loadRef().beginParse();
  console.log(pos.remainingRefs);
  res.positions = [
    unpackBurnOrder(pos.loadMaybeRef()),
    unpackBurnOrder(pos.loadMaybeRef()),
    unpackBurnOrder(pos.loadMaybeRef()),
    unpackBurnOrder(pos.loadMaybeRef()),
  ];

  res.order = s.loadMaybeRef();

  return res as AccountContractConfig;
}

export class AccountContract implements Contract {
  static USER_ACCOUNT_FLAG_NORMAL: bigint = 0n;
  static USER_ACCOUNT_FLAG_ALM: bigint = 1n;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: AccountContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = accountContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);

    return new AccountContract(address, init);
  }

  async sendDeploy(provider: ContractProvider, sender: Sender, value: bigint) {
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendResetGas(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    const msg_body = beginCell()
      .storeUint(ContractOpcodes.ACCOUNT_RESET_GAS, 32) // OP code
      .storeUint(0, 64) // QueryID what for?
      .endCell();

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* Test only : Would be accepted only from pool */
  async sendAddLiquidity(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,

    newAmount0: bigint,
    newAmount1: bigint,
    minLPOut: bigint
  ) {
    const msg_body = beginCell()
      .storeUint(ContractOpcodes.ACCOUNT_ADD_LIQUIDITY, 32) // OP code
      .storeCoins(newAmount0)
      .storeCoins(newAmount1)
      .storeCoins(minLPOut)
      .endCell();

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  async sendRefundMe(
    provider: ContractProvider,
    sender: Sender,
    value: bigint
  ) {
    const msg_body = packReforgeOrder(0n, {
      enough0: 0n, // :coins,
      enough1: 0n, // :coins,

      posNeeded: 0n,
      passthrough: 0, //:uint4,
      target_action: 0, //:uint32,

      mintOrders: [],
    });

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  async sendReforgeOrder(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    order: ReforgeOrder
  ) {
    const msg_body = packReforgeOrder(0n, order);
    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  /* Getters */

  async getAccountData(provider: ContractProvider) {
    const { stack } = await provider.get('get_account_data', []);
    return {
      user_address: stack.readAddress(),
      pool_address: stack.readAddress(),
      amount0: stack.readBigNumber(),
      amount1: stack.readBigNumber(),

      posNumber: stack.readBigNumber(),
      order: stack.readCellOpt(),

      positions: stack.readCell(),
    };
  }

  async getTest(provider: ContractProvider) {
    const { stack } = await provider.get('test', []);
  }
}
