import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  DictionaryValue,
  Sender,
  SendMode,
  Slice,
} from '@ton/core';
import { ContractOpcodes } from './opCodes';

type WhitelistInfo = {
  address: Address;
  allowSetController: Boolean;
  allowSetCreator: Boolean;
  allowSetActive: Boolean;
  allowSetSettings: Boolean;
  allowSetContent: Boolean;
};

const WHITELIST_KEY_LENGTH = 255;

export const WhitelistInfoEntry: DictionaryValue<WhitelistInfo> = {
  serialize(src, builder) {
    return builder.storeRef(
      beginCell()
        .storeAddress(src.address)
        .storeUint(src.allowSetController ? 1 : 0, 1)
        .storeUint(src.allowSetCreator ? 1 : 0, 1)
        .storeUint(src.allowSetActive ? 1 : 0, 1)
        .storeUint(src.allowSetSettings ? 1 : 0, 1)
        .storeUint(src.allowSetContent ? 1 : 0, 1)
        .endCell()
    );
  },
  parse(src) {
    //console.log(`Remaining bits=${src.remainingBits} refs=${src.remainingRefs}`)
    let s: Slice = src.loadRef().beginParse();
    return {
      address: s.loadAddress(),
      allowSetController: s.loadBoolean(),
      allowSetCreator: s.loadBoolean(),
      allowSetActive: s.loadBoolean(),
      allowSetSettings: s.loadBoolean(),
      allowSetContent: s.loadBoolean(),
    };
  },
};

export function unpackWhitelist(
  whiltelistCell: Cell | null
): (Address | null)[] {
  const whiltelist = Dictionary.loadDirect(
    Dictionary.Keys.BigUint(WHITELIST_KEY_LENGTH),
    WhitelistInfoEntry,
    whiltelistCell
  );

  return whiltelist.keys().map(addressHash => {
    const addressMeta = whiltelist.get(addressHash);
    return addressMeta!.address;
  });
}

export type PoolFactoryContractConfig = {
  adminAddress: Address;
  routerAddress: Address;
  tonPrice?: bigint;

  orderCode: Cell;
  nftv3Content: Cell;
  nftv3itemContent: Cell;

  whitelist?: Dictionary<bigint, WhitelistInfo> | Address[];
};

export function addr2hash(address: Address): bigint {
  const addrAsSlice: Slice = beginCell()
    .storeAddress(address)
    .endCell()
    .beginParse();
  addrAsSlice.loadUint(3);
  const hash = addrAsSlice.loadUintBig(WHITELIST_KEY_LENGTH);
  return hash;
}

export function poolFactoryContractConfigToCell(
  config: PoolFactoryContractConfig
): Cell {
  let whitelistDict = Dictionary.empty(
    Dictionary.Keys.BigUint(WHITELIST_KEY_LENGTH),
    WhitelistInfoEntry
  );

  if (Array.isArray(config.whitelist)) {
    for (let address of config.whitelist) {
      whitelistDict.set(addr2hash(address), {
        address,
        allowSetController: true,
        allowSetCreator: true,
        allowSetActive: true,
        allowSetSettings: true,
        allowSetContent: true,
      });
    }
  }

  return beginCell()
    .storeAddress(config.adminAddress)
    .storeAddress(config.routerAddress)
    .storeCoins(config.tonPrice ?? 0)

    .storeRef(config.orderCode)

    .storeRef(config.nftv3Content)
    .storeRef(config.nftv3itemContent)
    .storeDict(whitelistDict)
    .endCell();
}

