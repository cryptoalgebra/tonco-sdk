import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  DictionaryValue,
  Contract,
  contractAddress,
  ContractProvider,
} from '@ton/core';
import { ADDRESS_ZERO } from '../constants';

const BLACK_HOLE_ADDRESS = Address.parse(ADDRESS_ZERO);

export interface PoolStateAndConfiguration {
  router_address: Address;
  admin_address: Address;
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
  nftv3item_counter: bigint;
  reserve0: bigint;
  reserve1: bigint;
  nftv3items_active?: bigint;
  ticks_occupied?: number;
}

/** Inital data structures and settings **/
export type PoolV3ContractConfig = {
  router_address: Address;
  admin_address?: Address;

  lp_fee_base?: number;
  protocol_fee?: number;

  jetton0_wallet: Address;
  jetton1_wallet: Address;

  tick_spacing?: number;

  pool_active?: boolean;
  tick?: number;
  price_sqrt?: bigint;
  liquidity?: bigint;
  lp_fee_current?: number;

  accountv3_code: Cell;
  position_nftv3_code: Cell;

  nftContent?: Cell;
  nftItemContent?: Cell;
};

export class TickInfoWrapper {
  constructor(
    public liquidityGross: bigint = BigInt(0),
    public liquidityNet: bigint = BigInt(0),
    public outerFeeGrowth0Token: bigint = BigInt(0),
    public outerFeeGrowth1Token: bigint = BigInt(0)
  ) {}
}

type NumberedTickInfo = {
  tickNum: number;
  liquidityGross: bigint;
  liquidityNet: bigint;
  outerFeeGrowth0Token?: bigint;
  outerFeeGrowth1Token?: bigint;
};

const DictionaryTickInfo: DictionaryValue<TickInfoWrapper> = {
  serialize(src, builder) {
    builder.storeUint(src.liquidityGross, 256);
    builder.storeInt(src.liquidityNet, 128);
    builder.storeUint(src.outerFeeGrowth0Token, 256);
    builder.storeUint(src.outerFeeGrowth1Token, 256);
  },
  parse(src) {
    const tickInfo = new TickInfoWrapper();
    tickInfo.liquidityGross = src.loadUintBig(256);
    tickInfo.liquidityNet = src.loadIntBig(128);
    tickInfo.outerFeeGrowth0Token = src.loadUintBig(256);
    tickInfo.outerFeeGrowth1Token = src.loadUintBig(256);
    return tickInfo;
  },
};

export function poolv3ContractConfigToCell(config: PoolV3ContractConfig): Cell {
  let ticks = Dictionary.empty(Dictionary.Keys.Int(24), DictionaryTickInfo);

  return beginCell()
    .storeAddress(config.router_address)
    .storeUint(config.lp_fee_base ?? 30, 16)
    .storeUint(config.protocol_fee ?? 30, 16)
    .storeUint(config.lp_fee_current ?? 30, 16)
    .storeAddress(config.jetton0_wallet)
    .storeAddress(config.jetton1_wallet)
    .storeUint(config.tick_spacing ?? 1, 24)
    .storeUint(0, 64) // poolv3::seqno

    .storeRef(
      beginCell()
        .storeUint(BigInt(0), 256) // poolv3::feeGrowthGlobal0X128
        .storeUint(BigInt(0), 256) // poolv3::feeGrowthGlobal1X128
        .storeUint(BigInt(0), 128) // poolv3::collectedProtocolFee0
        .storeUint(BigInt(0), 128) // poolv3::collectedProtocolFee1

        .storeCoins(BigInt(0)) // poolv3::reserve0
        .storeCoins(BigInt(0)) // poolv3::reserve1
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeUint(0, 1)
        .storeInt(config.tick ?? 0, 24)
        .storeUint(config.price_sqrt ?? 0, 160)
        .storeUint(config.liquidity ?? 0, 128)
        .storeUint(0, 24) // Occupied ticks

        .storeUint(0, 64) // NFT Inital counter
        .storeUint(0, 64) // NFT Active counter

        .storeAddress(config.admin_address ?? BLACK_HOLE_ADDRESS)
        .storeAddress(BLACK_HOLE_ADDRESS) // poolv3::controller_address
        .storeRef(
          beginCell()
            .storeAddress(BLACK_HOLE_ADDRESS) // poolv3::jetton0_minter
            .storeAddress(BLACK_HOLE_ADDRESS) // poolv3::jetton1_minter
            .endCell()
        )

        .endCell()
    )
    .storeRef(beginCell().storeDict(ticks).endCell())
    .storeRef(
      beginCell()
        .storeRef(config.accountv3_code)
        .storeRef(config.position_nftv3_code)
        .storeRef(config.nftContent ?? new Cell())
        .storeRef(config.nftItemContent ?? new Cell())
        .endCell()
    )
    .endCell();
}

