# Miden-Zcash Integration

TypeScript implementation of Zcash transaction signing for Miden WebSDK and Browser Wallet. Supports transparent and shielded (Sapling) transactions with note scanning, proof generation, and synchronization.

## Architecture

The Miden-Zcash integration follows a layered architecture, separating concerns into three principal components:

- **Core SDK** (`src/`): Implements Zcash protocol features in TypeScript, offering both high-level and low-level APIs.
- **Browser Wallet** (`miden-browser-wallet/`): A Next.js application that integrates the Core SDK and provides the user-facing wallet interface.
- **Proving Service** (`proving-service/`): An optional Rust HTTP service that generates Groth16 proofs server-side for Sapling shielded transactions where client devices fail to prove locally.

Below is an architecture diagram illustrating their interaction and modular decomposition:

```
                                    +----------------------+
                                    |  Zcash Node (rpc)    |
                                    +----------+-----------+
                                               ^
                                               |
                           JSON-RPC            |
                                               v
+-----------------+               +------------------------+                +----------------------+
| Browser Wallet  | <—HTTP/UI—>   |    Core SDK (src/)     | <——HTTP——>      |  Proving Service    |
| (Next.js App)   |               |                        |   (optional)    |    (Rust HTTP)      |
+-----------------+               +------------------------+                +----------------------+
        |                                    ^
        |                                    |
        v                                    |
+----------------------------+               |
|    Miden Wallet API        |  <——————      |
+----------------------------+               |
                                             |
         (modules by functionality)          |
                                             |
    ┌─────────────────────────────────────────────────────────────────────────────┐
    |  address/     – address validation & encoding (Bech32, script creation)     |
    |  crypto/      – key derivation from Miden keys (HKDF, BIP32, Jubjub ops)    |
    |  rpc/         – JSON-RPC client, multi-auth (basic, API key)                |
    |  state/       – blockchain UTXO & note cache (IndexedDB/file, Merkle proof) |
    |  transactions/– transparent tx building, signing (ECDSA), serialization     |
    |  shielded/    – Sapling note scan, encryption, proof orchestration          |
    |  wallet/      – integration between SDK and wallet, account/key mgmt.       |
    |  provider/    – coordination layer: manages RPC, cache, sign/prove/scan     |
    └─────────────────────────────────────────────────────────────────────────────┘
```

### Component Details

