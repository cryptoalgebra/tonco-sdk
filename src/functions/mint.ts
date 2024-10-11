import JSBI from 'jsbi';
import { Jetton } from '../entities/Jetton';
import { Price } from '../entities/Price';
import { encodeSqrtRatioX96 } from '../utils/encodeSqrtRatioX96';
import { TickMath } from '../utils/tickMath';
import { priceToClosestTick } from '../utils/priceTickConversions';
import { nearestUsableTick } from '../utils/nearestUsableTick';

export function tryParsePrice(
  baseToken?: Jetton,
  quoteToken?: Jetton,
  value?: string
) {
  if (!baseToken || !quoteToken || !value) {
    return undefined;
  }

  if (!value.match(/^\d*\.?\d+$/)) {
    return undefined;
  }

  const [whole, fraction] = value.split('.');

  const decimals = fraction?.length ?? 0;
  const withoutDecimals = JSBI.BigInt((whole ?? '') + (fraction ?? ''));

  return new Price(
    baseToken,
    quoteToken,
    JSBI.multiply(
      JSBI.BigInt(10 ** decimals),
      JSBI.BigInt(10 ** baseToken.decimals)
    ),
    JSBI.multiply(withoutDecimals, JSBI.BigInt(10 ** quoteToken.decimals))
  );
}

export function tryParseTick(
  baseToken?: Jetton,
  quoteToken?: Jetton,
  value?: string,
  tickSpacing?: number
): number | undefined {
  if (!baseToken || !quoteToken || !value || !tickSpacing) {
    return undefined;
  }

  const price = tryParsePrice(baseToken, quoteToken, value);

  if (!price) {
    return undefined;
  }

  let tick: number;

  // check price is within min/max bounds, if outside return min/max
  const sqrtRatioX96 = encodeSqrtRatioX96(price.numerator, price.denominator);

  if (JSBI.greaterThanOrEqual(sqrtRatioX96, TickMath.MAX_SQRT_RATIO)) {
    tick = TickMath.MAX_TICK;
  } else if (JSBI.lessThanOrEqual(sqrtRatioX96, TickMath.MIN_SQRT_RATIO)) {
    tick = TickMath.MIN_TICK;
  } else {
    // this function is agnostic to the base, will always return the correct tick
    tick = priceToClosestTick(price);
  }

  return nearestUsableTick(tick, tickSpacing);
}
