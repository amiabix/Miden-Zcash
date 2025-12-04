# Miden-Zcash Integration

Zcash transaction signing integration for Miden WebSDK and Browser Wallet. Provides support for transparent and shielded (Sapling) transactions with note scanning, proof generation, and blockchain synchronization.

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- Rust 1.70+ (for proving service, optional)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/amiabix/Miden-Zcash.git
   cd Miden-Zcash
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the SDK:**
   ```bash
   npm run build
   ```

4. **Set up the browser wallet:**
   ```bash
   cd miden-browser-wallet
   pnpm install
   ```

5. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your RPC credentials:
   ```bash
   # Required: RPC endpoint
   NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=https://zcash-testnet.gateway.tatum.io/
   
   # Required: API key (for Tatum or other services)
   NEXT_PUBLIC_ZCASH_RPC_API_KEY=your_api_key_here
   
   # Optional: For local zcashd node
   NEXT_PUBLIC_ZCASH_RPC_USER=your_rpc_username
   NEXT_PUBLIC_ZCASH_RPC_PASSWORD=your_rpc_password
   ```

6. **Download Sapling parameters:**
   ```bash
   cd miden-browser-wallet/public
   mkdir -p params
   curl -O https://download.z.cash/downloads/sapling-spend.params
   curl -O https://download.z.cash/downloads/sapling-output.params
   mv sapling-*.params params/
   ```

7. **Start the development server:**
   ```bash
   pnpm dev
   ```

   The wallet will be available at `http://localhost:3000`

## Configuration

### Environment Variables

All sensitive credentials must be configured via environment variables. **Never hardcode API keys or passwords in the code.**

#### Browser Wallet Configuration (`miden-browser-wallet/.env.local`)

**Required:**
- `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT` - Zcash RPC endpoint URL
- `NEXT_PUBLIC_ZCASH_RPC_API_KEY` - API key for RPC service (if required)

**Optional:**
- `NEXT_PUBLIC_ZCASH_RPC_USER` - RPC username (for local nodes)
- `NEXT_PUBLIC_ZCASH_RPC_PASSWORD` - RPC password (for local nodes)
- `NEXT_PUBLIC_ZCASH_PROVING_SERVICE` - Delegated proving service URL (default: `http://localhost:8081`)
- `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY` - Use backend proxy for RPC (default: `false`)

**Server-side (for backend proxy):**
- `ZCASH_RPC_ENDPOINT` - RPC endpoint (server-side only)
- `ZCASH_RPC_API_KEY` - API key (server-side only)
- `ZCASH_RPC_USER` - RPC username (server-side only)
- `ZCASH_RPC_PASSWORD` - RPC password (server-side only)

See `miden-browser-wallet/.env.example` for a complete template.

### RPC Endpoint Options

#### Option 1: Tatum API (Recommended for Testing)

