/**
 * Miden-Zcash Integration
 * Complete wallet support for Zcash shielded transactions in Miden ecosystem
 */

export { MidenZcashWallet, createTestnetWallet, createMainnetWallet } from './wallet';
export type { MidenZcashWalletConfig } from './wallet';

export type {
  MidenAccount,
  ZcashAddressInfo,
  ShieldedTxParams,
  WalletTransaction,
  WalletBalance,
  WalletAccountState
} from './types';
