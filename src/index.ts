/**
 * Zcash-Miden Integration
 * 
 * This module provides Zcash transaction signing capabilities for Miden WebSDK
 * and Browser Wallet. It supports both transparent (t-address) and shielded
 * (z-address) transactions.
 * 
 * Main entry point for the @miden/zcash-integration package.
 */

// Types
export * from './types/index';

// Utilities
export * from './utils/index';

// Cryptographic operations
export { ZcashKeyDerivation } from './crypto/keyDerivation';
export { 
  ZcashKeyManager, 
  KeyEncryption, 
  MemoryKeyStorage 
} from './crypto/keyStorage';
export type { 
  KeyStorage, 
  EncryptedKeys,
  EncryptedKey 
} from './crypto/keyStorage';

// Address utilities
export * from './address/index';

// RPC client
export { ZcashRPCClient, ZcashRPCError } from './rpc/client';
export { ConnectionManager, RPCError } from './rpc/connection';
export type { RPCConfig } from './rpc/client';
export type { 
  EndpointConfig, 
  ConnectionManagerConfig 
} from './rpc/connection';

// State management
export { UTXOCache, UTXOSelector } from './state/utxo';
export type { 
  UTXOEntry, 
  AddressUTXOSet, 
  UTXOCacheConfig,
  UTXOSelectionStrategy,
  UTXOSelectionResult 
} from './state/utxo';

// Transaction handling
export { TransactionSerializer } from './transactions/serialization';
export { TransactionValidator } from './transactions/validation';
export { ZcashTransactionBuilder } from './transactions/builder';
export { ZcashSigner } from './transactions/signing';
export type { TransactionBuilderConfig } from './transactions/builder';

// Shielded transactions (Sapling)
export * from './shielded/index';

// Miden-Zcash integration (wallet support)
export * from './miden/index';

// Main provider (high-level API)
export { ZcashProvider } from './provider/ZcashProvider';
export type { SyncResult, TxHash } from './provider/ZcashProvider';
