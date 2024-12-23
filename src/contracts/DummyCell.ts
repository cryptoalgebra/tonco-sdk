import { Address } from '@ton/core';
import { ADDRESS_ZERO } from '../constants';

export type ContractMessageMeta = {
  name: string;
  value: string;
  type: string;
  comment?: string;
};

export class DummyBuilder {
  public remainingBits = 256;

  constructor(public op: number) {}

  loadUint(bits: number): number {
    if (bits == 32) {
      return this.op;
    }
    return 0;
  }

  preloadUint(bits: number): number {
    if (bits == 32) {
      return this.op;
    }
    if (bits == 1) {
      return 1;
    }
    return 0;
  }

  preloadBit(): boolean {
    return true;
  }

  loadBoolean(): boolean {
    return false;
  }

  loadInt(): number {
    return 0;
  }

  loadUintBig(): bigint {
    return BigInt(0);
  }

  loadAddress(): Address {
    return Address.parse(ADDRESS_ZERO);
  }

  loadCoins(): bigint {
    return BigInt(0);
  }

  loadRef(): DummyCell {
    return new DummyCell(this.op);
  }

  loadMaybeRef(): DummyCell | null {
    return null;
  }
}

export class DummyCell {
  constructor(public op: number) {}

  beginParse(): DummyBuilder {
    return new DummyBuilder(this.op);
  }

  toBoc(): Buffer {
    return Buffer.from('Dummy');
  }
}