1. Sign up at [https://tatum.io](https://tatum.io)
2. Get your API key from the dashboard
3. Configure:
   ```bash
   NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=https://zcash-testnet.gateway.tatum.io/
   NEXT_PUBLIC_ZCASH_RPC_API_KEY=your_tatum_api_key
   ```

**Limitations:** Tatum API has limited RPC support. Some methods like `listunspent` are not available, which prevents building transparent transactions.

#### Option 2: Local Zcash Node (Recommended for Production)

1. Install and run `zcashd`:
   ```bash
   # Install zcashd (see https://zcash.readthedocs.io/en/latest/rtd_pages/zcashd.html)
   # Configure ~/.zcash/zcash.conf:
   rpcuser=your_username
   rpcpassword=your_password
   rpcport=18232  # testnet
   # rpcport=8232  # mainnet
   ```

2. Configure:
   ```bash
   NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=http://localhost:18232
   NEXT_PUBLIC_ZCASH_RPC_USER=your_username
   NEXT_PUBLIC_ZCASH_RPC_PASSWORD=your_password
   ```

#### Option 3: Other RPC Providers

- **NOWNodes:** https://nownodes.io
- **FreeRPC:** https://freerpc.com
- **Stardust Staking:** https://starduststaking.com

Check each provider's documentation for API key requirements and endpoint URLs.

### Using Backend RPC Proxy

To keep API keys server-side and prevent exposure in the browser bundle:

1. Set `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true`
2. Configure server-side environment variables:
   ```bash
   ZCASH_RPC_ENDPOINT=https://zcash-testnet.gateway.tatum.io/
   ZCASH_RPC_API_KEY=your_api_key
   ```

The Next.js API route at `/api/zcash/rpc` will proxy all RPC requests.

## Project Structure

This repository contains three main components:

- **`src/`** - Core Zcash integration SDK (TypeScript)
- **`miden-browser-wallet/`** - Next.js browser wallet application
- **`proving-service/`** - Rust-based delegated proving service

### Core SDK (`src/`)

#### Module Structure

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

#### Main Exports

**Primary API:**
- `ZcashModule` / `createZcashModule()` - High-level wallet integration
- `ZcashProvider` - Low-level provider API

**Shielded Transactions:**
- `ShieldedTransactionBuilder` - Builds Sapling transactions
- `NoteScanner` - Scans blockchain for shielded notes
- `NoteCache` - Caches scanned notes
- `Groth16Integration` - Proof generation orchestration

**Proving Backends:**
- `LibrustzcashProver` - Zcash's official Rust library (WASM) - Primary
- `DelegatedProver` - Remote proving service client - Secondary

**Transaction Handling:**
- `ZcashTransactionBuilder` - Builds transparent transactions
- `ZcashSigner` - Signs transactions
- `TransactionSerializer` - Serializes transactions

**Key Management:**
- `ZcashKeyDerivation` - Derives Zcash keys from Miden keys
- `MidenKeyBridge` - Bridges Miden wallet to Zcash

### Browser Wallet (`miden-browser-wallet/`)

Next.js application that integrates the Zcash SDK with the Miden browser wallet.

#### Integration Points

- **`lib/zcash/zcashService.ts`** - Initializes Zcash module
- **`lib/zcash/midenWalletAdapter.ts`** - Adapts Miden wallet to Zcash SDK interface
- **`providers/zcash-provider.tsx`** - React context provider
- **`hooks/zcash/`** - React hooks for Zcash operations
- **`components/zcash/`** - UI components for Zcash features

### Proving Service (`proving-service/`)

Rust-based HTTP service for delegated proof generation using librustzcash.

#### Build

```bash
cd proving-service
cargo build --release
```

#### Run

```bash
cargo run
```

Service runs on `http://localhost:8081` by default.

#### Requirements

Sapling parameter files must be available at:
- `../miden-browser-wallet/public/params/sapling-spend.params`
- `../miden-browser-wallet/public/params/sapling-output.params`

Or specify paths via environment variables.

## Usage

### SDK Usage

```typescript
import { createZcashModule } from '@miden/zcash-integration/wallet';

const zcashModule = createZcashModule({
  midenWallet: midenWalletAdapter,
  rpcEndpoint: 'https://zcash-testnet.gateway.tatum.io/',
  rpcApiKey: 'your_api_key',
  proofGenerationMode: 'auto',
  delegatedProverUrl: 'http://localhost:8081',
  wasmPath: '/zcash_prover_wasm_bg.wasm'
});

await zcashModule.initialize();

const addresses = await zcashModule.getAddresses(midenAccountId);
const balance = await zcashModule.getBalance(addresses.zAddress, 'shielded');
```

### Sending Transactions

#### Shielded Transactions (z-to-z)

1. **Sync your shielded address first:**
   ```typescript
   await zcashModule.syncAddress(zAddress, 'shielded');
   ```
   This scans the blockchain to discover your shielded notes.

2. **Send transaction:**
   ```typescript
   const txId = await zcashModule.sendShieldedTransaction(
     account,
     recipientZAddress,
     amount,
     fee
   );
   ```

**Important:** Shielded transactions require notes to be discovered via syncing. If you get "No shielded notes found", you must sync your address first.

#### Transparent Transactions (t-to-t or t-to-z)

**Note:** Transparent transactions require a full Zcash node (not Tatum API) because they need the `listunspent` RPC method.

1. **Sync your transparent address:**
   ```typescript
   await zcashModule.syncAddress(tAddress, 'transparent');
   ```

2. **Send transaction:**
   ```typescript
   const txId = await zcashModule.sendTransaction({
     from: { address: tAddress, type: 'transparent' },
     to: { address: recipientAddress, type: 'transparent' },
     amount: 1000000, // zatoshi
     fee: 10000
   });
   ```

## Proof Generation

The SDK supports multiple proving backends with automatic fallback:

1. **librustzcash** - Zcash's official Rust library compiled to WASM (primary, actively used)
2. **Delegated Service** - Remote proving service using librustzcash (secondary, actively used)

Prover selection is configured via `proofGenerationMode`:
- `'auto'` - Auto-detects available provers in priority order (librustzcash → delegated)
- `'client'` - Uses client-side WASM provers
- `'delegated'` - Uses remote proving service

## External Dependencies

### Sapling Parameters

Required for proof generation. Download from Zcash:

```bash
mkdir -p miden-browser-wallet/public/params
cd miden-browser-wallet/public/params
curl -O https://download.z.cash/downloads/sapling-spend.params
curl -O https://download.z.cash/downloads/sapling-output.params
```

### WASM Prover

Place librustzcash WASM files in `miden-browser-wallet/public/zcash_prover_wasm_bg.wasm` or configure path in provider options.

## Key Derivation

Keys are derived from Miden account private keys using HKDF-SHA256 with network as domain separator, followed by BIP32 derivation.

**Transparent Keys:** Derived at `m/44'/133'/0'/0/0` using secp256k1.

**Shielded Keys:** Spending key derived from account key, viewing key derived from spending key using Jubjub curve operations.

## Note Scanning

Shielded notes are scanned from the blockchain using incoming viewing keys. The `NoteScanner` decrypts notes and maintains Merkle tree state. Scanned notes are cached in `NoteCache` for spending.

**Important:** Before sending shielded transactions, you must sync your address to discover notes. Use `syncAddress(address, 'shielded')` to scan the blockchain.

## Merkle Tree

Incremental Merkle tree maintains commitment tree state locally. Tree depth is 32 levels for Sapling. Witnesses are generated on-demand for proof generation. Tree state is persisted to IndexedDB in browser environments.

## Transaction Serialization

Transactions are serialized according to ZIP-225 specification. Shielded transactions include:
- Transparent inputs/outputs (if any)
- Shielded spend descriptions (proofs, nullifiers, commitments)
- Shielded output descriptions (encrypted notes, commitments)
- Binding signature
- Value balance

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

### Testing

#### Unit Tests

```bash
npm run test:unit
```

#### End-to-End Tests

```bash
npm run test:e2e
```

#### Shielded Transaction Tests

```bash
npm run test:shielded
```

#### Coverage

```bash
npm run test:coverage
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

## Security

### Credential Management

- **Never commit `.env.local` files** - They are in `.gitignore` by default
- **Never hardcode API keys or passwords** - Always use environment variables
- **Use backend proxy for production** - Set `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY=true` to keep API keys server-side
- **Rotate credentials regularly** - Especially if they are exposed or compromised

### Private Key Handling

- Private keys are derived from Miden account keys and never stored
- Keys are scrubbed from memory after use
- User confirmation is required for private key export

## Troubleshooting

### "No shielded notes found"

**Solution:** Sync your shielded address first:
```typescript
await zcashModule.syncAddress(zAddress, 'shielded');
```

### "RPC method 'listunspent' not supported"

**Cause:** Your RPC endpoint (e.g., Tatum API) doesn't support all RPC methods.

**Solution:** Use a full Zcash node for transparent transactions. See "RPC Endpoint Options" above.

### "Insufficient shielded funds"

**Possible causes:**
1. No notes found - Sync your address first
2. All notes are spent - Check your balance
3. Notes don't have enough confirmations - Wait for more confirmations

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

## License

MIT

## Repository

https://github.com/amiabix/Miden-Zcash
