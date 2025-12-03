# Miden-Zcash Integration

Production-ready Zcash transaction signing integration for Miden WebSDK and Browser Wallet. Provides complete support for transparent and shielded (Sapling) transactions with full note scanning, proof generation, and blockchain synchronization.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [API Reference](#api-reference)
7. [Implementation Details](#implementation-details)
8. [Testing](#testing)
9. [Development](#development)

## Overview

This package implements a complete Zcash integration layer for the Miden blockchain ecosystem. It provides cryptographic key derivation from Miden account keys, transaction building and signing, shielded note scanning, and proof generation using multiple proving backends.

### Features

- **Key Derivation**: BIP32-compliant derivation of Zcash keys from Miden account private keys using HKDF-SHA256
- **Address Generation**: Support for transparent (t-address) and shielded (z-address) addresses
- **Transaction Building**: Construction of transparent and shielded transactions with proper serialization
- **Note Scanning**: Blockchain scanning and decryption of shielded notes using incoming viewing keys
- **Proof Generation**: Multiple proving backends (librustzcash, delegated service, Prize-WASM, snarkjs)
- **Merkle Tree Management**: Incremental Merkle tree for commitment tracking and witness generation
- **RPC Integration**: Full support for zcashd-compatible and Lightwalletd RPC endpoints
- **State Management**: UTXO caching and note caching with persistence

### Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.3.0
- Rust toolchain (for proving service, optional)
- Zcash testnet or mainnet RPC endpoint

## Architecture

### Module Structure

```
src/
├── address/          # Address validation and script generation
├── crypto/           # Key derivation and storage
├── rpc/              # RPC client and connection management
├── state/            # UTXO and note caching
├── transactions/     # Transaction building, signing, serialization
├── shielded/         # Shielded transaction support
├── wallet/           # Wallet integration and React hooks
├── provider/         # High-level ZcashProvider API
└── utils/            # Utility functions (bytes, encoding, hashing)
```

### Key Components

**ZcashProvider**: High-level API providing unified interface for all Zcash operations. Handles key derivation, transaction building, note scanning, and state management.

**ZcashModule**: Wallet integration layer that bridges Miden wallet with Zcash functionality. Provides account derivation, address management, and transaction operations.

**ShieldedTransactionBuilder**: Constructs Sapling shielded transactions with proper note encryption, commitment calculation, and proof generation.

**NoteScanner**: Scans blockchain for shielded notes belonging to a viewing key. Decrypts notes and maintains Merkle tree state.

**Groth16Integration**: Orchestrates proof generation across multiple backends with automatic fallback and validation.

### Proving Backends

1. **librustzcash**: Zcash's official Rust proving library compiled to WASM
2. **Delegated Service**: Remote proving service using librustzcash (recommended for production)
3. **Prize-WASM**: Optimized WASM prover from z-prize competition
4. **snarkjs**: JavaScript-based prover (fallback, requires .zkey files)

## Installation

### Package Installation

```bash
npm install @miden/zcash-integration
```

### Build from Source

```bash
git clone https://github.com/amiabix/Miden-Zcash.git
cd Miden-Zcash
npm install
npm run build
```

### External Dependencies

**Sapling Parameters**: Required for proof generation. Download from Zcash official sources:

```bash
mkdir -p public/params
curl -O https://download.z.cash/downloads/sapling-spend.params
curl -O https://download.z.cash/downloads/sapling-output.params
mv sapling-*.params public/params/
```

**WASM Prover**: Optional. Place librustzcash WASM files in `public/zcash_prover_wasm_bg.wasm` or configure path in provider options.

**Proving Service**: Optional. Build and run the Rust proving service:

```bash
cd proving-service
cargo build --release
cargo run
```

## Configuration

### ZcashProvider Configuration

```typescript
import { ZcashProvider } from '@miden/zcash-integration';

const provider = new ZcashProvider({
  network: 'testnet',
  rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',
  rpcCredentials: {
    username: 'rpcuser',
    password: 'rpcpassword'
  },
  proofGenerationMode: 'auto',
  delegatedProverUrl: 'http://localhost:8081',
  syncInterval: 60000
});
```

### ZcashModule Configuration

```typescript
import { createZcashModule } from '@miden/zcash-integration/wallet';

const zcashModule = createZcashModule({
  midenWallet: midenWalletAdapter,
  rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',
  proofGenerationMode: 'auto',
  delegatedProverUrl: 'http://localhost:8081',
  syncInterval: 60000
});

await zcashModule.initialize();
```

### Environment Variables

```bash
NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=https://zcash-testnet.horizenlabs.io
NEXT_PUBLIC_ZCASH_RPC_USER=rpcuser
NEXT_PUBLIC_ZCASH_RPC_PASSWORD=rpcpassword
NEXT_PUBLIC_ZCASH_PROVING_SERVICE=http://localhost:8081
NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true
```

## Usage

### Basic Usage

```typescript
import { createZcashModule } from '@miden/zcash-integration/wallet';

const zcashModule = createZcashModule({
  midenWallet: midenWalletAdapter,
  rpcEndpoint: 'https://zcash-testnet.horizenlabs.io'
});

await zcashModule.initialize();

const account = await zcashModule.getActiveZcashAccount();
console.log('Transparent address:', account.tAddress);
console.log('Shielded address:', account.zAddress);
```

### Address Synchronization

```typescript
const addresses = await zcashModule.getAddresses(midenAccountId);

const syncResult = await zcashModule.syncAddress(
  addresses.zAddress,
  'shielded'
);

console.log('Notes found:', syncResult.newTransactions);
console.log('Balance:', syncResult.updatedBalance);
```

### Transparent Transaction

```typescript
const txHash = await zcashModule.sendTransaction({
  from: account.tAddress,
  to: recipientAddress,
  amount: 1000000,
  fee: 10000
});

console.log('Transaction hash:', txHash);
```

### Shielded Transaction

```typescript
const txHash = await zcashModule.sendShieldedTransaction({
  from: account.zAddress,
  to: recipientZAddress,
  amount: 1000000,
  fee: 10000
});

console.log('Shielded transaction hash:', txHash);
```

### Note Scanning

```typescript
import { NoteScanner, NoteCache } from '@miden/zcash-integration/shielded';

const cache = new NoteCache();
const scanner = new NoteScanner(
  { ivk: viewingKey },
  cache,
  { batchSize: 100, scanOutgoing: true }
);

const notes = await scanner.scanBlocks(blocks, startHeight, endHeight);
cache.addNotes(notes);

const spendableNotes = cache.getSpendableNotes(address);
```

## API Reference

### ZcashProvider

Primary high-level API for Zcash operations.

#### Methods

**getAddresses(midenAccountId: string, midenPrivateKey: Uint8Array): Promise<ZcashAddresses>**

Derives Zcash addresses from Miden account. Returns transparent and shielded addresses.

**getBalance(address: string, type: AddressType): Promise<Balance>**

Retrieves balance for transparent or shielded address.

**syncAddress(address: string, type: AddressType): Promise<SyncResult>**

Synchronizes address state from blockchain. For shielded addresses, scans for notes and updates Merkle tree.

**sendTransaction(params: TransactionParams): Promise<string>**

Builds, signs, and broadcasts transparent transaction. Returns transaction hash.

**sendShieldedTransaction(params: ShieldedTransactionParams): Promise<string>**

Builds, signs, and broadcasts shielded transaction. Generates proofs, encrypts notes, and constructs full Sapling bundle.

**getCommitmentTreeAnchor(blockHeight?: number): Promise<Uint8Array>**

Retrieves Merkle tree root (anchor) for proof generation. Throws error if unavailable.

### ZcashModule

Wallet integration layer providing account management and transaction operations.

#### Methods

**getActiveZcashAccount(): Promise<DerivedZcashAccount>**

Derives Zcash account from active Miden account. Returns addresses and keys.

**getAddresses(midenAccountId: string): Promise<{ tAddress: string; zAddress: string }>**

Gets Zcash addresses for Miden account. Automatically populates viewing key cache.

**syncAddress(address: string, type: 'transparent' | 'shielded'): Promise<SyncResult>**

Synchronizes address state. For shielded addresses, performs note scanning if viewing key is available.

**sendTransaction(params: TransactionParams): Promise<string>**

Sends transparent transaction.

**sendShieldedTransaction(params: ShieldedTransactionParams): Promise<string>**

Sends shielded transaction with automatic proof generation.

### ShieldedTransactionBuilder

Constructs Sapling shielded transactions.

#### Methods

**buildShieldingTransaction(params: ShieldingTransactionParams): Promise<UnsignedShieldedTransaction>**

Builds transaction from transparent to shielded. Creates output notes and generates commitments.

**buildDeshieldingTransaction(params: DeshieldingTransactionParams): Promise<UnsignedShieldedTransaction>**

Builds transaction from shielded to transparent. Spends notes and creates transparent outputs.

**buildShieldedTransaction(params: ShieldedTransactionParams): Promise<UnsignedShieldedTransaction>**

Builds shielded-to-shielded transaction. Handles note selection, change output, and witness generation.

### NoteScanner

Scans blockchain for shielded notes.

#### Methods

**scanBlock(block: BlockData): Promise<ScannedNote[]>**

Scans single block for notes belonging to viewing key. Returns decrypted notes with metadata.

**scanBlocks(blocks: BlockData[], startHeight: number, endHeight: number): Promise<ScannedNote[]>**

Scans multiple blocks in batch. More efficient for large ranges.

### Groth16Integration

Orchestrates proof generation across multiple backends.

#### Methods

**initialize(options?: ProverOptions): Promise<void>**

Initializes proving system. Auto-detects available provers in order: librustzcash, delegated, Prize-WASM, snarkjs.

**generateSpendProof(inputs: SpendProofInputs): Promise<SaplingProof>**

Generates spend proof for shielded transaction. Validates inputs and returns 192-byte Groth16 proof.

**generateOutputProof(inputs: OutputProofInputs): Promise<SaplingProof>**

Generates output proof for new shielded note. Returns proof with commitment.

## Implementation Details

### Key Derivation

Keys are derived from Miden account private keys using HKDF-SHA256 with network as domain separator, followed by BIP32 derivation along path `m/44'/133'/account'/change/index`.

**Transparent Keys**: Derived at `m/44'/133'/0'/0/0` using secp256k1.

**Shielded Keys**: Spending key derived from account key, viewing key derived from spending key using Jubjub curve operations.

### Note Encryption

Shielded notes are encrypted using ChaCha20Poly1305 with key derived from shared secret between ephemeral key and payment address. Ciphertext format follows ZIP-307 specification.

### Merkle Tree

Incremental Merkle tree maintains commitment tree state locally. Tree depth is 32 levels for Sapling. Witnesses are generated on-demand for proof generation. Tree state is persisted to IndexedDB in browser environments.

### Proof Generation

Proofs are generated using Groth16 zk-SNARKs. The system supports multiple backends with automatic fallback:

1. Attempts librustzcash WASM
2. Falls back to delegated service if configured
3. Falls back to Prize-WASM if available
4. Falls back to snarkjs with .zkey files

All proofs are validated for correct format (192 bytes) and non-zero values before use.

### Transaction Serialization

Transactions are serialized according to ZIP-225 specification. Shielded transactions include:
- Transparent inputs/outputs (if any)
- Shielded spend descriptions (proofs, nullifiers, commitments)
- Shielded output descriptions (encrypted notes, commitments)
- Binding signature
- Value balance

## Testing

### Unit Tests

```bash
npm run test:unit
```

### End-to-End Tests

```bash
npm run test:e2e
```

### Shielded Transaction Tests

```bash
npm run test:shielded
```

### Smoke Test

```bash
npm run test:smoke
```

### Coverage

```bash
npm run test:coverage
```

## Development

### Build

```bash
npm run build
```

### Type Checking

```bash
npm run build:check
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Formatting

```bash
npm run format
npm run format:check
```

### Proving Service

Build and run the Rust proving service:

```bash
cd proving-service
cargo build --release
cargo run
```

Service runs on `http://localhost:8081` by default. Requires Sapling parameter files at `../miden-browser-wallet/public/params/` or paths specified via environment variables.

### Health Check

Verify external dependencies:

```bash
npm run zcash:health
```

### Setup Script

Download external dependencies:

```bash
npm run zcash:setup
```

## License

MIT

## Repository

https://github.com/amiabix/Miden-Zcash
