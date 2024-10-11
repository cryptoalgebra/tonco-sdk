// @ts-nocheck
import {
  Address,
  beginCell,
  Cell,
  toNano,
  SenderArguments,
  Builder,
  SendMode,
} from '@ton/ton';
import invariant from 'tiny-invariant';
import JSBI from 'jsbi';
import { crc32 } from 'crc';
import { Api, Trace } from 'tonapi-sdk-js';
import { ONE, ZERO } from '../constants/internalConstants';
import { Jetton, JettonAmount, Percent, Position } from '../entities';
import { ContractOpcodes } from '../contracts/opCodes';
import {
  pTON_MINTER,
  pTON_ROUTER_WALLET,
  ROUTER,
} from '../constants/addresses';
import { PoolV3Contract } from '../contracts/PoolV3Contract';
import { JettonWallet } from '../contracts/common/JettonWallet';
import { proxyWalletOpcodesV2 } from '../contracts/common/PTonWalletV2';
import { emulateMessage } from '../functions/emulateMessage';
import { WalletVersion } from '../types/WalletVersion';

export enum SwapType {
  TON_TO_JETTON = 0,
  JETTON_TO_TON = 1,
  JETTON_TO_JETTON = 2,
}

enum CollectType {
  TON = 0,
  JETTON = 1,
  TON_JETTON = 2,
  JETTON_TON = 3,
}

const getTonRefundAmount = (trace: Trace[]): bigint => {
  const isForked = trace.length > 1;
  const in_msg_0 = trace[0].transaction.in_msg;

  if (
    in_msg_0?.op_code === '0x0f8a7ea5' && // "jetton_transfer"
    in_msg_0?.destination?.address ===
      Address.parse(pTON_ROUTER_WALLET).toRawString()
  ) {
    return BigInt(in_msg_0.decoded_body.amount);
  }

  if (isForked) {
    const in_msg_1 = trace[1].transaction.in_msg;

    if (
      in_msg_1?.op_code === '0x0f8a7ea5' && // "jetton_transfer"
      in_msg_1?.destination?.address ===
        Address.parse(pTON_ROUTER_WALLET).toRawString()
    ) {
      return BigInt(in_msg_1.decoded_body.amount);
    }

    if (!trace[1].children && trace[0].children) {
      const childResult = getTonRefundAmount(trace[0].children);
      if (childResult !== BigInt(0)) {
        return childResult;
      }
    } else if (trace[1].children && !trace[0].children) {
      const childResult = getTonRefundAmount(trace[1].children);
      if (childResult !== BigInt(0)) {
        return childResult;
      }
    }
  } else {
    if (trace[0].children) {
      const childResult = getTonRefundAmount(trace[0].children);
      if (childResult !== BigInt(0)) {
        return childResult;
      }
    }
  }

  return BigInt(0);
};

function beginMessage(op: bigint | number | string): Builder {
  return beginCell()
    .storeUint(typeof op === 'string' ? crc32(op) : op, 32)
    .storeUint(BigInt(Math.floor(Math.random() * 2 ** 31)), 64);
}

export class PoolMessageManager {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static gasUsage = {
    TRANSFER_GAS: toNano(0.05),

    MINT_GAS: toNano(0.4),
    MINT_PART_GAS: toNano(0.2),
    MINT_GAS_LIMIT: toNano(0.61),

    SWAP_GAS_BASE: toNano(0.4),
    SWAP_GAS_SLIPPAGE: toNano(0.1),

    BURN_GAS: toNano(0.3),
    BURN_GAS_SLIPPAGE: toNano(0.05),
  };

