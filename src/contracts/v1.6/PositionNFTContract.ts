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
  Slice,
  toNano,
} from '@ton/core';
import { ContractOpcodes } from './opCodes';

/** Initial data structures and settings **/
// This is outdated
export type PositionNFTContractConfig = {
  index: bigint;

  poolAddress: Address;
  userAddress: Address;

  content?: Cell;

  liquidity?: bigint;
  tickLow?: number;
  tickHigh?: number;

  feeGrowthInside0LastX128?: bigint;
  feeGrowthInside1LastX128?: bigint;
};

export function positionNFTContractConfigToCell(
  config: PositionNFTContractConfig
): Cell {
  return beginCell()
    .storeUint(config.index, 64)
    .storeAddress(config.poolAddress)
    .storeAddress(config.userAddress)
    .storeRef(config.content ?? Cell.EMPTY)

    .storeRef(
      beginCell()
        .storeUint(config.liquidity ?? 0n, 128)
        .storeInt(config.tickLow ?? 0n, 24)
        .storeInt(config.tickHigh ?? 0n, 24)
        .storeInt(config.feeGrowthInside0LastX128 ?? 0n, 256)
        .storeInt(config.feeGrowthInside1LastX128 ?? 0n, 256)
        .storeMaybeRef(null)
        .endCell()
    )
    .endCell();
}

export function positionNFTContractCellToConfig(
  config: Cell
): PositionNFTContractConfig {
  let result: Partial<PositionNFTContractConfig> = {};

  let ds: Slice = config.beginParse();

  result.index = ds.loadUintBig(64);
  result.poolAddress = ds.loadAddress();
  result.userAddress = ds.loadAddress();
  result.content = ds.loadRef();

  let positionCell = ds.loadRef();
  let positionSlice = positionCell.beginParse();

  result.liquidity = positionSlice.loadUintBig(128);
  result.tickLow = positionSlice.loadInt(24);
  result.tickHigh = positionSlice.loadInt(24);
  result.feeGrowthInside0LastX128 = positionSlice.loadUintBig(256);
  result.feeGrowthInside1LastX128 = positionSlice.loadUintBig(256);

  return result as PositionNFTContractConfig;
}