export function poolFactoryContractCellToConfig(
  data: Cell
): PoolFactoryContractConfig {
  let config: Partial<PoolFactoryContractConfig> = {};

  const ds: Slice = data.beginParse();
  config.adminAddress = ds.loadAddress();
  config.routerAddress = ds.loadAddress();
  config.tonPrice = ds.loadCoins();

  config.orderCode = ds.loadRef();
  config.nftv3Content = ds.loadRef();
  config.nftv3itemContent = ds.loadRef();
  config.whitelist = ds.loadDictDirect(
    Dictionary.Keys.BigUint(WHITELIST_KEY_LENGTH),
    WhitelistInfoEntry
  );

  return config as PoolFactoryContractConfig;
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

  /*
    static deployPoolMessage(
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,
    ) : Cell
    {
        console.log("Minter0 ", jetton0Minter)
        console.log("Minter1 ", jetton1Minter)

        const msg_body : Cell = beginCell()
            .storeUint(ContractOpcodes.POOL_FACTORY_CREATE_POOL, 32) // OP code
            .storeUint(0, 64) // query_id
            .storeAddress(jetton0Minter)
            .storeAddress(jetton1Minter)
            .storeUint(sqrtPriceX96, 160)
            .storeUint(settings, 16)
            .storeRef( beginCell()
                .storeAddress(jetton0Wallet)
                .storeAddress(jetton1Wallet)
            .endCell())
        .endCell();
        return msg_body;
    }
*/
  /* We need to rework printParsedInput not to double the code */
  /*    
    static unpackDeployPoolMessage( body : Cell) : {
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,
    }
    {
        let s = body.beginParse()
        const op       = s.loadUint(32)
        if (op != ContractOpcodes.ROUTERV3_CREATE_POOL)
            throw Error("Wrong opcode")

        const query_id = s.loadUint(64)
        const jetton0Minter = s.loadAddress()
        const jetton1Minter = s.loadAddress()
        const sqrtPriceX96 = s.loadUintBig(160)
        const settings = s.loadUintBig(16)

        const wallets = s.loadRef().beginParse()
        const jetton0Wallet = wallets.loadAddress()
        const jetton1Wallet = wallets.loadAddress()
     
        return {
            jetton0Minter,
            jetton1Minter,
            sqrtPriceX96,
            settings,
            jetton0Wallet,
            jetton1Wallet,
        }     
    }
*/
  /* Deploy pool */

  /*    
    async sendDeployPool(
        provider: ContractProvider, 
        sender: Sender, 
        value: bigint, 
        jetton0Minter: Address,
        jetton1Minter: Address,
        sqrtPriceX96: bigint,
        settings : bigint,
        jetton0Wallet: Address,
        jetton1Wallet: Address,    
    ) {
      const msg_body = PoolFactoryContract.deployPoolMessage(jetton0Minter, jetton1Minter, sqrtPriceX96, settings, jetton0Wallet, jetton1Wallet)
      await provider.internal(sender, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body: msg_body });
    }

    async sendNewData(
        provider: ContractProvider, 
        via: Sender, 
        value: bigint,
        routerAddress : Address,
        nftv3Content? : Cell,
        nftv3itemContent? : Cell
    ) {
        await provider.internal(via, {
            value: value,
            body: beginCell()
                .storeUint(ContractOpcodes.POOL_FACTORY_CHANGE_PARAMS, 32) // op
                .storeUint(0, 64)                                          // query id
                .storeAddress(routerAddress)
                .storeRef(nftv3Content ?? Cell.EMPTY)
                .storeRef(nftv3itemContent ?? Cell.EMPTY)
            .endCell()
        })
    }
*/
  /* */
  static factoryCreatePoolMessage(
    jetton0Minter: Address,
    jetton1Minter: Address,
    initial_priceX96: bigint,
    settings: bigint,
    jetton0Wallet: Address,
    jetton1Wallet: Address,

    whiltelisted?: {
      fee: bigint;
      tickSpacing: bigint;
      active: bigint;
      nftContent?: Cell | null;
    }
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_FACTORY_CREATE_POOL, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(jetton0Minter)
      .storeAddress(jetton1Minter)
      .storeUint(initial_priceX96, 160)
      .storeUint(settings, 16)
      .storeRef(
        beginCell()
          .storeAddress(jetton0Wallet)
          .storeAddress(jetton1Wallet)
          .endCell()
      )
      .storeMaybeRef(
        whiltelisted
          ? beginCell()
              .storeUint(whiltelisted.fee, 16)
              .storeUint(whiltelisted.tickSpacing, 24)
              .storeUint(whiltelisted.active, 1)
              .storeMaybeRef(whiltelisted.nftContent)
              .endCell()
          : null
      )
      .endCell();
    return body;
  }

  static unpackFactoryCreatePoolMessage(
    body: Cell
  ): {
    jetton0Minter: Address;
    jetton1Minter: Address;
    initial_priceX96: bigint;
    settings: bigint;
    jetton0Wallet: Address;
    jetton1Wallet: Address;
    fee?: bigint;
    tickSpacing?: bigint;
    active?: bigint;
    nftContent?: Cell | null;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_FACTORY_CREATE_POOL) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const jetton0Minter = s.loadAddress();
    const jetton1Minter = s.loadAddress();
    const initial_priceX96 = s.loadUintBig(160);
    const settings = s.loadUintBig(16);
    const ss0 = s.loadRef().beginParse();
    const jetton0Wallet = ss0.loadAddress();
    const jetton1Wallet = ss0.loadAddress();
    const ss1 = s.loadRef().beginParse();
    const fee = ss1.loadUintBig(16);
    const tickSpacing = ss1.loadUintBig(24);
    const active = ss1.loadUintBig(1);
    const nftContent = ss1.loadMaybeRef();
    return {
      jetton0Minter,
      jetton1Minter,
      initial_priceX96,
      settings,
      jetton0Wallet,
      jetton1Wallet,
      fee,
      tickSpacing,
      active,
      nftContent,
    };
  }

  async sendFactoryCreatePool(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    jetton0Minter: Address,
    jetton1Minter: Address,
    initial_priceX96: bigint,
    settings: bigint,
    jetton0Wallet: Address,
    jetton1Wallet: Address,

    whiltelisted?: {
      fee: bigint;
      tickSpacing: bigint;
      active: bigint;
      nftContent?: Cell | null;
    }
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolFactoryContract.factoryCreatePoolMessage(
        jetton0Minter,
        jetton1Minter,
        initial_priceX96,
        settings,
        jetton0Wallet,
        jetton1Wallet,
        whiltelisted
      ),
    });
  }
  /**/

  /*START_POOL_FACTORY_ADD_TO_WHITELIST*/
  static factoryAddToWhitelistMessage(
    address: Address,
    allow_set_controller: bigint,
    allow_set_creator: bigint,
    allow_set_active: bigint,
    allow_set_settings: bigint,
    allow_set_content: bigint
  ): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_FACTORY_ADD_TO_WHITELIST, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(address)
      .storeUint(allow_set_controller, 1)
      .storeUint(allow_set_creator, 1)
      .storeUint(allow_set_active, 1)
      .storeUint(allow_set_settings, 1)
      .storeUint(allow_set_content, 1)
      .endCell();
    return body;
  }

  static unpackFactoryAddToWhitelistMessage(
    body: Cell
  ): {
    address: Address;
    allow_set_controller: bigint;
    allow_set_creator: bigint;
    allow_set_active: bigint;
    allow_set_settings: bigint;
    allow_set_content: bigint;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_FACTORY_ADD_TO_WHITELIST) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const address = s.loadAddress();
    const allow_set_controller = s.loadUintBig(1);
    const allow_set_creator = s.loadUintBig(1);
    const allow_set_active = s.loadUintBig(1);
    const allow_set_settings = s.loadUintBig(1);
    const allow_set_content = s.loadUintBig(1);
    return {
      address,
      allow_set_controller,
      allow_set_creator,
      allow_set_active,
      allow_set_settings,
      allow_set_content,
    };
  }

  async sendFactoryAddToWhitelist(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    address: Address,
    allow_set_controller: bigint = BigInt(1),
    allow_set_creator: bigint = BigInt(1),
    allow_set_active: bigint = BigInt(1),
    allow_set_settings: bigint = BigInt(1),
    allow_set_content: bigint = BigInt(1)
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolFactoryContract.factoryAddToWhitelistMessage(
        address,
        allow_set_controller,
        allow_set_creator,
        allow_set_active,
        allow_set_settings,
        allow_set_content
      ),
    });
  }
  /*END_POOL_FACTORY_ADD_TO_WHITELIST*/

  /*START_POOL_FACTORY_DEL_FROM_WHITELIST*/
  static factoryDelFromWhitelistMessage(address: Address): Cell {
    let body: Cell = beginCell()
      .storeUint(ContractOpcodes.POOL_FACTORY_DEL_FROM_WHITELIST, 32) // OP code
      .storeUint(0, 64) // query_id
      .storeAddress(address)
      .endCell();
    return body;
  }

  static unpackFactoryDelFromWhitelistMessage(
    body: Cell
  ): {
    address: Address;
  } {
    let s = body.beginParse();
    const op = s.loadUint(32);
    if (op != ContractOpcodes.POOL_FACTORY_DEL_FROM_WHITELIST) {
      throw Error('Wrong opcode');
    }
    const query_id = s.loadUint(64);
    const address = s.loadAddress();
    return { address };
  }

  async sendFactoryDelFromWhitelist(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    address: Address
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: PoolFactoryContract.factoryDelFromWhitelistMessage(address),
    });
  }
  /*END_POOL_FACTORY_DEL_FROM_WHITELIST*/

  /* Getters */
  async getPoolFactoryData(provider: ContractProvider) {
    const { stack } = await provider.get('getPoolFactoryData', []);
    return {
      admin_address: stack.readAddress(),
      router_address: stack.readAddress(),
      ton_price: stack.readBigNumber(),
      nftv3_content: stack.readCell(),
      nftv3item_content: stack.readCell(),
    };
  }

  async getOrderAddress(
    provider: ContractProvider,
    jetton0WalletAddr: Address,
    jetton1WalletAddr: Address
  ) {
    const { stack } = await provider.get('getOrderAddress', [
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
    return {
      order_address: stack.readAddress(),
    };
  }

  async getWhitelist(provider: ContractProvider) {
    const { stack } = await provider.get('getWhitelist', []);

    const whiltelistCell = stack.readCellOpt();
    return unpackWhitelist(whiltelistCell);
  }
}
