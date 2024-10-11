import { Jetton } from '../entities/Jetton';
import { Price } from '../entities/Price';
import { tickToPrice } from './priceTickConversions';

export function getTickToPrice(
  baseToken?: Jetton,
  quoteToken?: Jetton,
  tick?: number,
  isSorted: boolean = true
): Price<Jetton, Jetton> | undefined {
  if (!baseToken || !quoteToken || typeof tick !== 'number') {
    return undefined;
  }
  return tickToPrice(baseToken, quoteToken, tick, isSorted);
}
