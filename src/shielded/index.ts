/**
 * Shielded Transaction Module
 * Exports for Sapling shielded transaction support
 */

// Types
export type {
  SaplingNote,
  MerkleWitness,
  SaplingSpendingKey,
  SaplingFullViewingKey,
  SaplingIncomingViewingKey,
  SaplingPaymentAddress,
  ShieldedOutputDescription,
  ShieldedSpendDescription,
  ShieldedBundle,
  ShieldedOutputParams,
  NoteSpendParams,
  SpendProofInputs,
  OutputProofInputs,
  SaplingProof,
  NotePlaintext,
  CompactNote,
  ScannedNote,
  ScanProgress,
  CommitmentTreeState
} from './types.js';

// Note commitment and nullifier
export {
  computeNoteCommitment,
  computeNullifier,
  computeValueCommitment,
  generateRcm,
  generateRseed,
  generateRcv,
  deriveRcmFromRseed,
  deriveNullifierKey,
  createNote,
  encodeNotePlaintext,
  decodeNotePlaintext,
  isNullifierSpent,
  markNullifierSpent,
  prfExpand
} from './noteCommitment.js';

// Note cache
export { NoteCache, NoteSelector } from './noteCache.js';

// Note scanner
export {
  NoteScanner,
  IncrementalMerkleTree,
  ShieldedStateSynchronizer
} from './noteScanner.js';
export type {
  BlockData,
  TransactionData,
  ScannerConfig,
  MerkleWitness as NoteScannerMerkleWitness,
  RPCClientInterface
} from './noteScanner.js';

// Merkle Tree Persistence
export { MerkleTreePersistence } from './merkleTreePersistence.js';
export type { TreeCheckpoint } from './merkleTreePersistence.js';

// Transaction builder
export { ShieldedTransactionBuilder } from './transactionBuilder.js';
export type {
  ShieldedTransactionParams,
  ShieldingTransactionParams,
  DeshieldingTransactionParams,
  UnsignedShieldedTransaction,
  ShieldedSigningData
} from './transactionBuilder.js';

// Prover
export { ZcashProver, WorkerProver } from './prover.js';
export type {
  ProverConfig,
  ProofProgress,
  TransactionProofs
} from './prover.js';

// Groth16 Integration (supports both snarkjs and librustzcash)
export { Groth16Integration, getGroth16Integration, resetGroth16Integration } from './groth16Integration.js';
export type { ProverType } from './groth16Integration.js';

// librustzcash Prover
export { LibrustzcashProver } from './librustzcashProver.js';

// Prize-WASM Prover (Recommended for browser)
// Type export is always available
export type { PrizeWasmModule } from './prizeWasmLoader.js';

// Prize-WASM exports - these may fail at build time if modules aren't available
// Use dynamic import in groth16Integration to handle this gracefully
// For direct usage, import from './prizeWasm' entry point instead
export { PrizeWasmProver, getPrizeWasmProver } from './prizeWasmProver.js';
export { 
  loadPrizeWasm, 
  isPrizeWasmLoaded, 
  getPrizeWasmModule, 
  getPrizeWasmInfo,
  resetPrizeWasmLoader 
} from './prizeWasmLoader.js';

// Delegated Proving Service
export { DelegatedProver } from './delegatedProver.js';
export type { DelegatedProverConfig } from './delegatedProver.js';

// Signer
export { ShieldedSigner, ShieldedVerifier } from './signer.js';
export type { SignedShieldedTransaction } from './signer.js';

// RPC Client
export { ZcashRpcClient, createTestnetRpcClient, createMainnetRpcClient } from './rpcClient.js';
export type { BlockHeader, TransactionInfo } from './rpcClient.js';

// Transaction Tracking
export { TransactionTracker, BroadcastManager, BroadcastTransactionStatus } from './transactionTracker.js';
export type { TrackedTransaction, ConfirmationResult } from './transactionTracker.js';

// Bech32 Address Encoding/Decoding
export {
  parseZcashAddress,
  encodeZcashAddress,
  isValidZcashAddress,
  decodeBech32,
  encodeBech32,
  Bech32Error
} from './bech32.js';
export type { ParsedZcashAddress } from './bech32.js';

// Jubjub Curve Utilities
export {
  JubjubPoint,
  FieldElement,
  diversifyHash,
  derivePkd,
  computeSharedSecret,
  deriveNullifierKeyFromNsk,
  computeRandomizedVerificationKey,
  deriveEphemeralPublicKey,
  getSpendingKeyGenerator,
  getNullifierKeyGenerator
} from './jubjubHelper.js';

// Prover Status and Diagnostics
export {
  validateSpendProofInputs,
  validateOutputProofInputs,
  logProverStatus,
  logValidationResult,
  createProverError,
  detectProverAvailability,
  getProverStatus
} from './proverStatus.js';
export type {
  ProverAvailability,
  ProverStatus,
  ValidationResult as ProverValidationResult
} from './proverStatus.js';

