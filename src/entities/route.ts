import invariant from 'tiny-invariant';
import { Pool } from './Pool';
import { Jetton } from './Jetton';
import { Price } from './Price';

/**
 * Represents a list of pools through which a swap can occur
 * @template TInput The input token
 * @template TOutput The output token
 */
export class Route<TInput extends Jetton, TOutput extends Jetton> {
  public readonly pools: Pool[];

  public readonly tokenPath: Jetton[];

  public readonly input: TInput;

  public readonly output: TOutput;

  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  public constructor(pools: Pool[], input: TInput, output: TOutput) {
    invariant(pools.length > 0, 'POOLS');

    // const chainId = pools[0].chainId;
    // const allOnSameChain = pools.every(pool => pool.chainId === chainId);
    // invariant(allOnSameChain, 'CHAIN_IDS');

    const wrappedInput = input;
    invariant(pools[0].involvesToken(wrappedInput), 'INPUT');

    invariant(pools[pools.length - 1].involvesToken(output), 'OUTPUT');

    /**
     * Normalizes token0-token1 order and selects the next token/fee step to add to the path
     * */
    const tokenPath: Jetton[] = [wrappedInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i];
      invariant(
        currentInputToken.equals(pool.jetton0) ||
          currentInputToken.equals(pool.jetton1),
        'PATH'
      );
      const nextToken = currentInputToken.equals(pool.jetton0)
        ? pool.jetton1
        : pool.jetton0;
      tokenPath.push(nextToken);
    }

    this.pools = pools;
    this.tokenPath = tokenPath;
    this.input = input;
    this.output = output ?? tokenPath[tokenPath.length - 1];
  }

  private _midPrice: Price<TInput, TOutput> | null = null;

  /**
   * Returns the mid price of the route
   */
  public get midPrice(): Price<TInput, TOutput> {
    if (this._midPrice !== null) return this._midPrice;

    const price = this.pools.slice(1).reduce(
      ({ nextInput, price }, pool) =>
        nextInput.equals(pool.jetton0)
          ? {
              nextInput: pool.jetton1,
              price: price.multiply(pool.jetton0Price),
            }
          : {
              nextInput: pool.jetton0,
              price: price.multiply(pool.jetton1Price),
            },
      this.pools[0].jetton0.equals(this.input)
        ? {
            nextInput: this.pools[0].jetton1,
            price: this.pools[0].jetton0Price,
          }
        : {
            nextInput: this.pools[0].jetton0,
            price: this.pools[0].jetton1Price,
          }
    ).price;

    return (this._midPrice = new Price(
      this.input,
      this.output,
      price.denominator,
      price.numerator
    ));
  }

  // public get chainId(): number {
  //   return this.pools[0].chainId;
  // }
}