  public static createMintMessage(
    routerJetton0Wallet: Address,
    routerJetton1Wallet: Address,
    userJetton0Wallet: Address,
    userJetton1Wallet: Address,
    position: Position,
    recipient: Address,
    slippage: Percent = new Percent(1, 100), // 1 %
    txFee: bigint = this.gasUsage.MINT_GAS,
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(2) // 2 maximum transfers per 1 msg
  ): SenderArguments[] {
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY');

    const mintPartGas = txFee / BigInt(2);
    const messages = [];

    const { amount0, amount1 } = position.mintAmounts;
    const isSorted = PoolV3Contract.orderJettonId(
      routerJetton0Wallet,
      routerJetton1Wallet
    );

    const jetton0Amount = isSorted
      ? BigInt(amount0.toString())
      : BigInt(amount1.toString());
    const jetton1Amount = isSorted
      ? BigInt(amount1.toString())
      : BigInt(amount0.toString());

    const slippageMultiplier = slippage.add(ONE);

    /* to transfer with slippage */
    const amount0WithSlippage = BigInt(
      slippageMultiplier.multiply(jetton0Amount.toString()).quotient.toString()
    );
    const amount1WithSlippage = BigInt(
      slippageMultiplier.multiply(jetton1Amount.toString()).quotient.toString()
    );

    const isJetton0TON = routerJetton0Wallet.equals(
      Address.parse(pTON_ROUTER_WALLET)
    );
    const isJetton1TON = routerJetton1Wallet.equals(
      Address.parse(pTON_ROUTER_WALLET)
    );

    let mintRequest0;
    let mintRequest1;

    mintRequest0 = beginCell()
      .storeUint(ContractOpcodes.POOLV3_FUND_ACCOUNT, 32) // Request to minting part 0
      .storeAddress(routerJetton1Wallet) // Jetton1 Wallet attached to Router is used to identify target token
      .storeCoins(jetton0Amount)
      .storeCoins(jetton1Amount)
      .storeUint(BigInt(position.liquidity.toString()), 128) // Liquidity. First transaction don't want actully to mint anything.
      .storeInt(BigInt(position.tickLower.toString()), 24) // Min tick.  Actually for the part 1 could be 0 it is ignored
      .storeInt(BigInt(position.tickUpper.toString()), 24) // Max tick.  Actually for the part 1 could be 0 it is ignored
      .endCell();

    mintRequest1 = beginCell()
      .storeUint(ContractOpcodes.POOLV3_FUND_ACCOUNT, 32) // Request to minting part 1
      .storeAddress(routerJetton0Wallet) // Jetton0 Wallet attached to Router is used to identify target token
      .storeCoins(jetton1Amount)
      .storeCoins(jetton0Amount)
      .storeUint(BigInt(position.liquidity.toString()), 128) // Liquidity to mint
      .storeInt(BigInt(position.tickLower.toString()), 24) // Min tick.
      .storeInt(BigInt(position.tickUpper.toString()), 24) // Max tick.
      .endCell();

    if (isJetton0TON) {
      mintRequest0 = beginCell()
        .storeUint(proxyWalletOpcodesV2.tonTransfer, 32)
        .storeUint(0, 64) // query_id
        .storeCoins(jetton0Amount) // ton To Send. It would we wrapped and then lp minted from them
        .storeAddress(recipient) // refundAddress
        .storeUint(1, 1) // flag that shows that paylod is a cell
        .storeRef(mintRequest0) // Instructions for the pool
        .endCell();
    }

    // isTON
    if (isJetton1TON) {
      mintRequest1 = beginCell()
        .storeUint(proxyWalletOpcodesV2.tonTransfer, 32)
        .storeUint(0, 64) // query_id
        .storeCoins(jetton1Amount) // ton To Send. It would we wrapped and then lp minted from them
        .storeAddress(recipient) // refundAddress
        .storeUint(1, 1) // flag that shows that paylod is a cell
        .storeRef(mintRequest1) // Instructions for the pool
        .endCell();
    }

    const payload0 = JettonWallet.transferMessage(
      amount0WithSlippage,
      Address.parse(ROUTER),
      recipient,
      new Cell(),
      forwardGas, // 0.1
      mintRequest0
    );

    const payload1 = JettonWallet.transferMessage(
      amount1WithSlippage,
      Address.parse(ROUTER),
      recipient,
      new Cell(),
      forwardGas, // 0.1
      mintRequest1
    );

    if (isJetton1TON && jetton1Amount > BigInt(0)) {
      messages.push({
        to: Address.parse(pTON_ROUTER_WALLET),
        value: jetton1Amount + mintPartGas + forwardGas,
        body: mintRequest1,
      });
    } else if (!isJetton1TON && jetton1Amount > BigInt(0)) {
      messages.push({
        to: userJetton1Wallet,
        value: mintPartGas + forwardGas, // 0.2 + 0.1
        body: payload1,
      });
    }

    if (isJetton0TON && jetton0Amount > BigInt(0)) {
      messages.push({
        to: Address.parse(pTON_ROUTER_WALLET),
        value: jetton0Amount + mintPartGas + forwardGas,
        body: mintRequest0,
      });
    } else if (!isJetton0TON && jetton0Amount > BigInt(0)) {
      messages.push({
        to: userJetton0Wallet,
        value: mintPartGas + forwardGas, // 0.2 + 0.1
        body: payload0,
      });
    }

    return messages;
  }