/** Pool  * */
export class PoolV3Contract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static orderJettonId(
    jetton0Wallet: Address,
    jetton1Wallet: Address
  ): boolean {
    // let result1 =  beginCell().storeAddress(jetton0Wallet).endCell().hash() > beginCell().storeAddress(jetton1Wallet).endCell().hash()

    const strHex0 = beginCell()
      .storeAddress(jetton0Wallet)
      .endCell()
      .hash()
      .toString('hex');
    const strHex1 = beginCell()
      .storeAddress(jetton1Wallet)
      .endCell()
      .hash()
      .toString('hex');

    const result2 = BigInt(`0x${strHex0}`) > BigInt(`0x${strHex1}`);

    // if (result1 != result2) throw Error("Unexpected")

    return result2;
  }

  static createFromConfig(
    config: PoolV3ContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = poolv3ContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);

    return new PoolV3Contract(address, init);
  }

  /** Getters * */
  async getIsActive(provider: ContractProvider) {
    const { stack } = await provider.get('getIsActive', []);
    return stack.readBoolean();
  }

  async getPoolStateAndConfiguration(
    provider: ContractProvider
  ): Promise<PoolStateAndConfiguration> {
    const { stack } = await provider.get('getPoolStateAndConfiguration', []);

    return {
      router_address: stack.readAddress(),
      admin_address: stack.readAddress(),

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

      nftv3item_counter: stack.readBigNumber(),

      reserve0: stack.readBigNumber(),
      reserve1: stack.readBigNumber(),

      nftv3items_active: stack.readBigNumber(),
      ticks_occupied: stack.readNumber(),
    };
  }

  /* Tick related getters */
  /**
   *  Returns a hash object of ticks infos with all internal data starting from key >=tickNumber  or key <= tickNumber
   *  and no more then number. Unfortunataly there is an internal limit of 255 tickInfos
   *
   *
   *  @param provider   blockchain access provider
   *  @param tickNumber Starting tick. Ticks greater or equal will be returned with back == false, with back == true - less or equal keys will be enumerated
   *  @param amount     Number of tick infos to be returned
   *  @param back       directions of ticks
   *
   * */
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
    tickInfo.outerFeeGrowth0Token = result[0].outerFeeGrowth0Token ?? BigInt(0);
    tickInfo.outerFeeGrowth1Token = result[0].outerFeeGrowth1Token ?? BigInt(0);
    return tickInfo;
  }

  async getTickInfosAll(provider: ContractProvider) {
    const { stack } = await provider.get('getAllTickInfos', []);

    if (stack.peek().type !== 'cell') {
      return [];
    }
    let valueReader = stack.readCell();

    const dict = Dictionary.loadDirect(
      Dictionary.Keys.Int(24),
      DictionaryTickInfo,
      valueReader
    );

    let result: NumberedTickInfo[] = [];

    let tickKeys = dict.keys();
    tickKeys.sort((a, b) => a - b);
    for (let key of tickKeys) {
      const info = dict.get(key);
      result.push({
        tickNum: key,
        liquidityGross: info!.liquidityGross,
        liquidityNet: info!.liquidityNet,
        outerFeeGrowth0Token: info!.outerFeeGrowth0Token,
        outerFeeGrowth1Token: info!.outerFeeGrowth1Token,
      });
    }
    return result;
  }

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
          liquidityGross: infoTuple.readBigNumber(),
          liquidityNet: infoTuple.readBigNumber(),
          outerFeeGrowth0Token: full ? infoTuple.readBigNumber() : BigInt(0),
          outerFeeGrowth1Token: full ? infoTuple.readBigNumber() : BigInt(0),
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
    sqrtPriceLimitX96: bigint
  ) {
    const { stack } = await provider.get('getSwapEstimate', [
      { type: 'int', value: BigInt(zeroForOne ? 1 : 0) },
      { type: 'int', value: BigInt(amount) },
      { type: 'int', value: BigInt(sqrtPriceLimitX96) },
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

  /* Subcontracts getters */
  async getUserAccountAddress(
    provider: ContractProvider,
    owner: Address
  ): Promise<Address> {
    const res = await provider.get('getUserAccountAddress', [
      { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
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

  /* Main swap math */
  async getComputeSwapStep(
    provider: ContractProvider,
    sqrtRatioCurrentX96: bigint,
    sqrtRatioTargetX96: bigint,
    liquidity: bigint,
    amountRemaining: bigint,
    feePips: bigint
  ) {
    const { stack } = await provider.get('computeSwapStep', [
      { type: 'int', value: BigInt(sqrtRatioCurrentX96) },
      { type: 'int', value: BigInt(sqrtRatioTargetX96) },
      { type: 'int', value: BigInt(liquidity) },
      { type: 'int', value: BigInt(amountRemaining) },
      { type: 'int', value: BigInt(feePips) },
    ]);
    return {
      sqrtRatioNextX96: stack.readBigNumber(),
      amountIn: stack.readBigNumber(),
      amountOut: stack.readBigNumber(),
      feeAmount: stack.readBigNumber(),
    };
  }
}
