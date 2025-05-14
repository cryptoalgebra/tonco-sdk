import {
  Address,
  beginCell,
  toNano,
  SenderArguments,
  Builder,
  SendMode,
  Cell,
  Slice,
} from '@ton/ton';
import invariant from 'tiny-invariant';
import JSBI from 'jsbi';
import { crc32 } from 'crc';
import { Api } from 'tonapi-sdk-js';
import { ONE, ZERO } from '../constants/internalConstants';
import { Percent, Position } from '../entities';
import { ContractOpcodes } from '../contracts/v1/opCodes';
import {
  POOL_FACTORY,
  pTON_ROUTER_WALLET,
  ROUTER,
} from '../constants/addresses';
import { JettonWallet } from '../contracts/common/JettonWallet';
import { proxyWalletOpcodesV2 } from '../contracts/common/PTonWalletV2';
import { emulateMessage } from '../functions/emulateMessage';
import { WalletVersion } from '../types/WalletVersion';
import { PoolContract, PoolFactoryContract } from '../contracts';
import { DEX_VERSION } from '../types/DexVersion';
import { RouterContract } from '../contracts/v1.5';

export enum SwapType {
  TON_TO_JETTON_V1 = 'TON_TO_JETTON_V1',
  JETTON_TO_TON_V1 = 'JETTON_TO_TON_V1',
  JETTON_TO_JETTON_V1 = 'JETTON_TO_JETTON_V1',

  TON_TO_JETTON_V1_5 = 'TON_TO_JETTON_V1_5',
  JETTON_TO_TON_V1_5 = 'JETTON_TO_TON_V1_5',
  JETTON_TO_JETTON_V1_5 = 'JETTON_TO_JETTON_V1_5',
}

function buildTonTransferMessage(opts: {
  tonAmount: bigint;
  refundAddress: Address | null;
  fwdPayload: Cell | Slice;
  noPayloadOverride?: boolean; // only used to test refund
}) {
  let msg_builder = beginCell()
    .storeUint(proxyWalletOpcodesV2.tonTransfer, 32)
    .storeUint(0, 64) // query_id
    .storeCoins(opts.tonAmount) // ton To Send. It would we wrapped and then lp minted from them
    .storeAddress(opts.refundAddress);

  if (!opts.noPayloadOverride) {
    if (opts.fwdPayload instanceof Cell) {
      msg_builder = msg_builder
        .storeUint(1, 1) // flag that shows that payload is a cell
        .storeRef(opts.fwdPayload); // Payload Instructions for the reciever
    } else {
      msg_builder = msg_builder.storeUint(0, 1).storeSlice(opts.fwdPayload);
    }
  }
  return msg_builder.endCell();
}

export class PoolMessageManager {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static gasUsage = {
    TRANSFER_GAS: toNano(0.05),

    MINT_GAS: toNano(0.4),

    SWAP_GAS: toNano(0.4),
    SWAP_GAS_SLIPPAGE: toNano(0.1),

    BURN_GAS: toNano(0.3),
    BURN_GAS_SLIPPAGE: toNano(0.1),

    DEPLOY_POOL_GAS: toNano(0.2),
  };

  public static createDeployPoolMessage(
    jetton0Minter: Address,
    jetton1Minter: Address,
    sqrtPriceX96: bigint,
    settings: bigint,
    jetton0Wallet: Address,
    jetton1Wallet: Address,
    dexVersion: DEX_VERSION = DEX_VERSION.v1
  ): SenderArguments {
    const payload = PoolFactoryContract[dexVersion].deployPoolMessage(
      jetton0Minter,
      jetton1Minter,
      sqrtPriceX96,
      settings,
      jetton0Wallet,
      jetton1Wallet
    );

    const message = {
      to:
        dexVersion === DEX_VERSION['v1.5']
          ? Address.parse(POOL_FACTORY[DEX_VERSION['v1.5']])
          : Address.parse(POOL_FACTORY[DEX_VERSION.v1]),
      value: this.gasUsage.DEPLOY_POOL_GAS,
      body: payload,
    };

    return message;
  }

