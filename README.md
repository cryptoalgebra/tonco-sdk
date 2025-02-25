<p align="center">
  <img alt="TONCO" src="https://app.tonco.io/tonco-logo.svg" width="360">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@toncodex/sdk?activeTab=versions"><img src="https://img.shields.io/npm/v/@toncodex/sdk/mainnet?color=green" alt="Mainnet Version"></a>
  <a href="https://www.npmjs.com/package/@toncodex/sdk?activeTab=versions"><img src="https://img.shields.io/npm/v/@toncodex/sdk/testnet?color=orange" alt="Testnet Version"></a>
  <a href="https://github.com/cryptoalgebra/tonco-sdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
</p>

<p align="center">
  A TypeScript/JavaScript SDK for building applications on top of the TONCO DEX.<br>
  This SDK helps developers interact with TONCO pools, handle liquidity positions, and execute swaps.
</p>

## ✨ Features

- [Pool state management (ticks, liquidity, and fees)](https://github.com/cryptoalgebra/tonco-sdk/blob/main/src/entities/Pool.ts)
- [Liquidity position management](https://github.com/cryptoalgebra/tonco-sdk/blob/main/src/entities/position.ts)
- [Price and tick calculations](https://github.com/cryptoalgebra/tonco-sdk/blob/main/src/utils/priceTickConversions.ts)
- [Swap simulation logic](https://github.com/cryptoalgebra/tonco-sdk/blob/main/src/classes/SwapSimulator.ts)
- [Creating messages for operations](https://github.com/cryptoalgebra/tonco-sdk/blob/main/src/classes/PoolMessageManager.ts)

---

## 📦 Installation

Using npm:
```bash
npm install @toncodex/sdk@mainnet
```
or yarn:
```bash
yarn add @toncodex/sdk@mainnet
```

The SDK works with types from the @ton/ton library and uses JSBI for calculations. For the best experience, make sure to install these dependencies as well:

```bash
yarn add @ton/ton @ton/core @ton/crypto
yarn add jsbi@3.2.5
```

## 🚀 Getting Started

### Creating Jetton instance
```ts
const jetton0 = new Jetton(
  pTON_MINTER, // address
  9, // decimals
  'TON', // symbol
  'TON', // name
  'https://cache.tonapi.io/imgproxy/0boBDKrVQY502vqLLXqwwZTS87PyqSQq0hke-x11lqs/rs:fill:200:200:1/g:no/aHR0cHM6Ly90b25jby5pby9zdGF0aWMvdG9rZW4vVE9OX1RPS0VOLndlYnA.webp' // image
)
```

### Retrieving pool data
```ts
import { TonClient } from '@ton/ton';
import { Address, OpenedContract } from '@ton/core';

const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

const poolAddress = "EQD25vStEwc-h1QT1qlsYPQwqU5IiOhox5II0C_xsDNpMVo7" // TON - USDT

const contract = new PoolV3Contract(Address.parse(poolAddress));
const poolContract = client.open(contract) as OpenedContract<PoolV3Contract>;
const poolData = await poolContract.getPoolStateAndConfiguration();
```

### Creating Pool instance
```ts
const jetton0 = new Jetton(
  pTON_MINTER,
  9,
  'TON',
  'TON',
  'https://cache.tonapi.io/imgproxy/0boBDKrVQY502vqLLXqwwZTS87PyqSQq0hke-x11lqs/rs:fill:200:200:1/g:no/aHR0cHM6Ly90b25jby5pby9zdGF0aWMvdG9rZW4vVE9OX1RPS0VOLndlYnA.webp'
)
const jetton1 = new Jetton(
  'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
  6,
  'USD₮',
  'Tether USD,
  'https://tether.to/images/logoCircle.png'
)

const pool = new Pool(
  jetton0,
  jetton1,
  poolData.lp_fee_current,
  poolData.price_sqrt.toString(),
  poolData.liquidity.toString(),
  poolData.tick,
  poolData.tick_spacing,
);
```

### Retrieving position data
```ts
import { TonClient } from '@ton/ton';
import { Address, OpenedContract } from '@ton/core';

const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

const positionNFTAddress = "EQAy5YMXX7e3916Io3Mi9DG3Xf7UAz2bKMMioYCOeYlDm7Ry" // #3143 LP Position: [ -62160 -> -56100 ]

const positionContract = client.open(
  new PositionNFTV3Contract(Address.parse(positionNFTAddress)),
);

const positionInfo = await positionContract.getPositionInfo();
```

### Creating Position instance
```ts
const liquidity = positionInfo.liquidity.toString();
const tickLower = positionInfo.tickLow;
const tickUpper = positionInfo.tickHigh;

const position = new Position({
  pool, // pool instance
  tickLower,
  tickUpper,
  liquidity,
});
```

## 📚 Examples & Integration
Usage examples and integration guide are available on the official TONCO documentation:
- [Integration FAQ](https://docs.tonco.io/technical-reference/integration-faq)

## 📄 License
This project is licensed under the MIT License. See the [LICENSE](https://github.com/cryptoalgebra/tonco-sdk/blob/main/LICENSE) file for more details.
