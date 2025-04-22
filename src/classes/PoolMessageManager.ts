import {
  Address,
  beginCell,
  toNano,
  SenderArguments,
  Builder,
  SendMode,
  Cell,
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
import { RouterVersion } from '../types/RouterVersion';

export enum SwapType {
  TON_TO_JETTON = 0,
  JETTON_TO_TON = 1,
  JETTON_TO_JETTON = 2,
}

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
    routerVersion: RouterVersion = RouterVersion.v1
  ): SenderArguments {
    const payload = PoolFactoryContract[routerVersion].deployPoolMessage(
      jetton0Minter,
      jetton1Minter,
      sqrtPriceX96,
      settings,
      jetton0Wallet,
      jetton1Wallet
    );

    const message = {
      to:
        routerVersion === RouterVersion.v2
          ? Address.parse(POOL_FACTORY[RouterVersion.v2])
          : Address.parse(POOL_FACTORY[RouterVersion.v1]),
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
    routerVersion: RouterVersion = RouterVersion.v1,
    txFee: bigint = this.gasUsage.MINT_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(2) // 0.1 // 2 maximum transfers per 1 msg
  ): SenderArguments[] {
    invariant(JSBI.greaterThan(position.liquidity, ZERO), 'ZERO_LIQUIDITY');

    const mintPartGas = txFee / BigInt(2);
    const messages = [];

    const { amount0, amount1 } = position.mintAmounts;
    const isSorted = PoolContract[routerVersion].orderJettonId(
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
      Address.parse(pTON_ROUTER_WALLET[routerVersion])
    );
    const isJetton1TON = routerJetton1Wallet.equals(
      Address.parse(pTON_ROUTER_WALLET[routerVersion])
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
      Address.parse(ROUTER[routerVersion]),
      recipient,
      null,
      forwardGas, // 0.1
      mintRequest0 as Cell,
      queryId
    );

    const payload1 = JettonWallet.transferMessage(
      amount1WithSlippage,
      Address.parse(ROUTER[routerVersion]),
      recipient,
      null,
      forwardGas, // 0.1
      mintRequest1 as Cell,
      queryId
    );

    if (isJetton1TON && amount1WithSlippage > BigInt(0)) {
      messages.push({
        to: Address.parse(pTON_ROUTER_WALLET[routerVersion]),
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
        to: Address.parse(pTON_ROUTER_WALLET[routerVersion]),
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
    routerVersion: RouterVersion = RouterVersion.v1
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
      routerVersion
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
    jettonPath: Address[], // path of jetton attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountsOut: bigint[],
    priceLimitsSqrt: bigint[],
    jettonsAreInOrder: boolean[],
    swapTypes: SwapType[],
    txFee: bigint = this.gasUsage.SWAP_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS *
      BigInt(4 * minimumAmountsOut.length), // TODO
    isMainCell: boolean,
    hops: bigint,
    pathString: string,
    routerVersion: RouterVersion = RouterVersion.v1
  ) {
    if (!jettonPath.length) return new Cell();

    const jettonRouterWallet = jettonPath.shift();

    const priceLimitSqrt = priceLimitsSqrt.shift();
    const minimumAmountOut = minimumAmountsOut.shift();

    const isEmpty = !jettonPath.length;
    const isPTON = jettonRouterWallet?.equals(
      Address.parse(pTON_ROUTER_WALLET[routerVersion])
    );

    const getInnerMessage = (isEmpty: boolean, isPTON: boolean) => {
      if (isEmpty) return null;

      const innerMessage = beginCell()
        .storeAddress(
          isPTON ? jettonRouterWallet : Address.parse(ROUTER[routerVersion])
        )
        .storeCoins(
          this.gasUsage.SWAP_GAS + this.gasUsage.TRANSFER_GAS * BigInt(2)
        )
        .storeRef(
          this.createMultihopHops(
            jettonPath,
            recipient,
            amountIn,
            minimumAmountsOut,
            priceLimitsSqrt,
            jettonsAreInOrder,
            swapTypes,
            txFee,
            forwardGas,
            false,
            hops,
            pathString
          )
        );

      if (isMainCell) {
        innerMessage.storeCoins(0).storeRef(
          beginCell()
            .storeUint(0, 32)
            .storeStringTail(
              `Multihop | ${(crypto as any).randomUUID()} | ${hops} | ${pathString}`
            )
            .endCell()
        );
      }

      innerMessage.endCell();

      return innerMessage;
    };

    const multicallMessage = beginCell()
      .storeUint(ContractOpcodes.POOLV3_SWAP, 32)
      .storeAddress(jettonRouterWallet)
      .storeUint(priceLimitSqrt || BigInt(0), 160)
      .storeCoins(minimumAmountOut || BigInt(0))
      .storeAddress(recipient)
      .storeMaybeRef(getInnerMessage(isEmpty, Boolean(isPTON)))
      .endCell();

    return multicallMessage;
  }

  public static createSwapExactInMultihopMessage(
    userJettonWallet: Address, // input jetton wallet attached to user
    jettonPath: Address[], // path of jetton attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountsOut: bigint[],
    priceLimitsSqrt: bigint[],
    jettonsAreInOrder: boolean[],
    swapTypes: SwapType[],
    routerVersion: RouterVersion = RouterVersion.v1,
    txFee: bigint = this.gasUsage.SWAP_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS *
      BigInt(4 * swapTypes.length)
  ) {
    const initialSwapType = swapTypes[0];
    const hops = BigInt(swapTypes.length);
    const pathString = [
      userJettonWallet.toRawString(),
      ...jettonPath.map(address => address.toRawString()),
    ].join('-');

    if (jettonPath.length === 1)
      return this.createSwapExactInMessage(
        userJettonWallet,
        jettonPath[0],
        recipient,
        amountIn,
        minimumAmountsOut[0],
        priceLimitsSqrt[0],
        initialSwapType,
        routerVersion,
        txFee,
        forwardGas
      );

    const multihopRequest = PoolMessageManager.createMultihopHops(
      jettonPath,
      recipient,
      amountIn,
      minimumAmountsOut,
      priceLimitsSqrt,
      jettonsAreInOrder,
      swapTypes,
      txFee,
      forwardGas,
      true,
      hops,
      pathString
    );

    switch (initialSwapType) {
      case SwapType.TON_TO_JETTON:
        const swapRequest = beginMessage(proxyWalletOpcodesV2.tonTransfer)
          .storeCoins(amountIn) // ton amount
          .storeAddress(recipient) // refund address
          .storeUint(1, 1)
          .storeRef(multihopRequest)
          .endCell();

        return {
          to: Address.parse(pTON_ROUTER_WALLET[routerVersion]),
          value:
            amountIn +
            BigInt(2) * this.gasUsage.SWAP_GAS +
            this.gasUsage.TRANSFER_GAS * BigInt(3),
          body: swapRequest,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        };

      default:
        const payload = JettonWallet.transferMessage(
          amountIn,
          Address.parse(ROUTER[routerVersion]),
          recipient,
          null,
          BigInt(2) * this.gasUsage.SWAP_GAS +
            this.gasUsage.TRANSFER_GAS * BigInt(4),
          multihopRequest
        );

        return {
          to: userJettonWallet,
          value:
            BigInt(2) * this.gasUsage.SWAP_GAS +
            this.gasUsage.TRANSFER_GAS * BigInt(5),
          body: payload,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
        };
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
    routerVersion: RouterVersion = RouterVersion.v1,
    txFee: bigint = this.gasUsage.SWAP_GAS, // 0.4
    forwardGas: bigint = this.gasUsage.TRANSFER_GAS * BigInt(4) // 4 maximum messages in tx = 0.2
  ): SenderArguments {
    let swapRequest;

    swapRequest = beginCell()
      .storeUint(ContractOpcodes.POOLV3_SWAP, 32) // Request to swap
      .storeAddress(routerJettonWallet) // JettonWallet attached to Router is used to identify target token
      .storeUint(priceLimitSqrt, 160) // Minimum/maximum price that we are ready to reach
      .storeCoins(minimumAmountOut) // Minimum amount to get back
      .storeAddress(recipient) // Address to receive result of the swap
      .storeUint(0, 1) // Payload Maybe Ref // Address to recieve result of the swap
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
          to: Address.parse(pTON_ROUTER_WALLET[routerVersion]),
          value: amountIn + txFee + forwardGas, // ton amountIn + 0.4 + 0.2
          body: swapRequest,
        };

      default:
        const payload = JettonWallet.transferMessage(
          amountIn,
          Address.parse(ROUTER[routerVersion]),
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
    walletVersion?: WalletVersion,
    routerVersion: RouterVersion = RouterVersion.v1
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
      swapType,
      routerVersion
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
        swapType === SwapType.TON_TO_JETTON
          ? message.value - amountIn
          : message.value,
    };

    return emulatedMessage;
  }

  public static async createEmulatedSwapMultihopMessage(
    userJettonWallet: Address, // input jetton wallet attached to user
    jettonPath: Address[], // path of jetton attached to router
    recipient: Address,
    amountIn: bigint,
    minimumAmountsOut: bigint[],
    priceLimitsSqrt: bigint[],
    jettonsAreInOrder: boolean[],
    swapTypes: SwapType[],
    client?: Api<unknown>, // ton api client
    wallet_public_key?: string,
    walletVersion?: WalletVersion,
    routerVersion: RouterVersion = RouterVersion.v1
  ) {
    const initialSwapType = swapTypes[0];
    const hops = BigInt(swapTypes.length);

    let txFee = this.gasUsage.SWAP_GAS * hops; // 0.4 * number of hops

    const message = this.createSwapExactInMultihopMessage(
      userJettonWallet,
      jettonPath,
      recipient,
      amountIn,
      minimumAmountsOut,
      priceLimitsSqrt,
      jettonsAreInOrder,
      swapTypes,
      routerVersion
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
        initialSwapType === SwapType.TON_TO_JETTON
          ? message.value - amountIn
          : message.value,
    };

    return emulatedMessage;
  }
}
