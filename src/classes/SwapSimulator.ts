import JSBI from 'jsbi';
import { LiquidityMath, TickMath } from '../utils';
import { SwapMath } from '../utils/swapMath';
import {
  Tick,
  TickConstructorArgs,
  TickDataProvider,
  TickListDataProvider,
} from '../entities';

interface StepComputations {
  sqrtPriceStartX96: bigint;
  tickNext: number;
  initialized: boolean;
  sqrtPriceNextX96: bigint;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
}

interface SwapState {
  amountSpecifiedRemaining: bigint,
  amountCalculated: bigint,
  sqrtPriceX96: bigint,
  tick: number,
  liquidity: bigint,
};

/**
 * Construct a swap simulator
 * @param sqrtRatioX96 The sqrt of the current ratio of amounts of token1 to token0
 * @param tickCurrent The current tick of the pool
 * @param tickSpacing The spacing between ticks
 * @param liquidity The current value of in range liquidity
 * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
 * @param ticks The current state of the pool ticks or a data provider that can return tick data
 */
export class SwapSimulator {
  public readonly sqrtRatioX96: bigint;
  public readonly tickCurrent: number;
  public readonly tickSpacing: number;
  public readonly liquidity: bigint;
  public readonly fee: number;
  public readonly ticks: TickDataProvider;

  constructor(
    sqrtRatioX96: bigint,
    tickCurrent: number,
    tickSpacing: number,
    liquidity: bigint,
    fee: number,
    ticks: TickDataProvider | (Tick | TickConstructorArgs)[]
  ) {
    this.sqrtRatioX96 = sqrtRatioX96;
    this.tickCurrent = tickCurrent;
    this.tickSpacing = tickSpacing;
    this.liquidity = liquidity;
    this.fee = fee;
    this.ticks = Array.isArray(ticks)
      ? new TickListDataProvider(ticks, tickSpacing)
      : ticks;
  }

  /**
   * Given an input amount of a token, return the computed output amount
   * @param zeroForOne Whether the trade is zero for one
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  public async swapExactIn(
    zeroForOne: boolean,
    inputAmount: bigint,
    sqrtPriceLimitX96?: bigint
  ): Promise<bigint> {
    const newState = await this.swap(zeroForOne, inputAmount, sqrtPriceLimitX96);

    return -newState.amountCalculated;
  }

  /**
   * Given a desired output amount of a token, return the computed input amount
   * @param zeroForOne Whether the trade is zero for one
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  public async swapExactOut(
    zeroForOne: boolean,
    outputAmount: bigint,
    sqrtPriceLimitX96?: bigint
  ): Promise<bigint> {
    const newState = await this.swap(
      zeroForOne,
      -outputAmount,
      sqrtPriceLimitX96
    );

    return newState.amountCalculated;
  }

  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is token0 or token1
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   */
  public async swap(
    zeroForOne: boolean,
    amountSpecified: bigint,
    sqrtPriceLimitX96?: bigint
  ): Promise<SwapState> {    
     // keep track of swap state

    const state: SwapState = {
      amountSpecifiedRemaining: amountSpecified,
      amountCalculated: BigInt(0),
      sqrtPriceX96: this.sqrtRatioX96,
      tick: this.tickCurrent,
      liquidity: this.liquidity,
    };

    if (!sqrtPriceLimitX96) {
      sqrtPriceLimitX96 = zeroForOne
        ? BigInt(TickMath.MIN_SQRT_RATIO.toString()) + BigInt(1)
        : BigInt(TickMath.MAX_SQRT_RATIO.toString()) - BigInt(1);
    }

    if (zeroForOne) {
      if (!(sqrtPriceLimitX96 > BigInt(TickMath.MIN_SQRT_RATIO.toString()))) {
        throw 'RATIO_MIN';
      }
      if (sqrtPriceLimitX96 >= this.sqrtRatioX96) {
        return state;
      }
    } else {
      if (!(sqrtPriceLimitX96 < BigInt(TickMath.MAX_SQRT_RATIO.toString()))) {
        throw 'RATIO_MAX';
      }
      if (sqrtPriceLimitX96 <= this.sqrtRatioX96) {
        return state;
      }
    }

    const exactInput: boolean = amountSpecified >= BigInt(0);
  

    // start swap while loop
    while (
      state.amountSpecifiedRemaining !== BigInt(0) &&
      state.sqrtPriceX96 !== sqrtPriceLimitX96
    ) {
      const step: Partial<StepComputations> = {};
      step.sqrtPriceStartX96 = state.sqrtPriceX96;

      // because each iteration of the while loop rounds, we can't optimize this code (relative to the smart contract)
      // by simply traversing to the next available tick, we instead need to exactly replicate
      // tickBitmap.nextInitializedTickWithinOneWord
      [
        step.tickNext,
        step.initialized,
      ] = await this.ticks.nextInitializedTickWithinOneWord(
        state.tick,
        zeroForOne, // ?
        this.tickSpacing
      );

      if (step.tickNext < TickMath.MIN_TICK) {
        step.tickNext = TickMath.MIN_TICK;
      } else if (step.tickNext > TickMath.MAX_TICK) {
        step.tickNext = TickMath.MAX_TICK;
      }

      step.sqrtPriceNextX96 = BigInt(
        TickMath.getSqrtRatioAtTick(step.tickNext).toString()
      );

      let sqrtPriceLimitStep: bigint = (zeroForOne
      ? step.sqrtPriceNextX96 < sqrtPriceLimitX96
      : step.sqrtPriceNextX96 > sqrtPriceLimitX96)
        ? sqrtPriceLimitX96
        : step.sqrtPriceNextX96;

      let stepResult = SwapMath.computeSwapStep(
        state.sqrtPriceX96,
        sqrtPriceLimitStep,
        state.liquidity,
        state.amountSpecifiedRemaining,
        BigInt(this.fee)
      );

      state.sqrtPriceX96 = BigInt(stepResult[0].toString());
      step.amountIn = BigInt(stepResult[1].toString());
      step.amountOut = BigInt(stepResult[2].toString());
      step.feeAmount = BigInt(stepResult[3].toString());

      if (exactInput) {
        state.amountSpecifiedRemaining =
          state.amountSpecifiedRemaining - (step.amountIn + step.feeAmount);
        state.amountCalculated = state.amountCalculated - step.amountOut;
      } else {
        state.amountSpecifiedRemaining =
          state.amountSpecifiedRemaining + step.amountOut;
        state.amountCalculated =
          state.amountCalculated + (step.amountIn + step.feeAmount);
      }

      if (state.sqrtPriceX96 === step.sqrtPriceNextX96) {
        // if the tick is initialized, run the tick transition
        if (step.initialized) {
          let liquidityNet = BigInt(
            (await this.ticks.getTick(step.tickNext)).liquidityNet.toString()
          );
          // if we're moving leftward, we interpret liquidityNet as the opposite sign
          if (zeroForOne) liquidityNet = -liquidityNet;

          state.liquidity = BigInt(
            LiquidityMath.addDelta(
              JSBI.BigInt(state.liquidity.toString()),
              JSBI.BigInt(liquidityNet.toString())
            ).toString()
          );
        }

        state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
      } else if (state.sqrtPriceX96 !== step.sqrtPriceStartX96) {
        // updated comparison function
        // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
        state.tick = TickMath.getTickAtSqrtRatio(
          JSBI.BigInt(state.sqrtPriceX96.toString())
        );
      }
      //console.log(`REM = ${state.amountSpecifiedRemaining}`)
    }

    return state;
  }
}
