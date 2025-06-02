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

/** Inital data structures and settings * */
export type PositionNFTContractConfig = {
  poolAddress: Address;
  userAddress: Address;

  liquidity: bigint;
  tickLow: number;
  tickHigh: number;

  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
};

export class PositionNFTContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static positionNFTContractConfigToCell(
    config: PositionNFTContractConfig
  ): Cell {
    return beginCell()
      .storeAddress(config.poolAddress)
      .storeAddress(config.userAddress)
      .storeUint(config.liquidity, 128)
      .storeInt(config.tickLow, 24)
      .storeInt(config.tickHigh, 24)
      .storeRef(
        beginCell()
          .storeUint(config.feeGrowthInside0LastX128, 256)
          .storeUint(config.feeGrowthInside1LastX128, 256)
          .endCell()
      )
      .endCell();
  }

  static createFromConfig(
    config: PositionNFTContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = this.positionNFTContractConfigToCell(config);
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
        .storeUint(ContractOpcodes.POSITIONNFTV3_NFT_TRANSFER, 32) // op
        .storeUint(0, 64) // query id
        .storeAddress(params.to)
        .storeAddress(params.responseTo)
        .storeBit(false) // custom payload
        .storeCoins(params.forwardAmount ?? BigInt(0))
        .storeMaybeRef(params.forwardBody)
        .endCell(),
    });
  }

  /** Getters * */
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
      index: stack.readNumber(),
      collection: stack.readAddressOpt(),
      owner: stack.readAddressOpt(),
      content: stack.readCellOpt(),
    };
  }
}
