# Miden-Zcash Integration

Zcash transaction signing integration for Miden WebSDK and Browser Wallet. Provides support for transparent and shielded (Sapling) transactions with note scanning, proof generation, and blockchain synchronization.

## Project Structure

This repository contains three main components:

- **`src/`** - Core Zcash integration SDK (TypeScript)
- **`miden-browser-wallet/`** - Next.js browser wallet application
- **`proving-service/`** - Rust-based delegated proving service

## Core SDK (`src/`)

### Module Structure

```
src/
├── address/          # Address validation and script generation
├── crypto/           # Key derivation and storage
├── rpc/              # RPC client and connection management
├── state/            # UTXO and note caching
├── transactions/     # Transaction building, signing, serialization
├── shielded/         # Shielded transaction support
├── wallet/           # Wallet integration layer
├── provider/         # ZcashProvider API
└── utils/            # Utility functions
```

### Main Exports

**Primary API:**
- `ZcashModule` / `createZcashModule()` - High-level wallet integration
- `ZcashProvider` - Low-level provider API

**Shielded Transactions:**
- `ShieldedTransactionBuilder` - Builds Sapling transactions
- `NoteScanner` - Scans blockchain for shielded notes
- `NoteCache` - Caches scanned notes
- `Groth16Integration` - Proof generation orchestration

**Proving Backends:**
- `LibrustzcashProver` - Zcash's official Rust library (WASM)
- `DelegatedProver` - Remote proving service client
- `PrizeWasmProver` - Prize-WASM prover
- `SnarkjsProver` - snarkjs-based prover

**Transaction Handling:**
- `ZcashTransactionBuilder` - Builds transparent transactions
- `ZcashSigner` - Signs transactions
- `TransactionSerializer` - Serializes transactions

**Key Management:**
- `ZcashKeyDerivation` - Derives Zcash keys from Miden keys
- `MidenKeyBridge` - Bridges Miden wallet to Zcash

### Installation

```bash
npm install
npm run build
```

### Usage

```typescript
import { createZcashModule } from '@miden/zcash-integration/wallet';

const zcashModule = createZcashModule({
  midenWallet: midenWalletAdapter,
  rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',
  proofGenerationMode: 'auto',
  delegatedProverUrl: 'http://localhost:8081',
  wasmPath: '/zcash_prover_wasm_bg.wasm'
});

await zcashModule.initialize();

const addresses = await zcashModule.getAddresses(midenAccountId);
const balance = await zcashModule.getBalance(addresses.zAddress, 'shielded');
```

## Browser Wallet (`miden-browser-wallet/`)

Next.js application that integrates the Zcash SDK with the Miden browser wallet.

### Setup

```bash
cd miden-browser-wallet
pnpm install
```

### Configuration

Environment variables:

```bash
NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=https://zcash-testnet.horizenlabs.io
NEXT_PUBLIC_ZCASH_RPC_USER=rpcuser
NEXT_PUBLIC_ZCASH_RPC_PASSWORD=rpcpassword
NEXT_PUBLIC_ZCASH_PROVING_SERVICE=http://localhost:8081
NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=false
```

### Development

```bash
pnpm dev
```

The wallet runs on `http://localhost:3000` by default.

### Integration Points

- **`lib/zcash/zcashService.ts`** - Initializes Zcash module
- **`lib/zcash/midenWalletAdapter.ts`** - Adapts Miden wallet to Zcash SDK interface
- **`providers/zcash-provider.tsx`** - React context provider
- **`hooks/zcash/`** - React hooks for Zcash operations
- **`components/zcash/`** - UI components for Zcash features

## Proving Service (`proving-service/`)

Rust-based HTTP service for delegated proof generation using librustzcash.

### Build

```bash
cd proving-service
cargo build --release
```

### Run

```bash
cargo run
```

Service runs on `http://localhost:8081` by default.

### Requirements

Sapling parameter files must be available at:
- `../miden-browser-wallet/public/params/sapling-spend.params`
- `../miden-browser-wallet/public/params/sapling-output.params`

Or specify paths via environment variables.

## Proof Generation

The SDK supports multiple proving backends with automatic fallback:

1. **librustzcash** - Zcash's official Rust library compiled to WASM (primary)
2. **Delegated Service** - Remote proving service using librustzcash
3. **Prize-WASM** - Optimized WASM prover from z-prize competition
4. **snarkjs** - JavaScript-based prover (fallback, requires .zkey files)

Prover selection is configured via `proofGenerationMode`:
- `'auto'` - Auto-detects available provers in priority order
- `'client'` - Uses client-side WASM provers
- `'delegated'` - Uses remote proving service

## External Dependencies

### Sapling Parameters

Required for proof generation. Download from Zcash:

```bash
mkdir -p public/params
curl -O https://download.z.cash/downloads/sapling-spend.params
curl -O https://download.z.cash/downloads/sapling-output.params
mv sapling-*.params public/params/
```

### WASM Prover

Place librustzcash WASM files in `public/zcash_prover_wasm_bg.wasm` or configure path in provider options.

### RPC Endpoint

Configure a Zcash RPC endpoint (testnet or mainnet). Examples:
- Testnet: `https://zcash-testnet.horizenlabs.io`
- Testnet Lightwalletd: `https://testnet-lightwalletd.zecwallet.co:9067`

## Key Derivation

Keys are derived from Miden account private keys using HKDF-SHA256 with network as domain separator, followed by BIP32 derivation.

**Transparent Keys:** Derived at `m/44'/133'/0'/0/0` using secp256k1.

**Shielded Keys:** Spending key derived from account key, viewing key derived from spending key using Jubjub curve operations.

## Note Scanning

Shielded notes are scanned from the blockchain using incoming viewing keys. The `NoteScanner` decrypts notes and maintains Merkle tree state. Scanned notes are cached in `NoteCache` for spending.

## Merkle Tree

Incremental Merkle tree maintains commitment tree state locally. Tree depth is 32 levels for Sapling. Witnesses are generated on-demand for proof generation. Tree state is persisted to IndexedDB in browser environments.

## Transaction Serialization

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
