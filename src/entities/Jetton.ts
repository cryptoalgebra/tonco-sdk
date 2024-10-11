import { Address } from '@ton/core';
import { AbstractJetton } from './AbstractJetton';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';
/**
 * Represents an ERC20 token with a unique address and some metadata.
 */
export class Jetton extends AbstractJetton {
  public readonly address: string;

  public readonly isToken: true = true;

  public constructor(
    address: string,
    decimals: number,
    symbol: string,
    name?: string,
    image?: string
  ) {
    super(decimals, symbol, name, image);
    this.address = validateAndParseAddress(address);
  }

  /**
   * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
   * @param other other token to compare
   */
  public equals(other: Jetton): boolean {
    return (
      other.isToken &&
      Address.parse(this.address).equals(Address.parse(other.address))
    );
  }
}

//   /**
//    * Returns true if the address of this token sorts before the address of the other token
//    * @param other other token to compare
//    * @throws if the tokens have the same address
//    * @throws if the tokens are on different chains
//    */
//   public sortsBefore(other: Jetton): boolean {
//     invariant(this.address !== other.address, 'ADDRESSES');
//     return this.address.toLowerCase() < other.address.toLowerCase();
//   }
// }

//   /**
//    * Return this token, which does not need to be wrapped
//    */
//   public get wrapped(): Token {
//     return this;
//   }
// }

/**
 * Compares two currencies for equality
 */
export function currencyEquals(jettonA: Jetton, jettonB: Jetton): boolean {
  if (jettonA instanceof Jetton && jettonB instanceof Jetton) {
    return jettonA.equals(jettonB);
  }
  if (jettonA instanceof Jetton) {
    return false;
  }
  if (jettonB instanceof Jetton) {
    return false;
  }
  return jettonA === jettonB;
}
