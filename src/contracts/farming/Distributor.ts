import {
  Dictionary,
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Builder,
  Slice,
  DictionaryValue,
} from '@ton/core';
import { DistributorContractOpcodes } from './farmingOpCodes';

export type DistributorConfig = {
  admin: Address;
  merkleRoots: Cell;
  userDistributorCode: Cell;
};

export const DictionaryMerkleRoot: DictionaryValue<bigint> = {
  serialize(src, builder) {
    builder.storeUint(src, 256);
  },
  parse(src) {
    return src.loadUintBig(256);
  },
};

export function distributorConfigToCell(config: DistributorConfig): Cell {
  return (
    beginCell()
      // .storeUint(0, 2)
      .storeAddress(config.admin)
      .storeRef(config.userDistributorCode)
      .storeRef(config.merkleRoots)
      .endCell()
  );
}

export type DistributorEntry = {
  farmingID: bigint;
  positionID: bigint;
  distributorJettonWallet: Address;
  recipient: Address;
  amount: bigint;
};

export const distributorEntryValue = {
  serialize: (src: DistributorEntry, buidler: Builder) => {
    buidler
      .storeUint(src.farmingID, 32)
      .storeUint(src.positionID, 128)
      .storeAddress(src.distributorJettonWallet)
      .storeAddress(src.recipient)
      .storeCoins(src.amount);
  },
  parse: (src: Slice) => ({
    farmingID: BigInt(src.loadUint(32)),
    positionID: BigInt(src.loadUint(128)),
    distributorJettonWallet: src.loadAddress(),
    recipient: src.loadAddress(),
    amount: src.loadCoins(),
  }),
};

export function generateEntriesDictionary(
  entries: DistributorEntry[]
): Dictionary<bigint, DistributorEntry> {
  const dict: Dictionary<bigint, DistributorEntry> = Dictionary.empty(
    Dictionary.Keys.BigUint(256),
    distributorEntryValue
  );

  for (let i = 0; i < entries.length; i++) {
    dict.set(BigInt(i), entries[i]);
  }

  return dict;
}

export class Distributor implements Contract {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell } // eslint-disable-next-line no-empty-function
  ) {}

  static createFromAddress(address: Address) {
    return new Distributor(address);
  }

  static createFromConfig(
    config: DistributorConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = distributorConfigToCell(config);
    const init = { code, data };
    return new Distributor(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(DistributorContractOpcodes.DISTRIBUTOR_OPERATION_DEPLOY, 32)
        .storeUint(0, 64)
        .endCell(),
    });
  }

  async sendUpdateMerkleRoot(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    farmingID: bigint,
    newMerkleRoot: bigint
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(
          DistributorContractOpcodes.DISTRIBUTOR_OPERATION_UPDATE_MERKLE_ROOT,
          32
        ) // op
        .storeUint(0, 64) // query_id
        .storeUint(farmingID, 32)
        .storeUint(newMerkleRoot, 256)
        .endCell(),
    });
  }

  async getMerkleRoot(provider: ContractProvider, farmingID: bigint) {
    const { stack } = await provider.get('get_merkle_root', [
      { type: 'int', value: farmingID },
    ]);

    return stack.readBigNumber();
  }

  async getAdmin(provider: ContractProvider) {
    const { stack } = await provider.get('get_admin', []);

    return stack.readAddress();
  }

  async getUserDistributorAddress(
    provider: ContractProvider,
    proofCellHash: bigint,
    index: bigint,
    farmingID: bigint,
    positionID: bigint
  ) {
    const { stack } = await provider.get('get_user_distributor_address', [
      { type: 'int', value: proofCellHash },
      { type: 'int', value: index },
      { type: 'int', value: farmingID },
      { type: 'int', value: positionID },
    ]);
    return stack.readAddress();
  }
}
