/**
 * Miden-Zcash Integration Type Definitions
 */

/**
 * Miden account interface (compatible with Miden SDK)
 */
export interface MidenAccount {
  id: string;
  publicKey: Uint8Array;
  hasCapability?(capability: string): boolean;
}

/**
 * Zcash address info
 */
export interface ZcashAddressInfo {
  diversifier: Uint8Array;
  publicKey: Uint8Array;
  address: string;
}

/**
 * Shielded transaction parameters
 */
export interface ShieldedTxParams {
  spends: Array<{
    note: any;
    address: string;
    amount: bigint;
  }>;
  outputs: Array<{
    recipient: string;
    amount: bigint;
  }>;
  changeAddress: string;
}

/**
 * Wallet transaction record
 */
export interface WalletTransaction {
  txid: string;
  type: 'shield' | 'deshield' | 'transfer';
  status: 'pending' | 'confirmed' | 'failed';
  amount: bigint;
  recipient?: string;
  timestamp: number;
  confirmations: number;
  blockHeight?: number;
}

/**
 * Wallet balance
 */
export interface WalletBalance {
  verified: bigint;
  unverified: bigint;
  total: bigint;
}

/**
 * Wallet account state
 */
export interface WalletAccountState {
  accountId: string;
  midenAccount: MidenAccount;
  zcashAddress: string;
  balance: WalletBalance;
  transactions: WalletTransaction[];
  lastSync: number;
  syncInProgress: boolean;
}
