/**
 * Zcash TypeScript Types
 * 
 * Centralized type definitions for Zcash integration
 */

import type { DerivedZcashAccount } from '@miden/zcash-integration/wallet';

/**
 * Zcash Balance
 */
export interface ZcashBalance {
  confirmed: number;
  unconfirmed: number;
  total: number;
  pending: number;
  unit: 'zatoshi' | 'ZEC';
}

/**
 * Zcash Transaction
 */
export interface ZcashTransaction {
  txHash: string;
  from: string;
  to: string;
  amount: bigint;
  fee: number;
  timestamp: number;
  blockHeight?: number;
  confirmations?: number;
  memo?: string;
  type: 'transparent' | 'shielded' | 'shielding' | 'deshielding';
}

/**
 * Zcash Address Info
 */
export interface ZcashAddressInfo {
  address: string;
  type: 'transparent' | 'shielded' | 'orchard';
  network: 'mainnet' | 'testnet';
  isValid: boolean;
}

/**
 * Zcash Account State
 */
export interface ZcashAccountState {
  account: DerivedZcashAccount | null;
  loading: boolean;
  error: Error | null;
  addresses: {
    tAddress: string | null;
    zAddress: string | null;
  };
}

/**
 * Zcash Balance State
 */
export interface ZcashBalanceState {
  transparent: ZcashBalance | null;
  shielded: ZcashBalance | null;
  total: ZcashBalance | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: number | null;
}

/**
 * Zcash Transaction State
 */
export interface ZcashTransactionState {
  sending: boolean;
  error: Error | null;
  txHash: string | null;
  lastTransaction: ZcashTransaction | null;
}

/**
 * Zcash Module State
 */
export interface ZcashModuleState {
  module: any | null; // ZcashModule type from SDK
  isInitialized: boolean;
  isRPCConnected: boolean;
  error: string | null;
  network: 'mainnet' | 'testnet';
  rpcEndpoint: string;
}

/**
 * Zcash Sync Status
 */
export interface ZcashSyncStatus {
  blocks: number;
  headers: number;
  verificationProgress: number;
  isSyncing: boolean;
  isInitialBlockDownload: boolean;
  lastSynced: number | null;
}

/**
 * Zcash Transaction Params
 */
export interface ZcashTransactionParams {
  from: {
    address: string;
    type: 'transparent' | 'shielded';
  };
  to: {
    address: string;
    type: 'transparent' | 'shielded';
  };
  amount: number; // In zatoshi
  fee?: number; // In zatoshi
  memo?: string;
  changeAddress?: string;
  expiryHeight?: number;
}

/**
 * Zcash RPC Response
 */
export interface ZcashRPCResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
  jsonrpc: '1.0' | '2.0';
}

/**
 * Zcash Note (Shielded)
 */
export interface ZcashNote {
  commitment: Uint8Array;
  nullifier: Uint8Array;
  value: number;
  rho: Uint8Array;
  rseed: Uint8Array;
  cmu: Uint8Array;
  address: string;
  memo?: string;
  witness?: {
    path: Uint8Array[];
    position: number;
  };
}

/**
 * Zcash UTXO (Transparent)
 */
export interface ZcashUTXO {
  txid: string;
  vout: number;
  address: string;
  scriptPubKey: string;
  amount: number; // In zatoshi
  confirmations: number;
  spendable: boolean;
}

/**
 * Zcash Provider Config
 */
export interface ZcashProviderConfig {
  rpcEndpoint?: string;
  rpcCredentials?: {
    username: string;
    password: string;
  };
  rpcApiKey?: string;
  useBackendProxy?: boolean;
  backendProxyUrl?: string;
  proofGenerationMode?: 'client' | 'delegated' | 'hybrid';
  delegatedProverUrl?: string;
  syncInterval?: number;
  network?: 'mainnet' | 'testnet';
}

