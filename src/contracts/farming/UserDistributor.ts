import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  toNano,
} from '@ton/core';

export type UserDistributorConfig = {
  distributor: Address;
  proofHash: bigint;
  index: bigint;
  farmingID: bigint;
  positionID: bigint;
};

export function distributorHelperConfigToCell(
  config: UserDistributorConfig,
): Cell {
  return beginCell()
    .storeBit(false)
    .storeAddress(config.distributor)
    .storeUint(config.proofHash, 256)
    .storeUint(config.index, 256)
    .storeUint(config.farmingID, 32)
    .storeUint(config.positionID, 128)
    .endCell();
}

export class UserDistributor implements Contract {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
    // eslint-disable-next-line no-empty-function
  ) {}

  static createFromAddress(address: Address) {
    return new UserDistributor(address);
  }

  static createFromConfig(
    config: UserDistributorConfig,
    code: Cell,
    workchain = 0,
  ) {
    const data = distributorHelperConfigToCell(config);
    const init = { code, data };
    return new UserDistributor(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender) {
    await provider.internal(via, {
      value: toNano('0.15'),
    });
  }

  async sendClaim(
    provider: ContractProvider,
    queryId: bigint,
    index: bigint,
    proof: Cell,
  ) {
    await provider.external(
      beginCell()
        .storeUint(queryId, 64)
        .storeUint(index, 256)
        .storeRef(proof)
        .endCell(),
    );
  }

  // async getLastProofHash(provider: ContractProvider) {
  //     const stack = (await provider.get('get_claimed', [])).stack;

  //     return stack.readBoolean();
  // }

  async getClaimed(provider: ContractProvider): Promise<boolean> {
    if ((await provider.getState()).state.type === 'uninit') {
      return false;
    }
    const stack = (await provider.get('get_claimed', [])).stack;
    return stack.readBoolean();
  }
}
