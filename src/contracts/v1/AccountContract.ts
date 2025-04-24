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

/** Initial data structures and settings **/
export type AccountContractConfig = {
  user: Address;
  pool: Address;
  stored0: bigint;
  stored1: bigint;

  /** Well... **/
  enough0: bigint;
  enough1: bigint;
};

export class AccountContract implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static accountContractConfigToCell(config: AccountContractConfig): Cell {
    return beginCell()
      .storeAddress(config.user)
      .storeAddress(config.pool)
      .storeRef(
        beginCell()
          .storeCoins(config.stored0)
          .storeCoins(config.stored1)
          .storeCoins(config.enough0)
          .storeCoins(config.enough1)
          .endCell()
      )
      .endCell();
  }

  static createFromConfig(
    config: AccountContractConfig,
    code: Cell,
    workchain = 0
  ) {
    const data = this.accountContractConfigToCell(config);
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
      .storeUint(ContractOpcodes.ACCOUNTV3_RESET_GAS, 32) // OP code
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
      .storeUint(ContractOpcodes.ACCOUNTV3_ADD_LIQUIDITY, 32) // OP code
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
    const msg_body = beginCell()
      .storeUint(ContractOpcodes.ACCOUNTV3_REFUND_ME, 32) // OP code
      .storeUint(0, 64) // query_id
      .endCell();

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msg_body,
    });
  }

  async refundMe(provider: ContractProvider, sender: Sender, value: bigint) {
    const msg_body = beginCell()
      .storeUint(ContractOpcodes.ACCOUNTV3_REFUND_ME, 32) // OP code
      .endCell();

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

      enought0: stack.readBigNumber(),
      enought1: stack.readBigNumber(),
    };
  }
}