- **address/**: Validates addresses, handles Bech32 encoding for Sapling, and creates scripts for transparent addresses.
- **crypto/**: Derives Zcash keys from Miden account keys using HKDF-SHA256 domain separated by network, then BIP32 for transparent, Jubjub for shielded operations.
- **rpc/**: Communicates with Zcash nodes with JSON-RPC, supporting various authentication schemes (Basic Auth, API keys).
- **state/**: Manages blockchain state with UTXOCache (for transparent outputs, keyed by txid:vout) and NoteCache (for Sapling notes, witnesses, and spent nullifiers); persists to IndexedDB (browser) or filesystem (Node).
- **transactions/**: Builds, signs, and serializes transparent transactions; uses largest-first UTXO selection; ECDSA signing; serialization for RPC broadcast.
- **shielded/**: Implements Sapling privacy: Jubjub ops (`@noble/curves`), blockchain scanning/decryption using ivk, maintaining witnesses; shielded tx construction with proofs and signatures; Groth16 proof orchestration (lib, service, fallbacks).
- **wallet/**: Connects the SDK to the wallet UI/API; manages ZcashModule which is the developer API facade, and bridges key export/derivation from Miden.
- **provider/**: The main operational orchestrator that wires up all modules, maintains caches, spawns builder/signer/scanner/provers, and optimizes RPC/state access.

**Initialization Flow:**
Upon initialization, the provider constructs and connects all modules, establishes RPC connection(s), and initiates state and balance caches for rapid wallet operation. Proving can automatically offload to the service or run in-browser as needed.

***

This modular separation enables easy extension (e.g., new proof mechanisms), cache persistence across both browser and Node environments, and robust integration with external wallets and proving services.

## Installation

- **Clone the repository:**
  - Use `git clone` to copy the repository to your local machine.

- **Install SDK dependencies:**
  - Ensure you have Node.js 18 or higher installed.
  - In the root directory, run `npm install`.
  - Build the SDK by running `npm run build`.

- **Install browser wallet dependencies:**
  - Make sure you have pnpm 8 or higher.
  - Navigate to `miden-browser-wallet/`.
  - Run `pnpm install` to install dependencies for the Next.js wallet app.

- **Configure environment variables:**
  - Copy the example environment file:  
    `cp miden-browser-wallet/.env.example miden-browser-wallet/.env.local`
  - Edit `miden-browser-wallet/.env.local` and fill in your RPC credentials:
    - Set `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT` to your Zcash RPC endpoint URL.
    - For Tatum API or similar services, set `NEXT_PUBLIC_ZCASH_RPC_API_KEY` to your API key.
    - For a local zcashd node, set `NEXT_PUBLIC_ZCASH_RPC_USER` and `NEXT_PUBLIC_ZCASH_RPC_PASSWORD` as configured in `~/.zcash/zcash.conf`.

- **Download Sapling parameter files (required for proof generation):**
  - Create the directory `miden-browser-wallet/public/params/` if it does not exist.
  - Download `sapling-spend.params` and `sapling-output.params` from the official Zcash downloads page.
  - Place these files in `miden-browser-wallet/public/params/` (each file is ~50MB).

- **Start the development server:**
  - In `miden-browser-wallet/`, run `pnpm dev`.
  - By default, the server will be available at `http://localhost:3000/`.
  - On startup, the wallet will attempt to connect to the configured Zcash RPC endpoint.

## Configuration

Environment variables are the only mechanism for providing credentials. Never hardcode API keys or passwords in source code. Client-side variables use the `NEXT_PUBLIC_` prefix and are exposed to the browser bundle. Server-side variables without the prefix are only available to Next.js API routes.

The `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT` variable specifies the Zcash RPC endpoint URL. For testnet, use `https://zcash-testnet.gateway.tatum.io/` for Tatum API or `http://localhost:18232` for a local zcashd node. For mainnet, use `https://zcash-mainnet.gateway.tatum.io/` or `http://localhost:8232`. The `NEXT_PUBLIC_ZCASH_RPC_API_KEY` variable is required for Tatum and similar services that use header-based authentication. Get your API key from the provider's dashboard.

For local zcashd nodes, configure `NEXT_PUBLIC_ZCASH_RPC_USER` and `NEXT_PUBLIC_ZCASH_RPC_PASSWORD` to match the `rpcuser` and `rpcpassword` values in `~/.zcash/zcash.conf`. The `NEXT_PUBLIC_ZCASH_PROVING_SERVICE` variable specifies the URL of the delegated proving service, defaulting to `http://localhost:8081` if not set.

The `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY` variable, when set to `true`, routes all RPC requests through the Next.js API route at `/api/zcash/rpc` instead of making direct RPC calls from the browser. This keeps API keys server-side and prevents exposure in the browser bundle. When using the backend proxy, configure server-side variables `ZCASH_RPC_ENDPOINT`, `ZCASH_RPC_API_KEY`, `ZCASH_RPC_USER`, and `ZCASH_RPC_PASSWORD` instead of the `NEXT_PUBLIC_` prefixed versions.

## Key Derivation

Keys are derived from Miden account private keys through a multi-step process. First, a master seed is derived using HKDF-SHA256 with the Miden account ID, Miden private key, and network as inputs. The network acts as a domain separator, ensuring keys derived for testnet are different from keys derived for mainnet.

For transparent keys, the master seed is used to derive a BIP32 master key using HMAC-SHA512. The transparent private key is then derived at the BIP32 path `m/44'/133'/0'/0/0` using hardened derivation. The public key is computed from the private key using secp256k1 point multiplication. The address is generated by hashing the public key with SHA256 and RIPEMD160, then encoding with Base58Check using the network prefix.

For shielded keys, the spending key is derived from the account key using HKDF with a specific info parameter. The spending key consists of three components: the spending key authorization component (ask), the nullifier key component (nsk), and the outgoing viewing key component (ovk). The incoming viewing key (ivk) is derived from the spending key using scalar multiplication on the Jubjub curve. The diversified public key (pk_d) is derived from the diversifier and incoming viewing key using Jubjub point operations. The shielded address is generated by encoding the diversifier and pk_d using Bech32 with the `zs1` prefix for testnet or mainnet.

## Address Generation

Transparent addresses are generated by computing a P2PKH (Pay-to-Public-Key-Hash) script from the public key hash. The script is `OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG`. The address is the Base58Check encoding of the script hash with the network prefix byte.

Shielded addresses are generated from a diversifier and the diversified public key. The diversifier is an 11-byte value that can be chosen arbitrarily, allowing multiple addresses to be derived from the same viewing key for privacy. The diversified public key is computed as `pk_d = [ivk] * G_d` where `G_d` is a generator point derived from the diversifier using `jubjub_findGroupHash`. The address encodes both the diversifier and pk_d using Bech32 encoding.

## Note Scanning

Shielded notes are discovered by scanning the blockchain for transactions that contain Sapling outputs. The scanning process begins by determining the block range to scan, starting from the last synced block height or the wallet creation block, and ending at the current chain tip.

For each block in the range, the scanner fetches the block data via RPC and filters transactions that contain Sapling outputs. Each output description contains an encrypted note that must be decrypted to determine if it belongs to the wallet.

Note decryption uses the incoming viewing key and the ephemeral public key from the output description. The shared secret is computed using ECDH on the Jubjub curve: `shared_secret = [ivk] * epk` where `ivk` is the incoming viewing key (scalar) and `epk` is the ephemeral public key (point). The decryption key is derived from the shared secret using BLAKE2s with a personalization string: `K_enc = BLAKE2s(shared_secret || epk, personalization="ZcashSaplingK_enc")`. The nonce is derived similarly: `nonce = BLAKE2s(shared_secret || 0x00, personalization="ZcashSaplingN_enc")[0:12]`. The note plaintext is decrypted using AES-256-GCM with the derived key and nonce.

After decryption, the note commitment is verified to match the commitment in the output description. If valid, the note is added to the note cache along with its Merkle tree witness. The Merkle tree is updated incrementally by appending the new commitment as a leaf and recomputing the root.

## Transaction Building

Transparent transactions are built by selecting UTXOs from the UTXO cache or via RPC `listunspent` call. The UTXO selector uses a largest-first strategy, sorting available UTXOs by value in descending order and selecting the minimum set that covers the transaction amount plus fees. Change is calculated as the difference between total input value and the sum of output value and fees.

The transaction builder constructs a transaction structure with inputs referencing selected UTXOs and outputs for the recipient and change. Each input is signed using ECDSA on secp256k1 with the corresponding private key. The signature covers the transaction hash and is included in the scriptSig. The transaction is serialized to hex format for RPC broadcasting.

Shielded transactions are built by selecting notes from the note cache using a similar largest-first strategy. The note selector filters notes by address, excludes spent notes, and ensures notes have sufficient confirmations. Selected notes are used to build spend descriptions, each containing a nullifier, Merkle tree witness, and Groth16 proof.

Nullifiers are computed from the spending key and note nullifier seed using a pseudo-random function. The nullifier prevents double-spending by revealing that a note has been spent without revealing which note. Merkle tree witnesses are generated on-demand from the cached tree state, proving that the note commitment exists in the tree.

Output descriptions are built for the recipient and any change. Each output contains an encrypted note, computed commitment, and Groth16 proof. The note is encrypted using the recipient's diversified public key and a randomly generated ephemeral secret key. The commitment is computed using Pedersen hash on the Jubjub curve.

The binding signature is computed from the value balance and all spend and output descriptions. It ensures that the total value of inputs equals the total value of outputs plus fees. The transaction is serialized to binary format according to ZIP-225 specification.

## Proof Generation

Groth16 zk-SNARK proofs are generated for each spend and output description in shielded transactions. The spend proof proves knowledge of a spending key, note, and Merkle tree witness without revealing them. The output proof proves that an encrypted note contains a valid commitment without revealing the note contents.

Proof generation is orchestrated by the `Groth16Integration` class, which selects an available prover based on configuration and availability. The primary prover is librustzcash compiled to WASM, which runs client-side in the browser. The WASM module is loaded from `public/zcash_prover_wasm_bg.wasm` and initialized with Sapling parameter files.

When WASM proving is unavailable or fails, the integration falls back to a delegated proving service. The `DelegatedProver` class sends proof generation requests to an HTTP endpoint, typically running on `http://localhost:8081`. The service receives proof parameters, generates proofs using librustzcash on the server, and returns the proofs to the client.

Proof generation requires Sapling parameter files: `sapling-spend.params` for spend proofs and `sapling-output.params` for output proofs. These files are approximately 50MB each and must be downloaded from the Zcash website. The parameters are loaded into memory during prover initialization and used for all subsequent proof generation.

Each proof is 192 bytes and consists of three group elements: two points on G1 and one point on G2 of the BLS12-381 curve. The proof generation process involves computing a structured reference string from the parameters, evaluating the circuit with public and private inputs, and generating the proof using the Groth16 protocol.

## State Management

The UTXO cache stores unspent transaction outputs for transparent addresses. Each entry is keyed by transaction ID and output index, and contains the script public key, amount, confirmations, and block height. The cache is updated when addresses are synced via the `listunspent` RPC call. UTXOs are marked as spent when they are used in transaction inputs, and removed from the cache after confirmation.

The note cache stores shielded notes discovered through blockchain scanning. Each note entry contains the note value, nullifier, commitment, diversifier, diversified public key, and Merkle tree witness. Notes are keyed by commitment for efficient lookup. The cache tracks spent nullifiers in a separate set to prevent double-spending attempts.

The Merkle tree state is maintained separately from the note cache. The tree is stored as an incremental structure, allowing new commitments to be appended without recomputing the entire tree. The tree state includes the root hash, size (number of commitments), and the block height of the last update. Witnesses are generated on-demand by traversing the tree from the commitment leaf to the root.

State persistence uses IndexedDB in browser environments and the file system in Node.js environments. The `MerkleTreePersistence` class handles serialization and deserialization of tree state. The note cache uses a similar persistence mechanism, storing notes and spent nullifiers separately for efficient updates.

## Transaction Flow

When a user initiates a transparent transaction, the `ZcashModule.sendTransaction()` method is called with transaction parameters. The module delegates to `ZcashProvider.sendTransaction()`, which first validates the addresses and checks RPC connectivity. The provider calls `ZcashTransactionBuilder.buildTransaction()` to construct the transaction.

The transaction builder calls `selectUTXOs()` which queries the UTXO cache. If the cache is empty, it falls back to an RPC `listunspent` call. UTXOs are selected using the largest-first strategy, and change is calculated. The builder constructs the transaction structure with inputs and outputs, then calls `ZcashSigner.signTransaction()` to sign each input.

After signing, the transaction is serialized to hex format by `TransactionSerializer.serialize()`. The serialized transaction is validated by `TransactionValidator.validate()` to ensure it meets Zcash protocol requirements. Finally, the transaction is broadcast via RPC `sendrawtransaction` and the transaction ID is returned.

For shielded transactions, the flow begins with `ZcashModule.sendShieldedTransaction()`. The provider first checks that notes exist in the cache by calling `NoteSelector.selectNotes()`. If no notes are found, an error is thrown instructing the user to sync the address first.

Selected notes are passed to `ShieldedTransactionBuilder.buildShieldedTransaction()`, which constructs spend descriptions with nullifiers and Merkle tree witnesses. Output descriptions are built for the recipient and change, with encrypted notes and commitments. The builder then calls `Groth16Integration.generateProofs()` to generate proofs for all spends and outputs.

After proof generation, the binding signature is computed and the transaction is signed by `ShieldedSigner.signTransaction()`. The transaction is serialized to binary format according to ZIP-225 by `ShieldedTransactionSerializer.serialize()`. The serialized transaction is broadcast via RPC and the transaction ID is returned.

## RPC Communication

The RPC client communicates with Zcash nodes using JSON-RPC 2.0 protocol. Requests are sent as HTTP POST requests with JSON payloads containing the method name, parameters, and request ID. Responses contain a result field on success or an error field on failure.

Authentication is handled based on the endpoint type. For endpoints using Basic Auth, credentials are encoded in the Authorization header. For endpoints using API key authentication, the key is included in a custom header (typically `x-api-key` for Tatum or `api-key` for NOWNodes).

The client implements retry logic with exponential backoff for transient failures. Timeouts are set to 30 seconds by default, with configurable values. Connection errors are distinguished from RPC errors, allowing the application to handle network issues separately from protocol errors.

When using the backend proxy, all RPC requests are routed through the Next.js API route at `/api/zcash/rpc`. The route reads server-side environment variables for credentials, preventing exposure in the browser bundle. The proxy forwards requests to the configured RPC endpoint and returns responses to the client.

## Error Handling

Errors are categorized by type and handled appropriately. RPC errors include connection failures, authentication failures, and method-not-found errors. Connection failures trigger retry logic with exponential backoff. Authentication failures indicate misconfigured credentials and are surfaced immediately. Method-not-found errors indicate the RPC endpoint doesn't support the required functionality, such as `listunspent` not being available on Tatum API.

Transaction building errors include insufficient funds, invalid addresses, and validation failures. Insufficient funds errors distinguish between no UTXOs available (requiring address sync) and insufficient balance (requiring more funds). Invalid address errors provide specific validation failure reasons. Validation failures indicate protocol violations and prevent transaction broadcasting.

Proof generation errors include prover unavailability, parameter loading failures, and proof generation timeouts. When a prover is unavailable, the system attempts fallback provers in order of priority. Parameter loading failures indicate missing or corrupted Sapling parameter files. Proof generation timeouts occur when proofs take longer than the configured timeout (default 5 minutes).

State synchronization errors include blockchain scanning failures and cache update failures. Scanning failures may occur due to RPC unavailability or corrupted block data. Cache update failures indicate persistence layer issues and are logged for debugging.

## Development

Build the SDK by running `npm run build` in the root directory. This compiles TypeScript source files to JavaScript in the `dist/` directory. Type checking without building is done with `npm run build:check`. Watch mode for development is available with `npm run build:watch`.

Run tests with `npm run test:unit` for unit tests, `npm run test:e2e` for end-to-end tests, and `npm run test:shielded` for shielded transaction tests. Coverage reports are generated with `npm run test:coverage`. Tests use Jest as the test runner and mock RPC responses for isolated testing.

Linting is performed with ESLint using `npm run lint`, and auto-fixing is available with `npm run lint:fix`. Code formatting uses Prettier with `npm run format` to format and `npm run format:check` to verify formatting.

The health check script (`npm run zcash:health`) verifies external dependencies including Sapling parameter files, WASM prover files, and RPC endpoint connectivity. The setup script (`npm run zcash:setup`) downloads required dependencies to the correct locations.

The proving service is built with `cargo build --release` in the `proving-service/` directory. Run the service with `cargo run`, which starts an HTTP server on port 8081 by default. The service requires Sapling parameter files at `../miden-browser-wallet/public/params/sapling-*.params` or paths specified via environment variables.

## License

MIT

## Repository

https://github.com/amiabix/Miden-Zcash