export class PositionNFTContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: PositionNFTContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = positionNFTContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new PositionNFTContract(address, init);
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
        .storeUint(ContractOpcodes.POSITIONNFT_NFT_TRANSFER, 32) // op
        .storeUint(0, 64) // query id
        .storeAddress(params.to)
        .storeAddress(params.responseTo)
        .storeBit(false) // custom payload
        .storeCoins(params.forwardAmount ?? 0n)
        .storeMaybeRef(params.forwardBody)
        .endCell(),
    });
  }

  /*START_POSITIONNFTV3_POSITION_INIT*/
  static positionInitMessage(
    user_address: Address,
    liquidity: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    nftIndex: bigint,
    jetton0Amount: bigint,
    jetton1Amount: bigint,
    tick: bigint
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFT_POSITION_INIT, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(user_address)
      .storeUint(liquidity, 128)
      .storeInt(tickLower, 24)
      .storeInt(tickUpper, 24)
      .storeRef(
        beginCell()
          .storeInt(feeGrowthInside0LastX128, 256)
          .storeInt(feeGrowthInside1LastX128, 256)
          .storeUint(nftIndex, 64)
          .storeCoins(jetton0Amount)
          .storeCoins(jetton1Amount)
          .storeInt(tick, 24)
          .endCell()
      )
      .endCell();
    return body;
  }

  static unpackPositionInitMessage(
    body: Cell
  ): {
    user_address: Address;
    liquidity: bigint;
    tickLower: bigint;
    tickUpper: bigint;
    feeGrowthInside0LastX128: bigint;
    feeGrowthInside1LastX128: bigint;
    nftIndex: bigint;
    jetton0Amount: bigint;
    jetton1Amount: bigint;
    tick: bigint;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POSITIONNFT_POSITION_INIT) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const user_address = s.loadAddress();
    const liquidity = s.loadUintBig(128);
    const tickLower = s.loadIntBig(24);
    const tickUpper = s.loadIntBig(24);
    const ss = s.loadRef().beginParse();
    const feeGrowthInside0LastX128 = ss.loadIntBig(256);
    const feeGrowthInside1LastX128 = ss.loadIntBig(256);
    const nftIndex = ss.loadUintBig(64);
    const jetton0Amount = ss.loadCoins();
    const jetton1Amount = ss.loadCoins();
    const tick = ss.loadIntBig(24);
    return {
      user_address,
      liquidity,
      tickLower,
      tickUpper,
      feeGrowthInside0LastX128,
      feeGrowthInside1LastX128,
      nftIndex,
      jetton0Amount,
      jetton1Amount,
      tick,
    };
  }

  async sendPositionInit(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    user_address: Address,
    liquidity: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    nftIndex: bigint,
    jetton0Amount: bigint,
    jetton1Amount: bigint,
    tick: bigint
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PositionNFTContract.positionInitMessage(
        user_address,
        liquidity,
        tickLower,
        tickUpper,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        nftIndex,
        jetton0Amount,
        jetton1Amount,
        tick
      ),
    });
  }
  /*END_POSITIONNFTV3_POSITION_INIT*/

  static getDataMessage(
    target_address: Address,
    include_fee: bigint,
    forward_payload?: Cell
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFT_GET_DATA, 32) // OP code
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
    if (op != ContractOpcodes.POSITIONNFT_GET_DATA) {
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
      body: PositionNFTContract.getDataMessage(
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
      .storeUint(ContractOpcodes.POSITIONNFT_REPORT_DATA, 32) // OP code
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
    if (op != ContractOpcodes.POSITIONNFT_REPORT_DATA) {
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
      body: PositionNFTContract.reportDataMessage(
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

  async sendBurnText(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0, 32)
        .storeBuffer(Buffer.from('burn'))
        .endCell(),
    });
  }

  /*START_POSITIONNFT_POSITION_DEPOSIT*/
  static positionDepositMessage(liquidity2Burn: bigint): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFT_POSITION_DEPOSIT, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeUint(liquidity2Burn, 128)
      .endCell();
    return body;
  }

  static unpackPositionDepositMessage(
    body: Cell
  ): {
    liquidity2Burn: bigint;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POSITIONNFT_POSITION_DEPOSIT) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const liquidity2Burn = s.loadUintBig(128);
    return { liquidity2Burn };
  }

  async sendPositionDeposit(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    liquidity2Burn: bigint
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PositionNFTContract.positionDepositMessage(liquidity2Burn),
    });
  }
  /*END_POSITIONNFT_POSITION_DEPOSIT*/

  /*START_POSITIONNFT_POSITION_BURN*/
  static positionBurnMessage(
    nft_owner: Address,
    liquidity2Burn: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    action: Cell | null
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POSITIONNFT_POSITION_BURN, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(nft_owner)
      .storeUint(liquidity2Burn, 128)
      .storeInt(tickLower, 24)
      .storeInt(tickUpper, 24)
      .storeRef(
        beginCell()
          .storeInt(feeGrowthInside0LastX128, 256)
          .storeInt(feeGrowthInside1LastX128, 256)
          .endCell()
      )
      .storeMaybeRef(action)
      .endCell();
    return body;
  }

  static unpackPositionBurnMessage(
    body: Cell
  ): {
    nft_owner: Address;
    liquidity2Burn: bigint;
    tickLower: bigint;
    tickUpper: bigint;
    feeGrowthInside0LastX128: bigint;
    feeGrowthInside1LastX128: bigint;
    action: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POSITIONNFT_POSITION_BURN) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const nft_owner = s.loadAddress();
    const liquidity2Burn = s.loadUintBig(128);
    const tickLower = s.loadIntBig(24);
    const tickUpper = s.loadIntBig(24);
    const ss = s.loadRef().beginParse();
    const feeGrowthInside0LastX128 = ss.loadIntBig(256);
    const feeGrowthInside1LastX128 = ss.loadIntBig(256);
    const action = s.loadMaybeRef();
    return {
      nft_owner,
      liquidity2Burn,
      tickLower,
      tickUpper,
      feeGrowthInside0LastX128,
      feeGrowthInside1LastX128,
      action,
    };
  }

  async sendPositionBurn(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    nft_owner: Address,
    liquidity2Burn: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    feeGrowthInside0LastX128: bigint,
    feeGrowthInside1LastX128: bigint,
    action: Cell | null
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PositionNFTContract.positionBurnMessage(
        nft_owner,
        liquidity2Burn,
        tickLower,
        tickUpper,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        action
      ),
    });
  }
  /*END_POSITIONNFT_POSITION_BURN*/

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
