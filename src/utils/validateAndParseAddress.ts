import { Address } from '@ton/ton';

export function validateAndParseAddress(address: string): string {
  try {
    return Address.parse(address).toString();
  } catch (error) {
    throw new Error(`${address} is not a valid address.`);
  }
}
