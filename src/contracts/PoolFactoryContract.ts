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

export type PoolFactoryContractConfig = {
  adminAddress: Address;
  routerAddress: Address;
  nftv3Content: Cell;
  nftv3itemContent: Cell;
};

export function poolFactoryContractConfigToCell(
  config: PoolFactoryContractConfig
): Cell {
  return beginCell()
    .storeAddress(config.adminAddress)
    .storeAddress(config.routerAddress)
    .storeRef(config.nftv3Content)
    .storeRef(config.nftv3itemContent)
    .endCell();
}

export class PoolFactoryContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(
    config: PoolFactoryContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = poolFactoryContractConfigToCell(config);
    const init = { code, data };
    const address = contractAddress(workchain, init);
    return new PoolFactoryContract(address, init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  public static deployPoolMessage(
    jetton0Minter: Address,
    jetton1Minter: Address,
    sqrtPriceX96: bigint,
    settings: bigint,
    jetton0Wallet: Address,
    jetton1Wallet: Address
  ): Cell {
    const msg_body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_FACTORY_CREATE_POOL, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(jetton0Minter)
      .storeAddress(jetton1Minter)
      .storeUint(sqrtPriceX96, 160)
      .storeUint(settings, 16)
      .storeRef(
        beginCell()
          .storeAddress(jetton0Wallet)
          .storeAddress(jetton1Wallet)
          .endCell()
      )
      .endCell();
    return msg_body;
  }

  /* We need to rework printParsedInput not to double the code */
  static unpackDeployPoolMessage(
    body: Cell
  ): {
    jetton0Minter: Address;
    jetton1Minter: Address;
    sqrtPriceX96: bigint;
    settings: bigint;
    jetton0Wallet: Address;
    jetton1Wallet: Address;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.ROUTERV3_CREATE_POOL) throw Error('Wrong opcode');

    const query_id = s.loadUint(64);
    const jetton0Minter = s.loadAddress();
    const jetton1Minter = s.loadAddress();
    const sqrtPriceX96 = s.loadUintBig(160);
    const settings = s.loadUintBig(16);

    const wallets = s.loadRef().beginParse();
    const jetton0Wallet = wallets.loadAddress();
    const jetton1Wallet = wallets.loadAddress();

    return {
      jetton0Minter,
      jetton1Minter,
      sqrtPriceX96,
      settings,
      jetton0Wallet,
      jetton1Wallet,
    };
  }

  /* Deploy pool */

  async sendDeployPool(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    jetton0Minter: Address,
    jetton1Minter: Address,
    sqrtPriceX96: bigint,
    settings: bigint,
    jetton0Wallet: Address,
    jetton1Wallet: Address
  ) {
    const msg_body = PoolFactoryContract.deployPoolMessage(
      jetton0Minter,
      jetton1Minter,
      sqrtPriceX96,
      settings,
      jetton0Wallet,
      jetton1Wallet
    );
    await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  async sendNewData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    routerAddress: Address,
    nftv3Content?: Cell,
    nftv3itemContent?: Cell
  ) {
    await provider.internal(via, {
      value: value,
      body: beginCell()
        .storeUint(ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS, 32) // op
        .storeUint(0, 64) // query id
        .storeAddress(routerAddress)
        .storeRef(nftv3Content ?? Cell.EMPTY)
        .storeRef(nftv3itemContent ?? Cell.EMPTY)
        .endCell(),
    });
  }

  /* Getters */
  async getPoolFactoryData(provider: ContractProvider) {
    const { stack } = await provider.get('getPoolFactoryData', []);
    return {
      admin_address: stack.readAddress(),
      router_address: stack.readAddress(),
      nftv3_content: stack.readCell(),
      nftv3item_content: stack.readCell(),
    };
  }
}
