/**
 * Core type definitions for Zcash-Miden integration
 */

export type Network = 'mainnet' | 'testnet';
export type AddressType = 'transparent' | 'shielded' | 'orchard';
export type TransactionType = 'transparent' | 'shielded' | 'shielding' | 'deshielding';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'expired';

/**
 * Zcash addresses for a Miden account
 */
export interface ZcashAddresses {
  tAddress: string;  // Transparent address
  zAddress: string;  // Shielded address (Sapling)
  orchardAddress?: string;  // Orchard address (if supported)
}

/**
 * Derived Zcash keys from Miden account
 */
export interface ZcashKeys {
  spendingKey: Uint8Array;      // For shielded addresses
  viewingKey: Uint8Array;        // For viewing shielded transactions
  transparentPrivateKey: Uint8Array;  // For transparent addresses
  tAddress: string;
  zAddress: string;
  orchardSpendingKey?: Uint8Array;  // For Orchard (if supported)
}

/**
 * Balance structure
 */
export interface Balance {
  confirmed: number;      // Confirmed balance in zatoshi
  unconfirmed: number;    // Unconfirmed balance in zatoshi
  total: number;          // Total balance
  pending: number;        // Pending transactions
  unit: 'zatoshi' | 'ZEC';
}

/**
 * Transaction structures
 */
export interface Transaction {
  version: number;
  versionGroupId?: number;
  lockTime: number;
  expiryHeight: number;
  transparentInputs: TransparentInput[];
  transparentOutputs: TransparentOutput[];
  shieldedInputs?: Note[];
  shieldedOutputs?: ShieldedOutput[] | any[];  // Can be ShieldedOutput[] or ShieldedOutputDescription[]
  joinsplits?: JoinSplit[];
  bindingSig?: string;
  valueBalance?: number;
}

export interface TransparentInput {
  txHash: string;
  index: number;
  scriptPubKey: string;
  scriptSig?: string;
  value: number;  // In zatoshi
  sequence: number;
}

export interface TransparentOutput {
  address: string;
  value: number;  // In zatoshi
  scriptPubKey: string;
}

export interface Note {
  commitment: Uint8Array;
  nullifier: Uint8Array;
  value: number;
  rho: Uint8Array;
  rseed: Uint8Array;
  cmu: Uint8Array;
  address: string;
  memo?: string;
}

export interface ShieldedOutput {
  address: string;
  value: number;
  memo?: string;
  rseed: Uint8Array;
}

export interface JoinSplit {
  // Legacy Sprout support (if needed)
  [key: string]: any;
}

export interface SignedTransaction {
  tx: Transaction;
  txHash: string;
  rawTx: string;  // Hex-encoded
  proof?: Proof;  // For shielded transactions
}

export interface Proof {
  proof: Uint8Array;
  publicInputs: Uint8Array[];
  bindingSig?: string;
}

/**
 * Configuration structures
 */
export interface ZcashProviderConfig {
  network: Network;
  rpcEndpoint: string;
  rpcCredentials?: {
    username: string;
    password: string;
  };
  /** API key for services that use header-based auth */
  rpcApiKey?: string;
  /** Lightwalletd URL for shielded operations (tree states, compact blocks, witness data) */
  lightwalletdUrl?: string;
  proofGenerationMode: 'client' | 'delegated' | 'hybrid';
  delegatedProverUrl?: string;
  syncInterval: number;  // milliseconds
  cacheSize: number;
}

export interface TransactionParams {
  from: AddressInfo;
  to: AddressInfo;
  amount: number;
  fee?: number;
  memo?: string;
  changeAddress?: string;
  expiryHeight?: number;
}

export interface AddressInfo {
  address: string;
  type: AddressType;
  notes?: Note[];  // For shielded inputs
}

/**
 * RPC types
 */
export interface RPCRequest {
  jsonrpc: '1.0' | '2.0';
  id: string | number;
  method: string;
  params: any[];
}

export interface RPCResponse {
  jsonrpc: '1.0' | '2.0';
  id: string | number;
  result?: any;
  error?: RPCError;
}

export interface RPCError {
  code: number;
  message: string;
  data?: any;
}

/**
 * UTXO structure
 */
export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  scriptPubKey: string;
  amount: number;  // In zatoshi
  confirmations: number;
  spendable: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}


