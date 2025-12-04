# Miden-Zcash Integration

TypeScript implementation of Zcash transaction signing for Miden WebSDK and Browser Wallet. Supports transparent and shielded (Sapling) transactions with note scanning, proof generation, and blockchain synchronization.

## Table of Contents

1. [Architecture](#architecture)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
5. [Implementation Details](#implementation-details)
6. [Transaction Flow](#transaction-flow)
7. [Cryptographic Implementation](#cryptographic-implementation)
8. [State Management](#state-management)
9. [Proof Generation](#proof-generation)
10. [Development](#development)

## Architecture

### Repository Structure

```
Miden-Zcash/
├── src/                      # Core SDK (TypeScript)
│   ├── address/             # Address validation, Bech32 encoding, script generation
│   ├── crypto/              # Key derivation (HKDF, BIP32), key storage
│   ├── rpc/                 # RPC client, connection management, endpoint configuration
│   ├── state/               # UTXO cache, note cache, state persistence
│   ├── transactions/        # Transaction building, signing, serialization, validation
│   ├── shielded/            # Shielded transaction implementation
│   │   ├── jubjubHelper.ts  # Jubjub curve operations (ECDH, point arithmetic)
│   │   ├── noteScanner.ts  # Blockchain scanning, note decryption
│   │   ├── noteCache.ts    # Note storage, selection, balance calculation
│   │   ├── transactionBuilder.ts  # Shielded transaction construction
│   │   ├── groth16Integration.ts  # Proof generation orchestration
│   │   ├── librustzcashProver.ts  # WASM-based prover
│   │   ├── delegatedProver.ts     # Remote proving service client
│   │   └── merkleTreePersistence.ts  # Merkle tree state persistence
│   ├── wallet/              # Wallet integration layer
│   │   ├── integration.ts  # ZcashModule (high-level API)
│   │   └── midenKeyBridge.ts  # Miden wallet adapter
│   ├── provider/            # ZcashProvider (low-level API)
│   └── utils/               # Utilities (bytes, encoding, hashing)
├── miden-browser-wallet/   # Next.js browser wallet application
│   ├── app/                 # Next.js pages and API routes
│   ├── components/          # React UI components
│   ├── lib/                 # Service initialization
│   ├── providers/           # React context providers
│   └── hooks/               # React hooks
└── proving-service/         # Rust HTTP service for delegated proof generation
```

### Component Architecture

**ZcashModule** (`src/wallet/integration.ts`)
- High-level API for wallet integration
- Wraps ZcashProvider with Miden wallet adapter
- Handles account derivation and key management

**ZcashProvider** (`src/provider/ZcashProvider.ts`)
- Low-level API for all Zcash operations
- Manages RPC connection, state caches, transaction building
- Coordinates between transaction builders, signers, provers

**MidenKeyBridge** (`src/wallet/midenKeyBridge.ts`)
- Bridges Miden wallet API to Zcash SDK
- Handles private key export with user confirmation
- Derives Zcash keys from Miden account keys

**ZcashKeyDerivation** (`src/crypto/keyDerivation.ts`)
- Derives Zcash keys from Miden account private keys
- Uses HKDF-SHA256 with network as domain separator
- BIP32 derivation for transparent keys (m/44'/133'/0'/0/0)
- Jubjub curve operations for shielded keys

**NoteScanner** (`src/shielded/noteScanner.ts`)
- Scans blockchain blocks for shielded notes
- Decrypts notes using incoming viewing keys
- Maintains Merkle tree state incrementally

**NoteCache** (`src/shielded/noteCache.ts`)
- Stores scanned notes with witnesses
- Tracks spent nullifiers
- Selects notes for spending (largest-first strategy)

**ShieldedTransactionBuilder** (`src/shielded/transactionBuilder.ts`)
- Constructs Sapling transactions
- Generates spend and output descriptions
- Computes binding signatures

**Groth16Integration** (`src/shielded/groth16Integration.ts`)
- Orchestrates proof generation
- Manages prover selection (librustzcash, delegated, fallbacks)
- Handles proof generation errors and fallbacks

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher, or pnpm 8.0.0 or higher
- Rust 1.70.0 or higher (for proving service, optional)
- Git

### Build Steps

1. Clone repository:
```bash
git clone https://github.com/amiabix/Miden-Zcash.git
cd Miden-Zcash
```

2. Install SDK dependencies:
```bash
npm install
```

3. Build SDK:
```bash
npm run build
```

4. Install browser wallet dependencies:
```bash
cd miden-browser-wallet
pnpm install
```

5. Configure environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your RPC credentials
```

6. Download Sapling parameters:
```bash
cd miden-browser-wallet/public
mkdir -p params
curl -O https://download.z.cash/downloads/sapling-spend.params
curl -O https://download.z.cash/downloads/sapling-output.params
mv sapling-*.params params/
```

7. Start development server:
```bash
pnpm dev
```

Server runs on `http://localhost:3000` by default.

## Configuration

### Environment Variables

All credentials must be provided via environment variables. Never hardcode API keys or passwords.

#### Client-Side Variables (`NEXT_PUBLIC_*`)

**Required:**
- `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT`: Zcash RPC endpoint URL
  - Testnet example: `https://zcash-testnet.gateway.tatum.io/`
  - Mainnet example: `https://zcash-mainnet.gateway.tatum.io/`
  - Local node: `http://localhost:18232` (testnet) or `http://localhost:8232` (mainnet)

- `NEXT_PUBLIC_ZCASH_RPC_API_KEY`: API key for RPC service
  - Required for Tatum and some other providers
  - Get from provider dashboard

**Optional:**
- `NEXT_PUBLIC_ZCASH_RPC_USER`: RPC username (for local nodes with Basic Auth)
- `NEXT_PUBLIC_ZCASH_RPC_PASSWORD`: RPC password (for local nodes)
- `NEXT_PUBLIC_ZCASH_PROVING_SERVICE`: Delegated proving service URL (default: `http://localhost:8081`)
- `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY`: Use backend proxy (`true`/`false`, default: `false`)
- `NEXT_PUBLIC_ALLOW_NETWORK_MISMATCH`: Allow network mismatch for testing (`true`/`false`, default: `false`)

#### Server-Side Variables (for backend proxy)

Used by Next.js API route `/api/zcash/rpc` when `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true`:

- `ZCASH_RPC_ENDPOINT`: RPC endpoint (server-side only)
- `ZCASH_RPC_API_KEY`: API key (server-side only)
- `ZCASH_RPC_USER`: RPC username (server-side only)
- `ZCASH_RPC_PASSWORD`: RPC password (server-side only)

### RPC Endpoint Configuration

#### Tatum API

1. Sign up at https://tatum.io
2. Obtain API key from dashboard
3. Configure:
```bash
NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=https://zcash-testnet.gateway.tatum.io/
NEXT_PUBLIC_ZCASH_RPC_API_KEY=your_tatum_api_key
```

**Limitations:**
- Does not support `listunspent` RPC method
- Transparent transactions cannot be built without `listunspent`
- Free tier: 5 requests/minute
- Premium tier: 200 requests/second

#### Local Zcash Node

1. Install `zcashd` (see https://zcash.readthedocs.io/en/latest/rtd_pages/zcashd.html)
2. Configure `~/.zcash/zcash.conf`:
```
rpcuser=your_username
rpcpassword=your_password
rpcport=18232  # testnet
# rpcport=8232  # mainnet
testnet=1  # for testnet
```
3. Configure:
```bash
NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=http://localhost:18232
NEXT_PUBLIC_ZCASH_RPC_USER=your_username
NEXT_PUBLIC_ZCASH_RPC_PASSWORD=your_password
```

#### Other RPC Providers

- NOWNodes: https://nownodes.io
- FreeRPC: https://freerpc.com
- Stardust Staking: https://starduststaking.com

Check provider documentation for API key requirements and endpoint URLs.

### Backend RPC Proxy

To keep API keys server-side and prevent exposure in browser bundle:

1. Set `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true`
2. Configure server-side variables:
```bash
ZCASH_RPC_ENDPOINT=https://zcash-testnet.gateway.tatum.io/
ZCASH_RPC_API_KEY=your_api_key
```

The Next.js API route at `/api/zcash/rpc` proxies all RPC requests.

## API Reference

### ZcashModule

High-level API for wallet integration.

#### Constructor

```typescript
import { createZcashModule } from '@miden/zcash-integration/wallet';

const zcashModule = createZcashModule({
  midenWallet: midenWalletAdapter,
  rpcEndpoint?: string,
  rpcCredentials?: { username: string; password: string },
  rpcApiKey?: string,
  proofGenerationMode?: 'client' | 'delegated' | 'auto',
  delegatedProverUrl?: string,
  syncInterval?: number
});
```

#### Methods

**`initialize(): Promise<void>`**
- Initializes the module and RPC connection
- Must be called before other methods
- Throws if RPC connection fails

**`getAddresses(midenAccountId: string): Promise<ZcashAddresses>`**
- Derives Zcash addresses from Miden account
- Returns `{ tAddress: string, zAddress: string }`
- Requires private key export (user confirmation)
- Caches addresses per account ID

**`getBalance(address: string, type: 'transparent' | 'shielded'): Promise<Balance>`**
- Fetches balance for address
- Transparent: queries RPC or CipherScan API
- Shielded: queries note cache (requires syncing first)
- Returns `{ confirmed: number, unconfirmed: number, total: number, pending: number }` in zatoshi

**`syncAddress(address: string, type: 'transparent' | 'shielded'): Promise<SyncResult>`**
- Synchronizes address with blockchain
- Transparent: calls `listunspent` RPC, updates UTXO cache
- Shielded: scans blocks, decrypts notes, updates note cache and Merkle tree
- Returns `{ address, newTransactions, updatedBalance, lastSynced, blockHeight }`

**`sendTransaction(params: TransactionParams): Promise<string>`**
- Sends transparent transaction (t-to-t or t-to-z)
- Requires UTXOs (call `syncAddress` first)
- Returns transaction ID (32-byte hash as hex)

**`sendShieldedTransaction(account: DerivedZcashAccount, recipient: string, amount: bigint, fee: bigint): Promise<string>`**
- Sends shielded transaction (z-to-z or z-to-t)
- Requires notes in cache (call `syncAddress` first)
- Returns transaction ID

### ZcashProvider

Low-level API for direct Zcash operations.

#### Constructor

```typescript
import { ZcashProvider } from '@miden/zcash-integration/provider';

const provider = new ZcashProvider({
  network: 'testnet' | 'mainnet',
  rpcEndpoint: string,
  rpcCredentials?: { username: string; password: string },
  rpcApiKey?: string,
  proofGenerationMode?: 'client' | 'delegated' | 'auto',
  delegatedProverUrl?: string,
  syncInterval?: number,
  cacheSize?: number
});
```

#### Methods

**`initialize(): Promise<void>`**
- Initializes provider and RPC connection
- Sets up state caches and scanners

**`getAddresses(midenAccountId: string, midenPrivateKey: Uint8Array): Promise<ZcashAddresses>`**
- Derives addresses from Miden account private key
- Uses `ZcashKeyDerivation` for key derivation

**`getBalance(address: string, type: 'transparent' | 'shielded'): Promise<Balance>`**
- Fetches balance with caching (10 minute TTL)
- Transparent: RPC `getreceivedbyaddress` or CipherScan API
- Shielded: queries `NoteCache.getBalance()`

**`syncAddress(address: string, type: 'transparent' | 'shielded', viewingKey?: Uint8Array): Promise<SyncResult>`**
- Synchronizes address state
- Transparent: `listunspent` RPC, updates `UTXOCache`
- Shielded: `NoteScanner.scanBlocks()`, updates `NoteCache` and Merkle tree

**`buildTransaction(params: TransactionParams): Promise<SignedTransaction>`**
- Builds and signs transparent transaction
- Uses `ZcashTransactionBuilder` and `ZcashSigner`
- Validates with `TransactionValidator`

**`buildShieldedTransaction(params: ShieldedTransactionParams): Promise<SignedTransaction>`**
- Builds and signs shielded transaction
- Uses `ShieldedTransactionBuilder`, `Groth16Integration`, `ShieldedSigner`
- Generates Groth16 proofs for spends and outputs

**`sendTransaction(params: TransactionParams): Promise<string>`**
- Builds, signs, serializes, and broadcasts transaction
- Returns transaction ID from RPC `sendrawtransaction`

**`sendShieldedTransaction(account: DerivedZcashAccount, recipient: string, amount: bigint, fee: bigint): Promise<string>`**
- End-to-end shielded transaction sending
- Selects notes, builds transaction, generates proofs, signs, serializes, broadcasts

## Implementation Details

### Key Derivation

Keys are derived from Miden account private keys using the following process:

1. **Master Seed Derivation:**
   - Input: Miden account ID, Miden private key, network
   - Process: HKDF-SHA256 with network as domain separator
   - Output: 64-byte master seed

2. **BIP32 Master Key:**
   - Input: Master seed
   - Process: BIP32 master key derivation (HMAC-SHA512)
   - Output: BIP32 master key (private key, chain code)

3. **Transparent Keys:**
   - Derivation path: `m/44'/133'/0'/0/0`
   - Curve: secp256k1
   - Output: Private key, public key, address (P2PKH)

4. **Shielded Keys:**
   - Spending key: Derived from account key using HKDF
   - Viewing key: Derived from spending key using Jubjub scalar multiplication
   - Address: Derived from diversifier and viewing key using Jubjub point operations

### Address Generation

**Transparent Address (t-address):**
- Format: Base58Check encoding
- Network prefix: `0x1CB8` (testnet) or `0x1CB8` (mainnet)
- Script: P2PKH (Pay-to-Public-Key-Hash)

**Shielded Address (z-address):**
- Format: Bech32 encoding with `zs1` prefix (testnet) or `zs1` prefix (mainnet)
- Components: Diversifier (11 bytes), pk_d (32 bytes, Jubjub point)
- Generation: `pk_d = [ivk] * G_d` where `G_d` is derived from diversifier

### Note Scanning

Shielded notes are discovered by scanning blockchain blocks:

1. **Block Range Selection:**
   - Start: Last synced block height or wallet creation block
   - End: Current chain tip
   - Increment: Process blocks sequentially

2. **Transaction Filtering:**
   - Filter transactions with Sapling outputs
   - Extract output descriptions from transaction

3. **Note Decryption:**
   - For each output, attempt decryption with incoming viewing key
   - Process: ECDH on Jubjub curve, derive decryption key, decrypt note
   - Validate: Check note commitment matches output commitment

4. **Cache Update:**
   - Add decrypted notes to `NoteCache`
   - Update Merkle tree with new commitments
   - Generate witnesses for proof generation

### Transaction Building

**Transparent Transaction:**
1. Select UTXOs using `UTXOSelector` (largest-first strategy)
2. Calculate change output (total - amount - fee)
3. Build transaction with inputs and outputs
4. Sign inputs with `ZcashSigner` (ECDSA on secp256k1)
5. Serialize to hex format

**Shielded Transaction:**
1. Select notes using `NoteSelector` (largest-first strategy)
2. Generate change output (if needed)
3. Build spend descriptions:
   - Compute nullifiers
   - Generate Merkle tree witnesses
   - Generate Groth16 proofs
4. Build output descriptions:
   - Encrypt notes
   - Compute commitments
   - Generate Groth16 proofs
5. Compute binding signature
6. Serialize to binary format (ZIP-225)

### Proof Generation

Groth16 zk-SNARK proofs are generated for shielded transactions:

**Spend Proof:**
- Circuit: Sapling spend circuit
- Public inputs: Root, nullifier, commitment
- Private inputs: Spending key, note, witness, randomness
- Output: Groth16 proof (192 bytes)

**Output Proof:**
- Circuit: Sapling output circuit
- Public inputs: Commitment, value commitment
- Private inputs: Note, randomness
- Output: Groth16 proof (192 bytes)

**Prover Selection:**
1. librustzcash (WASM): Primary, client-side
2. Delegated service: Secondary, server-side
3. Fallback provers: Prize-WASM, snarkjs (not actively used)

### Merkle Tree

Incremental Merkle tree maintains Sapling commitment tree state:

- Depth: 32 levels
- Hash function: Pedersen hash (Jubjub curve)
- Storage: IndexedDB in browser, file system in Node.js
- Updates: Append-only (new commitments added as leaves)
- Witnesses: Generated on-demand for proof generation

## Transaction Flow

### Transparent Transaction (t-to-t)

1. User calls `sendTransaction()` with recipient and amount
2. `ZcashProvider.sendTransaction()` called
3. `ZcashTransactionBuilder.buildTransaction()`:
   - `selectUTXOs()`: Queries `UTXOCache` or RPC `listunspent`
   - Calculates change output
   - Constructs transaction structure
4. `ZcashSigner.signTransaction()`: Signs inputs with ECDSA
5. `TransactionSerializer.serialize()`: Converts to hex
6. `TransactionValidator.validate()`: Validates structure
7. RPC `sendrawtransaction`: Broadcasts to network
8. Returns transaction ID

### Shielded Transaction (z-to-z)

1. User calls `sendShieldedTransaction()` with recipient and amount
2. `ZcashProvider.sendShieldedTransaction()` called
3. `NoteSelector.selectNotes()`: Selects notes from `NoteCache`
4. `ShieldedTransactionBuilder.buildShieldedTransaction()`:
   - Builds spend descriptions (nullifiers, proofs)
   - Builds output descriptions (encrypted notes, proofs)
   - Computes binding signature
5. `Groth16Integration.generateProofs()`: Generates Groth16 proofs
6. `ShieldedSigner.signTransaction()`: Signs with spending key
7. `ShieldedTransactionSerializer.serialize()`: Converts to binary
8. RPC `sendrawtransaction`: Broadcasts to network
9. Returns transaction ID

## Cryptographic Implementation

### Jubjub Curve

Jubjub is a twisted Edwards curve with parameters:
- `a = -1`
- `d = -(10240/10241)` (approximately -0.99990234375)
- Base field: `F_q` where `q = 2^255 - 19`
- Scalar field: `F_r` where `r = 2^252 + 27742317777372353535851937790883648493`

Operations are implemented using `@noble/curves` library for proven correctness:
- Point addition: `P + Q`
- Point doubling: `2P`
- Scalar multiplication: `[k]P`

### ECDH Key Agreement

Shared secret computation for note encryption/decryption:
```
shared_secret = [ivk] * epk
```
Where:
- `ivk`: Incoming viewing key (scalar)
- `epk`: Ephemeral public key (point)
- Result: 32-byte shared secret

### Note Encryption

Encryption uses symmetric encryption with key derived from shared secret:
```
K_enc = BLAKE2s(shared_secret || epk, personalization="ZcashSaplingK_enc")
nonce = BLAKE2s(shared_secret || 0x00, personalization="ZcashSaplingN_enc")[0:12]
ciphertext = AES-256-GCM(K_enc, nonce, plaintext)
```

### Nullifier Generation

Nullifier prevents double-spending:
```
nk = PRF^nf_nk(ask)
nullifier = PRF^nf_nk(nk, rho)
```
Where:
- `ask`: Spending key authorization component
- `rho`: Note nullifier seed
- `PRF^nf_nk`: Pseudo-random function

### Commitment Generation

Note commitment for Merkle tree:
```
cm = PedersenHash(d, pk_d, v, rho, r)
```
Where:
- `d`: Diversifier
- `pk_d`: Diversified public key
- `v`: Value
- `rho`: Nullifier seed
- `r`: Randomness

## State Management

### UTXO Cache

`UTXOCache` stores unspent transaction outputs:
- Key: `{txid, vout}`
- Value: `{txid, vout, scriptPubKey, amount, confirmations, blockHeight}`
- Methods: `addUTXO()`, `removeUTXO()`, `getSpendableUTXOs()`, `getBalance()`

### Note Cache

`NoteCache` stores shielded notes:
- Key: Commitment (32 bytes)
- Value: `SaplingNote` with value, nullifier, witness, spent flag
- Methods: `addNote()`, `markSpent()`, `getSpendableNotes()`, `getBalance()`
- Persistence: IndexedDB in browser

### Merkle Tree State

Merkle tree state persisted separately:
- Root: Current tree root (32 bytes)
- Size: Number of commitments
- Block height: Last updated block
- Storage: `MerkleTreePersistence` handles IndexedDB/file system

## Proof Generation

### Prover Architecture

**LibrustzcashProver:**
- Implementation: Zcash's official Rust library compiled to WASM
- Location: `public/zcash_prover_wasm_bg.wasm`
- Initialization: Loads WASM module, initializes with Sapling parameters
- Proof generation: Calls WASM functions for spend/output proofs
- Status: Primary prover, actively used

**DelegatedProver:**
- Implementation: HTTP client for remote proving service
- Endpoint: Configurable (default: `http://localhost:8081`)
- Protocol: POST requests with proof parameters, returns proofs
- Status: Secondary prover, used when WASM unavailable

**Groth16Integration:**
- Orchestrates prover selection and fallback
- Detects available provers
- Handles errors and retries
- Manages proof generation timeout (5 minutes)

### Proof Generation Process

1. **Parameter Loading:**
   - Load Sapling spend/output parameters
   - Verify parameter file integrity

2. **Prover Selection:**
   - Check `proofGenerationMode` configuration
   - Detect available provers
   - Select prover based on priority

3. **Proof Generation:**
   - Spend proof: Generate for each spend description
   - Output proof: Generate for each output description
   - Handle errors: Retry with fallback prover if needed

4. **Proof Validation:**
   - Verify proof structure (192 bytes)
   - Validate proof format

## Development

### Build Commands

```bash
# Build SDK
npm run build

# Type check only
npm run build:check

# Watch mode
npm run build:watch
```

### Testing

```bash
# Unit tests
npm run test:unit

# End-to-end tests
npm run test:e2e

# Shielded transaction tests
npm run test:shielded

# Coverage report
npm run test:coverage
```

### Linting and Formatting

```bash
# Lint
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Health Check

Verify external dependencies:
```bash
npm run zcash:health
```

Downloads and verifies:
- Sapling parameter files
- WASM prover files
- RPC endpoint connectivity

### Setup Script

Download external dependencies:
```bash
npm run zcash:setup
```

Downloads:
- Sapling parameters to `miden-browser-wallet/public/params/`
- WASM prover files (if available)

### Proving Service

Build Rust proving service:
```bash
cd proving-service
cargo build --release
```

Run service:
```bash
cargo run
```

Service runs on `http://localhost:8081` by default.

Requirements:
- Sapling parameters at `../miden-browser-wallet/public/params/sapling-*.params`
- Or specify paths via environment variables

## Security Considerations

### Credential Management

- Never commit `.env.local` files (in `.gitignore`)
- Never hardcode API keys or passwords
- Use backend proxy in production (`NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true`)
- Rotate credentials if exposed

### Private Key Handling

- Private keys derived from Miden keys, never stored
- Keys scrubbed from memory after use (`fill(0)`)
- User confirmation required for private key export
- Viewing keys cached (safe for note scanning)

### RPC Security

- Use HTTPS for RPC endpoints
- Validate RPC responses
- Handle RPC errors gracefully
- Implement rate limiting for RPC calls

## Troubleshooting

### "No shielded notes found"

**Cause:** Address not synced, or no notes exist for address.

**Solution:**
```typescript
await zcashModule.syncAddress(zAddress, 'shielded');
```

### "RPC method 'listunspent' not supported"

**Cause:** RPC endpoint (e.g., Tatum API) doesn't support all RPC methods.

**Solution:** Use full Zcash node for transparent transactions. See RPC endpoint configuration.

### "Insufficient shielded funds"

**Possible causes:**
1. No notes in cache: Sync address first
2. All notes spent: Check balance
3. Insufficient confirmations: Wait for more confirmations

**Solution:**
```typescript
// Check balance
const balance = await zcashModule.getBalance(zAddress, 'shielded');
console.log('Shielded balance:', balance);

// Sync to discover notes
await zcashModule.syncAddress(zAddress, 'shielded');
```

### Build Errors

**TypeScript errors:**
```bash
npm run build:check
```

**Missing dependencies:**
```bash
npm install
cd miden-browser-wallet && pnpm install
```

**Missing Sapling parameters:**
```bash
npm run zcash:setup
```

### RPC Connection Issues

**Connection refused:**
- Verify RPC endpoint URL
- Check RPC service is running (for local nodes)
- Verify API key is correct (for remote services)

**Authentication failed:**
- Verify credentials in `.env.local`
- Check RPC username/password for local nodes
- Verify API key for remote services

**Timeout errors:**
- Increase timeout in `ZcashRPCClient` configuration
- Check network connectivity
- Verify RPC endpoint is accessible

## License

MIT

## Repository

https://github.com/amiabix/Miden-Zcash