  public static createMintMessage(
    routerJetton0Wallet: Address,
    routerJetton1Wallet: Address,
    userJetton0Wallet: Address,
    userJetton1Wallet: Address,
    position: Position,
    recipient: Address,
    slippage: Percent = new Percent(1, 100), // 1 %
    queryId: number | bigint = 0,
    referral: string | undefined = undefined,
    dexVersion: DEX_VERSION = DEX_VERSION.v1,
    txFee: bigint = this.gasUsage.MINT_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(2) // 0.1 // 2 maximum transfers per 1 msg
  ): SenderArguments[] {
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY');

    const mintPartGas = txFee / BigInt(2);
    const messages = [];

    const { amount0, amount1 } = position.mintAmounts;
    const isSorted = PoolContract[dexVersion].orderJettonId(
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
      Address.parse(pTON_ROUTER_WALLET[dexVersion])
    );
    const isJetton1TON = routerJetton1Wallet.equals(
      Address.parse(pTON_ROUTER_WALLET[dexVersion])
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
      .storeInt(BigInt(position.tickUpper.toString()), 24); // Max tick.  Actually for the part 1 could be 0 it is ignored

    if (referral) {
      mintRequest0.storeMaybeRef(
        beginCell()
          .storeUint(0, 32)
          .storeStringTail(referral)
          .endCell()
      );
    }

    mintRequest0.endCell();

    mintRequest1 = beginCell()
      .storeUint(ContractOpcodes.POOLV3_FUND_ACCOUNT, 32) // Request to minting part 1
      .storeAddress(routerJetton0Wallet) // Jetton0 Wallet attached to Router is used to identify target token
      .storeCoins(jetton1Amount)
      .storeCoins(jetton0Amount)
      .storeUint(BigInt(position.liquidity.toString()), 128) // Liquidity to mint
      .storeInt(BigInt(position.tickLower.toString()), 24) // Min tick.
      .storeInt(BigInt(position.tickUpper.toString()), 24); // Max tick.

    if (referral) {
      mintRequest1.storeMaybeRef(
        beginCell()
          .storeUint(0, 32)
          .storeStringTail(referral)
          .endCell()
      );
    }

    mintRequest1.endCell();

    if (isJetton0TON) {
      mintRequest0 = beginCell()
        .storeUint(proxyWalletOpcodesV2.tonTransfer, 32)
        .storeUint(queryId, 64) // query_id
        .storeCoins(amount0WithSlippage) // ton To Send. It would we wrapped and then lp minted from them
        .storeAddress(recipient) // refundAddress
        .storeUint(1, 1) // flag that shows that paylod is a cell
        .storeRef(mintRequest0) // Instructions for the pool
        .endCell();
    }

    // isTON
    if (isJetton1TON) {
      mintRequest1 = beginCell()
        .storeUint(proxyWalletOpcodesV2.tonTransfer, 32)
        .storeUint(queryId, 64) // query_id
        .storeCoins(amount1WithSlippage) // ton To Send. It would we wrapped and then lp minted from them
        .storeAddress(recipient) // refundAddress
        .storeUint(1, 1) // flag that shows that paylod is a cell
        .storeRef(mintRequest1) // Instructions for the pool
        .endCell();
    }

    const payload0 = JettonWallet.transferMessage(
      amount0WithSlippage,
      Address.parse(ROUTER[dexVersion]),
      recipient,
      null,
      forwardGas, // 0.1
      mintRequest0 as Cell,
      queryId
    );

    const payload1 = JettonWallet.transferMessage(
      amount1WithSlippage,
      Address.parse(ROUTER[dexVersion]),
      recipient,
      null,
      forwardGas, // 0.1
      mintRequest1 as Cell,
      queryId
    );

    if (isJetton1TON && amount1WithSlippage > BigInt(0)) {
      messages.push({
        to: Address.parse(pTON_ROUTER_WALLET[dexVersion]),
        value: amount1WithSlippage + mintPartGas + forwardGas, // ton with slippage + 0.2 + 0.1
        body: mintRequest1 as Cell,
      });
    } else if (!isJetton1TON && jetton1Amount > BigInt(0)) {
      messages.push({
        to: userJetton1Wallet,
        value: mintPartGas + forwardGas, // 0.2 + 0.1
        body: payload1,
      });
    }

    if (isJetton0TON && amount0WithSlippage > BigInt(0)) {
      messages.push({
        to: Address.parse(pTON_ROUTER_WALLET[dexVersion]),
        value: amount0WithSlippage + mintPartGas + forwardGas, // ton with slippage + 0.2 + 0.1
        body: mintRequest0 as Cell,
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
    queryId: number | bigint = 0,
    referral?: string,
    client?: Api<unknown>, // ton api client
    wallet_public_key?: string,
    walletVersion?: WalletVersion,
    dexVersion: DEX_VERSION = DEX_VERSION.v1
  ) {
    let txFee = this.gasUsage.MINT_GAS; // 0.4

    const messages = this.createMintMessage(
      routerJetton0Wallet,
      routerJetton1Wallet,
      userJetton0Wallet,
      userJetton1Wallet,
      position,
      recipient,
      slippage,
      queryId,
      referral,
      dexVersion
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
          txFee = emulatedGas - BigInt(tonRevertedFromPool || 0);
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessages = {
      messages,
      txFee,
      gasLimit: messages.length === 1 ? toNano(0.3) : toNano(0.6),
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
    txFee: bigint = this.gasUsage.BURN_GAS
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
      value: txFee,
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
    client?: Api<unknown>, // ton api client
    wallet?: string,
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.BURN_GAS; // 0.3

    const message = this.createBurnMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper,
      liquidityToBurn
    );

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
          txFee = txFee - emulatedGas; // 0.3 - 0.25(approximately gas refund for tx)
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      gasLimit: message.value,
    };

    return emulatedMessage;
  }

  public static createCollectMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    txFee: bigint = this.gasUsage.BURN_GAS
  ): SenderArguments {
    const message = this.createBurnMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper,
      BigInt(0),
      txFee
    );

    return message;
  }

  public static async createEmulatedCollectMessage(
    poolAddress: Address,
    tokenId: number,
    tickLower: number,
    tickUpper: number,
    client?: Api<unknown>, // ton api client
    wallet?: string,
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    let txFee = this.gasUsage.BURN_GAS; // 0.3
    const forwardGas = BigInt(0);

    const message = this.createCollectMessage(
      poolAddress,
      tokenId,
      tickLower,
      tickUpper
    );

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
          txFee = txFee - emulatedGas;
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      forwardGas,
      gasLimit: message.value,
    };

    return emulatedMessage;
  }

  public static createMultihopHops(
    routerJettonWallets: Address[], // path of output jetton wallets attached to router
    minimumAmountsOut: bigint[], // min amount out for each hop
    priceLimitsSqrt: bigint[], // price limit for each hop
    swapTypes: SwapType[],
    recipient: Address
  ) {
    if (routerJettonWallets.length < 1) {
      throw new Error('At least one hop is required');
    }

    if (
      routerJettonWallets.length !== minimumAmountsOut.length ||
      routerJettonWallets.length !== priceLimitsSqrt.length ||
      routerJettonWallets.length !== swapTypes.length
    ) {
      throw new Error('Invalid arguments length');
    }

    let payload: Cell = Cell.EMPTY;
    const lastHopIndex = routerJettonWallets.length - 1;

    for (let i = lastHopIndex; i >= 0; i--) {
      const routerJettonWallet = routerJettonWallets[i];
      const minimumAmountOut = minimumAmountsOut[i];
      const priceLimitSqrt = priceLimitsSqrt[i];

      const isLastHop = i === lastHopIndex;

      if (isLastHop) {
        payload = RouterContract.swapPayloadMessage(
          recipient,
          routerJettonWallet,
          priceLimitSqrt,
          minimumAmountOut
        );
        continue;
      }

      const nextSwapType = swapTypes[i + 1];

      const poolVersion = nextSwapType.endsWith('V1_5')
        ? DEX_VERSION['v1.5']
        : DEX_VERSION.v1;

      const isPTON =
        routerJettonWallet.equals(Address.parse(pTON_ROUTER_WALLET.v1)) ||
        routerJettonWallet.equals(Address.parse(pTON_ROUTER_WALLET['v1.5']));

      const targetAddress = isPTON
        ? pTON_ROUTER_WALLET[poolVersion]
        : ROUTER[poolVersion];

      const message = RouterContract.swapPayloadMessage(
        recipient,
        routerJettonWallet,
        priceLimitSqrt,
        minimumAmountOut,
        !isLastHop
          ? {
              targetAddress: Address.parse(targetAddress),
              okForwardAmount: toNano(1),
              okForwardPayload: payload,
              retForwardAmount: BigInt(0),
              retForwardPayload: Cell.EMPTY,
            }
          : undefined
      );

      payload = message;
    }

    return payload;
  }

  public static createSwapExactInMultihopMessage(
    userJettonWallet: Address, // input jetton wallet attached to user
    routerJettonWallets: Address[], // path of output jetton wallets attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountsOut: bigint[], // min amount out for each hop
    priceLimitsSqrt: bigint[], // price limit for each hop
    swapTypes: SwapType[],
    txFee: bigint = this.gasUsage.SWAP_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS *
      BigInt(4 * swapTypes.length)
  ) {
    const initialSwapType = swapTypes[0];

    if (routerJettonWallets.length === 1 && swapTypes.length === 1) {
      return this.createSwapExactInMessage(
        userJettonWallet,
        routerJettonWallets[0],
        recipient,
        amountIn,
        minimumAmountsOut[0],
        priceLimitsSqrt[0],
        initialSwapType,
        txFee,
        forwardGas
      );
    }

    const multihopRequest = this.createMultihopHops(
      routerJettonWallets,
      minimumAmountsOut,
      priceLimitsSqrt,
      swapTypes,
      recipient
    );

    switch (initialSwapType) {
      case SwapType.TON_TO_JETTON_V1:
      case SwapType.TON_TO_JETTON_V1_5: {
        const version =
          initialSwapType === SwapType.TON_TO_JETTON_V1
            ? DEX_VERSION.v1
            : DEX_VERSION['v1.5'];

        const swapRequest = buildTonTransferMessage({
          tonAmount: amountIn,
          refundAddress: recipient,
          fwdPayload: multihopRequest,
        });

        return {
          to: Address.parse(pTON_ROUTER_WALLET[version]),
          value:
            amountIn +
            BigInt(2) * toNano(1.0) +
            this.gasUsage.TRANSFER_GAS * BigInt(3),
          body: swapRequest,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        };
      }

      default: {
        const version =
          initialSwapType === SwapType.JETTON_TO_TON_V1 ||
          initialSwapType === SwapType.JETTON_TO_JETTON_V1
            ? DEX_VERSION.v1
            : DEX_VERSION['v1.5'];

        const payload = JettonWallet.transferMessage(
          amountIn,
          Address.parse(ROUTER[version]),
          recipient,
          null,
          BigInt(2) * toNano(1.0) +
            PoolMessageManager.gasUsage.TRANSFER_GAS * BigInt(1),
          multihopRequest
        );

        return {
          to: userJettonWallet,
          value:
            BigInt(2) * toNano(1.0) + this.gasUsage.TRANSFER_GAS * BigInt(3),
          body: payload,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        };
      }
    }
  }

  public static createSwapExactInMessage(
    userJettonWallet: Address, // input jetton wallet attached to user
    routerJettonWallet: Address, // output jetton wallet attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountOut: bigint,
    priceLimitSqrt: bigint,
    swapType: SwapType,
    txFee: bigint = this.gasUsage.SWAP_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(4) // 4 maximum messages in tx = 0.2
  ): SenderArguments {
    let swapRequest;
    let dexVersion: DEX_VERSION;

    swapRequest = beginCell()
      .storeUint(ContractOpcodes.POOLV3_SWAP, 32) // Request to swap
      .storeAddress(routerJettonWallet) // JettonWallet attached to Router is used to identify target token
      .storeUint(priceLimitSqrt, 160) // Minimum/maximum price that we are ready to reach
      .storeCoins(minimumAmountOut) // Minimum amount to get back
      .storeAddress(recipient) // Address to receive result of the swap
      .storeUint(0, 1) // Payload Maybe Ref // Address to recieve result of the swap
      .endCell();

    switch (swapType) {
      case SwapType.TON_TO_JETTON_V1:
      case SwapType.TON_TO_JETTON_V1_5:
        swapRequest = buildTonTransferMessage({
          tonAmount: amountIn,
          refundAddress: recipient,
          fwdPayload: swapRequest,
        });

        dexVersion = swapType.endsWith('V1_5')
          ? DEX_VERSION['v1.5']
          : DEX_VERSION.v1;

        return {
          to: Address.parse(pTON_ROUTER_WALLET[dexVersion]),
          value: amountIn + txFee + forwardGas, // ton amountIn + 0.4 + 0.2
          body: swapRequest,
        };

      default:
        dexVersion = swapType.endsWith('V1_5')
          ? DEX_VERSION['v1.5']
          : DEX_VERSION.v1;

        const payload = JettonWallet.transferMessage(
          amountIn,
          Address.parse(ROUTER[dexVersion]),
          recipient,
          null,
          txFee + this.gasUsage.SWAP_GAS_SLIPPAGE,
          swapRequest
        );

        return {
          to: userJettonWallet,
          value: txFee + forwardGas, // 0.4 + 0.2
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
    let txFee = this.gasUsage.SWAP_GAS; // 0.4
    const forwardGas = this.gasUsage.TRANSFER_GAS * BigInt(4); // 0.2

    const message = this.createSwapExactInMessage(
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
          const emulatedGas = BigInt(Math.abs(emulation.event.extra));
          txFee = emulatedGas;
          console.log('success emulation - ', emulation);
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      forwardGas,
      gasLimit:
        swapType === SwapType.TON_TO_JETTON_V1 ||
        swapType === SwapType.TON_TO_JETTON_V1_5
          ? message.value - amountIn
          : message.value,
    };

    return emulatedMessage;
  }

  public static async createEmulatedSwapMultihopMessage(
    userJettonWallet: Address, // input jetton wallet attached to user
    routerJettonWallets: Address[], // path of jetton attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountsOut: bigint[],
    priceLimitsSqrt: bigint[],
    swapTypes: SwapType[],
    client?: Api<unknown>, // ton api client
    wallet_public_key?: string,
    walletVersion?: WalletVersion
  ) {
    const initialSwapType = swapTypes[0];
    const hops = BigInt(swapTypes.length);

    let txFee = this.gasUsage.SWAP_GAS * hops; // 0.4 * number of hops

    const message = this.createSwapExactInMultihopMessage(
      userJettonWallet,
      routerJettonWallets,
      recipient,
      amountIn,
      minimumAmountsOut,
      priceLimitsSqrt,
      swapTypes
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
          const emulatedGas = BigInt(Math.abs(emulation.event.extra));
          txFee = emulatedGas;
          console.log('success emulation - ', emulation);
        }
      } catch (e) {
        console.log('error emulation - ', e);
      }
    }

    const emulatedMessage = {
      message,
      txFee,
      gasLimit:
        initialSwapType === SwapType.TON_TO_JETTON_V1 ||
        initialSwapType === SwapType.TON_TO_JETTON_V1_5
          ? message.value - amountIn
          : message.value,
    };

    return emulatedMessage;
  }
}
