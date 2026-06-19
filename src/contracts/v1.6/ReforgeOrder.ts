import { Address, beginCell, Builder, Cell } from '@ton/ton';
import { ContractOpcodes } from './opCodes';

export const ReforgeSources = {
  REFORGE_SOURCE_NFT: 1n,
  REFORGE_SOURCE_USER: 2n,
  REFORGE_SOURCE_ALM: 3n,
  REFORGE_SOURCE_ARBITER: 4n,
} as const;

export type ReforgeSources = typeof ReforgeSources[keyof typeof ReforgeSources];

export type FeesStorage = {
  growthInside0LastX128: bigint; //int256;
  growthInside1LastX128: bigint; //int256;
};

export type PosAndFeesData = {
  liquidity: bigint; // uint128;
  tickLower: number; // int24;
  tickUpper: number; // int24;

  growthInside0LastX128: bigint; //int256;
  growthInside1LastX128: bigint; //int256;

  newFees?: FeesStorage | null;
};

/* ================== */
export type PayloadStorage = {
  amount0: bigint; // coins,
  payload0: Cell; // cell,
  amount1: bigint; // coins,
  payload1: Cell; // cell
};

export type ActionStorage = {
  target0: Address;
  target1: Address;
  payloads: Cell; //Cell<PayloadStorage>
};

export type BurnOrder = {
  index: bigint; //uint64,
  subindex: number; //uint4,
  data: PosAndFeesData;
  liquidity2Burn: bigint; //int128
};

export function packBurnOrder(b: BurnOrder): Cell {
  return beginCell()
    .storeUint(b.index, 64)
    .storeUint(b.subindex, 4)
    .storeUint(b.data.liquidity, 128)
    .storeInt(b.data.tickLower, 24)
    .storeInt(b.data.tickUpper, 24)

    .storeInt(b.data.growthInside0LastX128, 256)
    .storeInt(b.data.growthInside1LastX128, 256)

    .storeMaybeRef(
      b.data.newFees
        ? beginCell()
            .storeInt(b.data.newFees.growthInside0LastX128, 256)
            .storeInt(b.data.newFees.growthInside1LastX128, 256)
            .endCell()
        : null
    )
    .storeUint(b.liquidity2Burn, 128)
    .endCell();
}

export function unpackBurnOrder(c: Cell | null): BurnOrder | null {
  if (c == null) return null;

  let s = c.beginParse();
  let res: Partial<BurnOrder> = {};
  res.index = s.loadUintBig(64);
  res.subindex = s.loadUint(4);

  let data: Partial<PosAndFeesData> = {};
  data.liquidity = s.loadUintBig(128);
  data.tickLower = s.loadInt(24);
  data.tickUpper = s.loadInt(24);

  data.growthInside0LastX128 = s.loadIntBig(256);
  data.growthInside1LastX128 = s.loadIntBig(256);

  const newFees: Cell | null = s.loadMaybeRef();
  if (newFees == null) {
    data.newFees = null;
  } else {
    const fs = newFees.beginParse();
    data.newFees = {
      growthInside0LastX128: fs.loadIntBig(256),
      growthInside1LastX128: fs.loadIntBig(256),
    };
  }

  res.data = data as PosAndFeesData;
  res.liquidity2Burn = s.loadUintBig(128);

  return res as BurnOrder;
}

export const MINT_NOT_LESS = 0;
export const MINT_AS_MUCH_AS_POSSIBLE = 1;

export type MintOrder = {
  op: number; //int32;
  /* uint128 | 1 | Position liquidity */
  liquidity: bigint; //uint128;
  /* int24   | 1 | Position lower tick number */
  tickLower: number; // int24;
  /* int24   | 1 | Position upper tick number */
  tickUpper: number; //int24;

  nftReceiver: Address | null;
};

export function packMintOrder(m: MintOrder): Cell {
  return beginCell()
    .storeUint(m.op, 32)
    .storeUint(m.liquidity, 128)
    .storeInt(m.tickLower, 24)
    .storeInt(m.tickUpper, 24)

    .storeAddress(m.nftReceiver)
    .endCell();
}

export function unpackMintOrder(c: Cell | null): MintOrder | null {
  if (c == null) return null;
  let s = c.beginParse();
  let res: Partial<MintOrder> = {};
  res.op = s.loadInt(32);

  res.liquidity = s.loadUintBig(128);
  res.tickLower = s.loadInt(24);
  res.tickUpper = s.loadInt(24);

  res.nftReceiver = s.loadAddressAny() as Address | null;
  return res as MintOrder;
}

// (0x0eb9e061)

