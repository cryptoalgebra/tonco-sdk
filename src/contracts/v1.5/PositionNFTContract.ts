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
import {
  ContractMessageMeta,
  MetaMessage,
  StructureVisitor,
} from '../../types/StructureVisitor';
import { ParseDataVisitor } from '../../types/ParseDataVisitor';

/** Initial data structures and settings **/
// This is outdated
export type PositionNFTContractConfig = {
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

export class PositionNFTContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static positionNFTContractConfigToCell(
    config: PositionNFTContractConfig
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
          .storeUint(feeGrowthInside0LastX128, 256)
          .storeUint(feeGrowthInside1LastX128, 256)
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
      feeGrowthInside0LastX128 = ss.loadUintBig(256);
      feeGrowthInside1LastX128 = ss.loadUintBig(256);
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

  static metaDescription: MetaMessage[] = [
    {
      opcode: ContractOpcodes.POSITIONNFTV3_POSITION_INIT,
      description:
        'Initial message that pools sends to the NFT after state_init',
      rights: 'This operation is allowed for positionv3::pool_address',
      acceptor: (visitor: StructureVisitor) => {
        visitor.visitField({
          name: `op`,
          type: `Uint`,
          size: 32,
          meta: 'op',
          comment: '',
        });
        visitor.visitField({
          name: `query_id`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'queryid as of the TON documentation',
        });
        visitor.visitField({
          name: `user_address`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: 'NFT owner ',
        });

        visitor.visitField({
          name: `liquidity`,
          type: `Uint`,
          size: 128,
          meta: '',
          comment: 'Amount of the liquidity',
        });
        visitor.visitField({
          name: `tickLower`,
          type: `Int`,
          size: 24,
          meta: '',
          comment: 'Lower tick of the NFT',
        });
        visitor.visitField({
          name: `tickUpper`,
          type: `Int`,
          size: 24,
          meta: '',
          comment: 'Upper tick of the NFT',
        });

        visitor.enterCell({
          name: 'old_fee_cell',
          comment: 'Fee counters From',
        });
        visitor.visitField({
          name: `feeGrowthInside0LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });
        visitor.visitField({
          name: `feeGrowthInside1LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });

        visitor.visitField({
          name: `nftIndex`,
          type: `Uint`,
          size: 64,
          meta: 'Indexer',
          comment: '',
        });
        visitor.visitField({
          name: `jetton0Amount`,
          type: `Coins`,
          size: 124,
          meta: 'Indexer',
          comment: '',
        });
        visitor.visitField({
          name: `jetton1Amount`,
          type: `Coins`,
          size: 124,
          meta: 'Indexer',
          comment: '',
        });
        visitor.visitField({
          name: `tick`,
          type: `Int`,
          size: 24,
          meta: 'Indexer',
          comment: '',
        });
        visitor.leaveCell({});
      },
    },
    {
      opcode: ContractOpcodes.POSITIONNFTV3_POSITION_BURN,
      description:
        'Message from the pool that is part of burn process. This message carries new feeGrowthInside?Last values form the pool',
      rights: 'This operation is allowed for positionv3::user_address',
      acceptor: (visitor: StructureVisitor) => {
        visitor.visitField({
          name: `op`,
          type: `Uint`,
          size: 32,
          meta: 'op',
          comment: '',
        });
        visitor.visitField({
          name: `query_id`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'queryid as of the TON documentation',
        });

        visitor.visitField({
          name: `nft_owner`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: 'NFT owner to receive funds',
        });
        visitor.visitField({
          name: `liquidity2Burn`,
          type: `Uint`,
          size: 128,
          meta: '',
          comment:
            'Amount of the liquidity to burn, 0 is a valid amount, in this case only collected fees would be returned',
        });
        visitor.visitField({
          name: `tickLower`,
          type: `Int`,
          size: 24,
          meta: '',
          comment:
            'Lower tick of the NFT. NFT would check that it is the same as in position',
        });
        visitor.visitField({
          name: `tickUpper`,
          type: `Int`,
          size: 24,
          meta: '',
          comment:
            'Upper tick of the NFT. NFT would check that it is the same as in position',
        });

        visitor.enterCell({
          name: 'old_fee_cell',
          comment: 'Fee counters From',
        });
        visitor.visitField({
          name: `feeGrowthInside0LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });
        visitor.visitField({
          name: `feeGrowthInside1LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });
        visitor.leaveCell({});
      },
    },
    {
      opcode: ContractOpcodes.POSITIONNFTV3_NFT_TRANSFER,
      name: 'POSITIONNFTV3_NFT_TRANSFER',
      description:
        'Transfer LP NFT to another user. Please be warned that some UI elements could be unable to track it. However with SDK it still can be burned',
      rights: 'This operation is allowed for positionv3::user_address',
      acceptor: (visitor: StructureVisitor) => {
        visitor.visitField({
          name: `op`,
          type: `Uint`,
          size: 32,
          meta: 'op',
          comment: '',
        });
        visitor.visitField({
          name: `query_id`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'queryid as of the TON documentation',
        });
        visitor.visitField({
          name: `new_owner`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: 'New NFT owner',
        });
        visitor.visitField({
          name: `response_destination`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: 'Address to receive response',
        });

        visitor.visitField({
          name: `custom_payload`,
          type: `Cell`,
          size: 0,
          meta: 'Maybe',
          comment: 'Custom information for NFT. Ignored by our implementation',
        });
        visitor.visitField({
          name: `forward_amount`,
          type: `Coins`,
          size: 124,
          meta: '',
          comment: 'Amount of coins to forward for processing',
        });
        visitor.visitField({
          name: `forward_payload`,
          type: `Cell`,
          size: 0,
          meta: 'Either',
          comment: 'Payload for processing',
        });
      },
    },
    {
      opcode: ContractOpcodes.POSITIONNFTV3_GET_DATA,
      name: 'POSITIONNFTV3_GET_DATA',
      description: 'Method to query pool position nft data onchain',
      rights: 'This operation is allowed for all',
      acceptor: (visitor: StructureVisitor) => {
        visitor.visitField({
          name: `op`,
          type: `Uint`,
          size: 32,
          meta: 'op',
          comment: '',
        });
        visitor.visitField({
          name: `query_id`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'queryid as of the TON documentation',
        });
        visitor.visitField({
          name: `target_address`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: 'target for the information',
        });
        visitor.visitField({
          name: `include_fee`,
          type: `Uint`,
          size: 1,
          meta: 'Boolean',
          comment: 'should include fee counters?',
        });
        visitor.visitField({
          name: `forward_payload`,
          type: `Cell`,
          size: 0,
          meta: 'Maybe',
          comment: 'Payload for forwarding',
        });
      },
    },
    {
      opcode: ContractOpcodes.POSITIONNFTV3_REPORT_DATA,
      name: 'POSITIONNFTV3_REPORT_DATA',
      description: 'Message with nft onchain data content',
      acceptor: (visitor: StructureVisitor) => {
        visitor.visitField({
          name: `op`,
          type: `Uint`,
          size: 32,
          meta: 'op',
          comment: '',
        });
        visitor.visitField({
          name: `query_id`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'queryid as of the TON documentation',
        });
        visitor.visitField({
          name: `pool_address`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: '',
        });
        visitor.visitField({
          name: `user_address`,
          type: `Address`,
          size: 267,
          meta: '',
          comment: '',
        });
        visitor.visitField({
          name: `index`,
          type: `Uint`,
          size: 64,
          meta: '',
          comment: 'index',
        });
        visitor.visitField({
          name: `liquidity`,
          type: `Uint`,
          size: 128,
          meta: '',
          comment: 'Amount of the liquidity',
        });
        visitor.visitField({
          name: `tickLower`,
          type: `Int`,
          size: 24,
          meta: '',
          comment: 'Lower tick of the NFT',
        });
        visitor.visitField({
          name: `tickUpper`,
          type: `Int`,
          size: 24,
          meta: '',
          comment: 'Upper tick of the NFT',
        });

        visitor.enterCell({
          name: 'fee_cell',
          type: 'Maybe',
          comment: 'Fee counters From',
        });
        visitor.visitField({
          name: `feeGrowthInside0LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });
        visitor.visitField({
          name: `feeGrowthInside1LastX128`,
          type: `Uint`,
          size: 256,
          meta: 'x128',
          comment: '',
        });
        visitor.leaveCell({});

        visitor.visitField({
          name: `forward_payload`,
          type: `Cell`,
          size: 0,
          meta: 'Maybe',
          comment: 'Payload for forwarding',
        });
      },
    },
  ];

  static printParsedInput(body: Cell): ContractMessageMeta[] {
    let result: ContractMessageMeta[] = [];
    let p = body.beginParse();
    let op: number = p.preloadUint(32);

    for (let meta of this.metaDescription) {
      if (op == meta.opcode) {
        let visitor = new ParseDataVisitor();
        visitor.visitCell(body as Cell, meta.acceptor);
        result = [...result, ...visitor.result];
      }
    }
    return result;
  }
}
