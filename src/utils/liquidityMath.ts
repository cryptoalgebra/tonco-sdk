import JSBI from 'jsbi';
import { NEGATIVE_ONE, ZERO } from '../constants/internalConstants';

export abstract class LiquidityMath {
  /**
   * Cannot be constructed.
   */

  public static addDelta(x: JSBI, y: JSBI): JSBI {
    if (JSBI.lessThan(y, ZERO)) {
      return JSBI.subtract(x, JSBI.multiply(y, NEGATIVE_ONE));
    }
    return JSBI.add(x, y);
  }
}