export type ReforgeMessage = {
  query_id: bigint; //:int64,   /*< */

  /* Make sure it is never user-controlled*/

  source: bigint; //:uint4,
  sourceId: bigint; //:uint64,

  /* Proven amount of two jettons belonging to the source */
  amount0: bigint; // :coins,
  amount1: bigint; // :coins,

  /* User that owns the liquidity */
  lpProvider: Address;

  /* Positions that are input to the reforge */
  positions_cell?:
    | [BurnOrder | null, BurnOrder | null, BurnOrder | null, BurnOrder | null]
    | null;
  /* Mask that holds 1 bit flag for each position, if it should be burned */
  passthrough: bigint; //:uint4,

  /* List of positions to mint */
  orders_cell?: [MintOrder?, MintOrder?, MintOrder?, MintOrder?];

  /* Description what to do with the remaining liquidity*/
  action_target: bigint; //uint32,
  action_cell?: Cell | null; //ActionStorage?
};

export function packReforgeMessage(reforge: ReforgeMessage): Cell {
  let positionsPacked: Cell | null = null;
  if (reforge.positions_cell) {
    positionsPacked = beginCell()
      .storeMaybeRef(
        reforge.positions_cell[0]
          ? packBurnOrder(reforge.positions_cell[0])
          : null
      )
      .storeMaybeRef(
        reforge.positions_cell[1]
          ? packBurnOrder(reforge.positions_cell[1])
          : null
      )
      .storeMaybeRef(
        reforge.positions_cell[2]
          ? packBurnOrder(reforge.positions_cell[2])
          : null
      )
      .storeMaybeRef(
        reforge.positions_cell[3]
          ? packBurnOrder(reforge.positions_cell[3])
          : null
      )
      .endCell();
  }

  let mintsPacked: Cell | null = null;
  if (reforge.orders_cell) {
    mintsPacked = beginCell()
      .storeMaybeRef(
        reforge.orders_cell[0] ? packMintOrder(reforge.orders_cell[0]) : null
      )
      .storeMaybeRef(
        reforge.orders_cell[1] ? packMintOrder(reforge.orders_cell[1]) : null
      )
      .storeMaybeRef(
        reforge.orders_cell[2] ? packMintOrder(reforge.orders_cell[2]) : null
      )
      .storeMaybeRef(
        reforge.orders_cell[3] ? packMintOrder(reforge.orders_cell[3]) : null
      )
      .endCell();
  }

  return beginCell()
    .storeUint(ContractOpcodes.POOL_REFORGE, 32)
    .storeUint(reforge.query_id, 64)

    .storeUint(reforge.source, 4)
    .storeUint(reforge.sourceId, 64)

    .storeCoins(reforge.amount0)
    .storeCoins(reforge.amount1)

    .storeAddress(reforge.lpProvider)
    .storeMaybeRef(positionsPacked)
    .storeUint(reforge.passthrough, 4)
    .storeMaybeRef(mintsPacked)
    .storeUint(reforge.action_target, 32)
    .storeMaybeRef(reforge.action_cell)
    .endCell();
}

/*
struct  (0x062a8cca) DepositMessage {    
    query_id       :int64,   

    // Make sure it is never user-controlled
    source         :uint4,
    sourceId       :uint64,

    // User that owns the liquidity 
    lpProvider     :address,

    // Positions that are input to the reforge 
    positions_cell : Cell<BurnStorage>?,
    // Mask that holds 1 bit flag for each position, if it should be burned 
    action_cell    : Cell<ActionStorage>?
}
*/

export type ReforgeOrder = {
  // 124 + 124 + 64 + 4 + 32 + (4) = 352
  enough0: bigint; // :coins,
  enough1: bigint; // :coins,

  posNeeded: bigint;
  passthrough: number; //:uint4,
  target_action?: number; //:uint32,

  mintOrders: MintOrder[];
};

export function packReforgeOrderBody(order: ReforgeOrder): Builder {
  let posCells: Builder = beginCell();
  let posNum: number = Math.min(4, order.mintOrders.length);
  for (let i = 0; i < posNum; i++) {
    posCells = posCells.storeMaybeRef(packMintOrder(order.mintOrders[i]));
  }
  posCells.storeInt(0, 4 - posNum);

  order.target_action = order.target_action ?? 0;

  let builder = beginCell()
    .storeCoins(order.enough0)
    .storeCoins(order.enough1)
    .storeUint(order.posNeeded, 64)
    .storeUint(order.passthrough, 4)
    .storeUint(order.target_action, 32)
    .storeBuilder(posCells);

  console.log(' order.target_action :', order.target_action);

  return builder;
}

export function packReforgeOrder(queryId: bigint, order: ReforgeOrder): Cell {
  return beginCell()
    .storeUint(ContractOpcodes.ACCOUNT_SET_ORDER, 32)
    .storeUint(queryId, 64)
    .storeBuilder(packReforgeOrderBody(order))
    .endCell();
}