  public static async createEmulatedMintMessage(
    routerJetton0Wallet: Address,
    routerJetton1Wallet: Address,
    userJetton0Wallet: Address,
    userJetton1Wallet: Address,
    position: Position,
    recipient: Address,
    slippage: Percent = new Percent(1, 100), // 1 %
    client?: Api<unknown>, // ton api client
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.MINT_GAS;
    const forwardGas = this.gasUsage.TRANSFER_GAS * BigInt(2); // 0.1 // 2 maximum transfers per 1 msg

    let messages = this.createMintMessage(
      routerJetton0Wallet,
      routerJetton1Wallet,
      userJetton0Wallet,
      userJetton1Wallet,
      position,
      recipient,
      slippage
    );

    /* emulate message */
    if (client && wallet_public_key && walletVersion) {
      try {
        const emulation = await emulateMessage(
          client,
          messages,
          recipient.toString(),
          wallet_public_key,
          walletVersion
        );

        if (emulation) {
          const tonRevertedFromPool = emulation.event.actions.find(
            event => event.TonTransfer
          )?.TonTransfer?.amount;

          const emulatedGas = BigInt(Math.abs(emulation.event.extra));

          /* tx fee calc */
          if (tonRevertedFromPool) {
            txFee = emulatedGas - BigInt(tonRevertedFromPool || 0);
          } else {
            txFee = emulatedGas;
          }

          messages = this.createMintMessage(
            routerJetton0Wallet,
            routerJetton1Wallet,
            userJetton0Wallet,
            userJetton1Wallet,
            position,
            recipient,
            slippage,
            messages.length === 1 ? txFee * BigInt(2) : txFee,
            forwardGas
          );
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessages = {
      messages,
      txFee,
      forwardGas: forwardGas * BigInt(messages.length),
      gasLimit: txFee + forwardGas * BigInt(messages.length),
    };

    console.log('success emulation - ', emulatedMessages);

    return emulatedMessages;
  }

  public static createBurnMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    liquidityToBurn: bigint,
    txFee: bigint = this.gasUsage.BURN_GAS,
    forwardGas: bigint = BigInt(0) // gas slippage
  ): SenderArguments {
    const payload = beginCell()
      .storeUint(ContractOpcodes.POOLV3_START_BURN, 32) // op
      .storeUint(0, 64) // query id
      .storeUint(tokenId, 64)
      .storeUint(liquidityToBurn, 128)
      .storeInt(tickLower, 24)
      .storeInt(tickUpper, 24)
      .endCell();

    const message = {
      to: poolAddress,
      value: txFee + forwardGas,
      body: payload,
    };

    return message;
  }

  public static async createEmulatedBurnMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    liquidityToBurn: bigint,
    amount0: JettonAmount<Jetton> | undefined,
    amount1: JettonAmount<Jetton> | undefined,
    feeAmount0: JettonAmount<Jetton> | undefined,
    feeAmount1: JettonAmount<Jetton> | undefined,
    client?: Api<unknown>, // ton api client
    wallet?: string,
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.BURN_GAS; // 0.3
    let forwardGas = BigInt(0);

    let message = this.createBurnMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper,
      liquidityToBurn
    );

    const isJetton0TON =
      amount0 &&
      Address.parse(amount0.jetton.address).equals(Address.parse(pTON_MINTER));

    const isJetton1TON =
      amount1 &&
      Address.parse(amount1.jetton.address).equals(Address.parse(pTON_MINTER));

    const tonToBurn = isJetton0TON
      ? BigInt(amount0.quotient.toString()) +
        BigInt(feeAmount0?.quotient.toString() || 0)
      : isJetton1TON
      ? BigInt(amount1.quotient.toString()) +
        BigInt(feeAmount1?.quotient.toString() || 0)
      : BigInt(0);

    if (wallet && client && wallet_public_key && walletVersion) {
      try {
        const emulation = await emulateMessage(
          client,
          [message],
          wallet,
          wallet_public_key,
          walletVersion
        );

        if (emulation) {
          const emulatedGas = BigInt(Math.abs(emulation.event.extra));

          if (tonToBurn && tonToBurn > BigInt(0)) {
            const isOnlyTon =
              (isJetton0TON &&
                amount1?.quotient.toString() === '0' &&
                feeAmount1?.quotient.toString() === '0') ||
              (isJetton1TON &&
                amount0?.quotient.toString() === '0' &&
                feeAmount0?.quotient.toString() === '0');

            const tonRevertedFromPool = emulation.event.actions.find(
              event => event.TonTransfer
            )?.TonTransfer?.amount;

            txFee =
              tonToBurn +
              (txFee -
                BigInt(tonRevertedFromPool || 0) -
                (isOnlyTon ? -emulatedGas : emulatedGas));

            forwardGas = this.gasUsage.BURN_GAS_SLIPPAGE * BigInt(2); // 0.1
          } else {
            txFee = txFee - emulatedGas; // 0.3 - 0.25(approximately gas refund for tx)

            forwardGas = this.gasUsage.BURN_GAS_SLIPPAGE; // 0.05
          }

          message = this.createBurnMessage(
            poolAddress,
            tokenId,
            tickLower,
            tickUpper,
            liquidityToBurn,
            txFee,
            forwardGas
          );
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      forwardGas,
      gasLimit: txFee + forwardGas,
    };

    return emulatedMessage;
  }

  public static createCollectMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    txFee: bigint = this.gasUsage.BURN_GAS,
    forwardGas: bigint = BigInt(0) // gas slippage
  ): SenderArguments {
    const message = this.createBurnMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper,
      BigInt(0),
      txFee,
      forwardGas
    );

    return message;
  }

