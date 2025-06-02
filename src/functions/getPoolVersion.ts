import { Address } from '@ton/core';
import { JettonWallet, PoolContract } from '../contracts';
import { TonClient, TonClient4 } from '@ton/ton';
import { DEX_VERSION } from '../types';
import { ROUTER } from '../constants';

export async function getPoolVersion(
  client: TonClient | TonClient4,
  poolAddress: Address
): Promise<DEX_VERSION> {
  const poolContract = new PoolContract[DEX_VERSION.v1](poolAddress);
  const contract = client.open(poolContract);

  const poolState = await contract.getPoolStateAndConfiguration();

  const poolRouterAddress = poolState.router_address;

  if (poolRouterAddress.equals(Address.parse(ROUTER[DEX_VERSION.v1_5]))) {
    return DEX_VERSION.v1_5;
  }

  return DEX_VERSION.v1;
}

export async function getPoolVersionByJettonWallet(
  client: TonClient | TonClient4,
  routerJettonWallet: Address
): Promise<DEX_VERSION> {
  const jettonWalletContract = new JettonWallet(routerJettonWallet);
  const contract = client.open(jettonWalletContract);

  const { ownerAddress } = await contract.getWalletData();

  if (ownerAddress.equals(Address.parse(ROUTER.v1_5))) {
    return DEX_VERSION.v1_5;
  }

  return DEX_VERSION.v1;
}
