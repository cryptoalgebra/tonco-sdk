import { Address } from '@ton/core';

const BLACK_HOLE_ADDRESS: Address = Address.parse(
  'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
);

export type ContractMessageMeta = {
  name: string;
  value: string;
  type: string;
  comment?: string;
};

export class DummyBuiler {
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
    return BLACK_HOLE_ADDRESS;
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

  beginParse(): DummyBuiler {
    return new DummyBuiler(this.op);
  }

  toBoc(): Buffer {
    return Buffer.from('Dummy');
  }
}