  public static async createEmulatedCollectMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    feeAmount0: JettonAmount<Jetton> | undefined,
    feeAmount1: JettonAmount<Jetton> | undefined,
    client?: Api<unknown>, // ton api client
    wallet?: string,
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.BURN_GAS; // 0.3
    let forwardGas = BigInt(0);

    let message = this.createCollectMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper
    );

    const isJetton0TON =
      feeAmount0 &&
      Address.parse(feeAmount0.jetton.address).equals(
        Address.parse(pTON_MINTER)
      );

    const isJetton1TON =
      feeAmount1 &&
      Address.parse(feeAmount1.jetton.address).equals(
        Address.parse(pTON_MINTER)
      );

    const collectType =
      (isJetton0TON &&
        feeAmount0.greaterThan('0') &&
        feeAmount1?.equalTo('0')) ||
      (isJetton1TON && feeAmount1.greaterThan('0') && feeAmount0?.equalTo('0'))
        ? CollectType.TON
        : (isJetton0TON &&
            feeAmount0.greaterThan('0') &&
            feeAmount1?.greaterThan('0')) ||
          (isJetton1TON &&
            feeAmount1.greaterThan('0') &&
            feeAmount0?.greaterThan('0'))
        ? CollectType.TON_JETTON
        : CollectType.JETTON;

    if (wallet && client && wallet_public_key && walletVersion) {
      try {
        const emulation = await emulateMessage(
          client,
          [message],
          wallet,
          wallet_public_key,
          walletVersion
        );

        if (emulation) {
          const emulatedGas = BigInt(Math.abs(emulation.event.extra));
          const tonRevertedFromPool = BigInt(
            emulation.event.actions.find(event => event.TonTransfer)
              ?.TonTransfer?.amount || 0
          );
          forwardGas = this.gasUsage.BURN_GAS_SLIPPAGE * BigInt(2); // 0.1

          const calculateTxWithTonFee = (
            amount: JettonAmount<Jetton>,
            mult: 1 | -1
          ) => {
            return (
              BigInt(amount.quotient.toString()) +
              (txFee - tonRevertedFromPool - emulatedGas * BigInt(mult))
            );
          };

          switch (collectType) {
            case CollectType.TON: // ..only TON
              if (feeAmount0?.greaterThan('0'))
                txFee = calculateTxWithTonFee(feeAmount0, -1);

              if (feeAmount1?.greaterThan('0'))
                txFee = calculateTxWithTonFee(feeAmount1, -1);

              break;

            case CollectType.TON_JETTON: // ..some TON + ..some Jetton
              if (isJetton0TON && feeAmount0?.greaterThan('0'))
                txFee = calculateTxWithTonFee(feeAmount0, 1);

              if (isJetton1TON && feeAmount1?.greaterThan('0'))
                txFee = calculateTxWithTonFee(feeAmount1, 1);

              break;

            case CollectType.JETTON: // only Jetton or Jetton + Jetton
              txFee = txFee - emulatedGas;
              forwardGas = this.gasUsage.BURN_GAS_SLIPPAGE; // 0.05
              break;

            default:
              break;
          }

          message = this.createCollectMessage(
            poolAddress,
            tokenId,
            tickLower,
            tickUpper,
            txFee,
            forwardGas
          );
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      forwardGas,
      gasLimit: txFee + forwardGas,
    };

    return emulatedMessage;
  }

  public static createSwapExactInMessage(
    userJettonWallet: Address,
    routerJettonWallet: Address,
    recipient: Address,
    amountIn: bigint,
    minimumAmountOut: bigint,
    priceLimitSqrt: bigint,
    swapType: SwapType,
    txFee: bigint = this.gasUsage.SWAP_GAS_BASE,
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(4) // 4 maximum messages in tx
  ): SenderArguments {
    let swapRequest;

    swapRequest = beginCell()
      .storeUint(ContractOpcodes.POOLV3_SWAP, 32) // Request to swap
      .storeAddress(routerJettonWallet) // JettonWallet attached to Router is used to identify target token
      .storeUint(priceLimitSqrt, 160) // Minimum/maximum price that we are ready to reach
      .storeCoins(minimumAmountOut) // Minimum amount to get back
      .storeAddress(recipient) // Address to recieve result of the swap
      .endCell();

    switch (swapType) {
      case SwapType.TON_TO_JETTON:
        swapRequest = beginMessage(proxyWalletOpcodesV2.tonTransfer)
          .storeCoins(amountIn) // ton amount
          .storeAddress(recipient) // refund address
          .storeUint(1, 1)
          .storeRef(swapRequest)
          .endCell();

        return {
          to: Address.parse(pTON_ROUTER_WALLET),
          value: amountIn + forwardGas,
          body: swapRequest,
        };

      default:
        const payload = JettonWallet.transferMessage(
          amountIn,
          Address.parse(ROUTER),
          recipient,
          new Cell(),
          txFee + this.gasUsage.SWAP_GAS_SLIPPAGE,
          swapRequest
        );

        return {
          to: userJettonWallet,
          value: txFee + forwardGas,
          body: payload,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        };
    }
  }

  public static async createEmulatedSwapExactInMessage(
    userJettonWallet: Address,
    routerJettonWallet: Address,
    recipient: Address,
    amountIn: bigint,
    minimumAmountOut: bigint,
    priceLimitSqrt: bigint,
    swapType: SwapType,
    client?: Api<unknown>, // ton api client
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.SWAP_GAS_BASE; // 0.3
    let forwardGas = this.gasUsage.TRANSFER_GAS * BigInt(4); // 0.2

    let message = this.createSwapExactInMessage(
      userJettonWallet,
      routerJettonWallet,
      recipient,
      amountIn,
      minimumAmountOut,
      priceLimitSqrt,
      swapType
    );

    /* emulate message */
    if (client && wallet_public_key && walletVersion) {
      try {
        const emulation = await emulateMessage(
          client,
          [message],
          recipient.toString(),
          wallet_public_key,
          walletVersion
        );

        if (emulation) {
          /* tx gas */
          const tonRevertedFromPool = BigInt(
            emulation.event.actions.find(event => event.TonTransfer)
              ?.TonTransfer?.amount || 0
          );

          const emulatedGas = BigInt(Math.abs(emulation.event.extra));

          forwardGas =
            BigInt(
              emulation.event.actions.filter(
                action =>
                  action.type === 'JettonTransfer' ||
                  action.type === 'TonTransfer'
              ).length + 1 // +1 for initial jetton transfer
            ) * this.gasUsage.TRANSFER_GAS;

          switch (swapType) {
            case SwapType.TON_TO_JETTON:
              txFee = emulatedGas; // forward gas in the base created message

              message = this.createSwapExactInMessage(
                userJettonWallet,
                routerJettonWallet,
                recipient,
                amountIn,
                minimumAmountOut,
                priceLimitSqrt,
                swapType,
                txFee,
                txFee + forwardGas
              );

              /* TODO: calc correct txFee */

              // if (tonRevertedFromPool) {
              //   txFee = amountIn - tonRevertedFromPool - emulatedGas;

              //   message = this.createSwapExactInMessage(
              //     userJettonWallet,
              //     routerJettonWallet,
              //     recipient,
              //     amountIn,
              //     minimumAmountOut,
              //     priceLimitSqrt,
              //     swapType,
              //     txFee,
              //     txFee + forwardGas
              //   );
              // }
              break;

            case SwapType.JETTON_TO_TON:
              const tonAmountOut = emulation.trace.children
                ? getTonRefundAmount(emulation.trace.children)
                : BigInt(0);

              console.log(tonAmountOut);

              txFee = tonAmountOut
                ? emulatedGas - (tonRevertedFromPool - tonAmountOut)
                : emulatedGas;

              message = this.createSwapExactInMessage(
                userJettonWallet,
                routerJettonWallet,
                recipient,
                amountIn,
                minimumAmountOut,
                priceLimitSqrt,
                swapType,
                txFee,
                forwardGas
              );
              break;

            case SwapType.JETTON_TO_JETTON:
              txFee = BigInt(Math.abs(emulation.event.extra));

              message = this.createSwapExactInMessage(
                userJettonWallet,
                routerJettonWallet,
                recipient,
                amountIn,
                minimumAmountOut,
                priceLimitSqrt,
                swapType,
                txFee,
                forwardGas
              );
              break;
          }
          console.log('success emulation - ', emulation);
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee: txFee,
      forwardGas,
      gasLimit: txFee + forwardGas,
    };

    return emulatedMessage;
  }
}
