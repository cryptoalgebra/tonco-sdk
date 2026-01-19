import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from '@ton/core';
import { ContractOpcodes } from './opCodes';

/** Initial data structures and settings **/
// This is outdated
export type PositionNFTV3ContractConfig = {
  index: bigint;

  poolAddress: Address;
  userAddress: Address;

  content?: Cell;

  liquidity: bigint;
  tickLow: number;
  tickHigh: number;

  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
};

export function positionNFTv3ContractConfigToCell(
  config: PositionNFTV3ContractConfig
): Cell {
  return beginCell()
    .storeUint(config.index, 64)

    .storeAddress(config.poolAddress)
    .storeAddress(config.userAddress)
    .storeRef(config.content ?? Cell.EMPTY)
    .storeUint(config.liquidity, 128)
    .storeInt(config.tickLow, 24)
    .storeInt(config.tickHigh, 24)
    .storeRef(
      beginCell()
        .storeInt(config.feeGrowthInside0LastX128, 256)
        .storeInt(config.feeGrowthInside1LastX128, 256)
        .endCell()
    )
    .endCell();
}

export class PositionNFTV3Contract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: PositionNFTV3ContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = positionNFTv3ContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new PositionNFTV3Contract(address, init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    params: {
      value?: bigint;
      to: Address;
      responseTo?: Address;
      forwardAmount?: bigint;
      forwardBody?: Cell | Builder;
    }
  ) {
    await provider.internal(via, {
      value: params.value ?? toNano('0.05'),
      body: beginCell()
        .storeUint(ContractOpcodes.POSITIONNFTV3_NFT_TRANSFER, 32) // op
        .storeUint(0, 64) // query id
        .storeAddress(params.to)
        .storeAddress(params.responseTo)
        .storeBit(false) // custom payload
        .storeCoins(params.forwardAmount ?? 0n)
        .storeMaybeRef(params.forwardBody)
        .endCell(),
    });
  }

  static getDataMessage(
    target_address: Address,
    include_fee: bigint,
    forward_payload?: Cell
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFTV3_GET_DATA, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(target_address)
      .storeUint(include_fee, 1)
      .storeMaybeRef(forward_payload)
      .endCell();
    return body;
  }

  static unpackGetDataMessage(
    body: Cell
  ): {
    target_address: Address;
    include_fee: bigint;
    forward_payload: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POSITIONNFTV3_GET_DATA) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const target_address = s.loadAddress();
    const include_fee = s.loadUintBig(1);
    const forward_payload = s.loadMaybeRef();
    return { target_address, include_fee, forward_payload };
  }

  async sendGetData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    target_address: Address,
    include_fee: bigint,
    forward_payload?: Cell
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PositionNFTV3Contract.getDataMessage(
        target_address,
        include_fee,
        forward_payload
      ),
    });
  }

  static reportDataMessage(
    pool_address: Address,
    user_address: Address,
    index: bigint,
    liquidity: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    forward_payload: Cell | null
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFTV3_REPORT_DATA, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(pool_address)
      .storeAddress(user_address)
      .storeUint(index, 64)
      .storeUint(liquidity, 128)
      .storeInt(tickLower, 24)
      .storeInt(tickUpper, 24)
      .storeRef(
        beginCell()
          .storeInt(feeGrowthInside0LastX128, 256)
          .storeInt(feeGrowthInside1LastX128, 256)
          .endCell()
      )
      .storeMaybeRef(forward_payload)
      .endCell();
    return body;
  }

  static unpackReportDataMessage(
    body: Cell
  ): {
    pool_address: Address;
    user_address: Address;
    index: bigint;
    liquidity: bigint;
    tickLower: bigint;
    tickUpper: bigint;
    feeGrowthInside0LastX128?: bigint;
    feeGrowthInside1LastX128?: bigint;
    forward_payload: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POSITIONNFTV3_REPORT_DATA) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const pool_address = s.loadAddress();
    const user_address = s.loadAddress();
    const index = s.loadUintBig(64);
    const liquidity = s.loadUintBig(128);
    const tickLower = s.loadIntBig(24);
    const tickUpper = s.loadIntBig(24);
    const cs = s.loadMaybeRef();
    let feeGrowthInside0LastX128;
    let feeGrowthInside1LastX128;
    if (cs) {
      const ss = cs.beginParse();
      feeGrowthInside0LastX128 = ss.loadIntBig(256);
      feeGrowthInside1LastX128 = ss.loadIntBig(256);
    }
    const forward_payload = s.loadMaybeRef();
    return {
      pool_address,
      user_address,
      index,
      liquidity,
      tickLower,
      tickUpper,
      feeGrowthInside0LastX128,
      feeGrowthInside1LastX128,
      forward_payload,
    };
  }

  async sendReportData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    pool_address: Address,
    user_address: Address,
    index: bigint,
    liquidity: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    forward_payload: Cell | null
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PositionNFTV3Contract.reportDataMessage(
        pool_address,
        user_address,
        index,
        liquidity,
        tickLower,
        tickUpper,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        forward_payload
      ),
    });
  }

  /** Getters **/
  async getBalance(provider: ContractProvider) {
    const { stack } = await provider.get('balance', []);
    return { number: stack.readNumber() };
  }

  async getUserAddress(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getUserAddress', []);
    return stack.readAddress();
  }

  async getPoolAddress(provider: ContractProvider): Promise<Address> {
    const { stack } = await provider.get('getPoolAddress', []);
    return stack.readAddress();
  }

  async getPositionInfo(provider: ContractProvider) {
    const { stack } = await provider.get('getPositionInfo', []);
    return {
      liquidity: stack.readBigNumber(),
      tickLow: stack.readNumber(),
      tickHigh: stack.readNumber(),
      feeGrowthInside0LastX128: stack.readBigNumber(),
      feeGrowthInside1LastX128: stack.readBigNumber(),
    };
  }

  /* TODO: Should I use inheritance? */

  async getData(provider: ContractProvider) {
    const { stack } = await provider.get('get_nft_data', []);
    return {
      inited: stack.readBoolean(),
      index: stack.readBigNumber(),
      collection: stack.readAddressOpt(),
      owner: stack.readAddressOpt(),
      content: stack.readCellOpt(),
    };
  }
}
