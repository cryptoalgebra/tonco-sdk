import { WalletVersion } from '../types/WalletVersion';

export function parseWalletVersion(walletVersion: string) {
  switch (walletVersion) {
    case 'wallet_v5r1':
      return WalletVersion.V5R1;

    case 'wallet_v5':
      return WalletVersion.V5_BETA;

    case 'wallet_v4r2':
      return WalletVersion.V4R2;

    case 'wallet_v4r1':
      return WalletVersion.V4R1;

    case 'wallet_v3r2':
      return WalletVersion.V3R2;

    case 'wallet_v3r1':
      return WalletVersion.V3R1;

    default:
      console.error(`Unsupported wallet version: ${walletVersion}`);
      return;
  }
}
