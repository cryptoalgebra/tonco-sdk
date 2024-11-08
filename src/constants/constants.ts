import { Address } from '@ton/core';

export const ADDRESS_ZERO =
  '0:0000000000000000000000000000000000000000000000000000000000000000';

export const BLACK_HOLE_ADDRESS = Address.parse(ADDRESS_ZERO);

export const FEE_DENOMINATOR: number = 10000;

export const IMPOSSIBLE_FEE: number = FEE_DENOMINATOR + 1;

export const INITIAL_POOL_FEE = 100;

export const DEFAULT_TICK_SPACING = 60;
