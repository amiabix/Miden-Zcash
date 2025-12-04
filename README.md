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

<img width="1295" height="530" alt="Screenshot 2025-12-04 at 12 28 44 PM" src="https://github.com/user-attachments/assets/72de791b-9ea7-4685-85ad-207f498f28ee" />


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
    - Set `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT` to your local Zcash RPC endpoint URL (default: `http://localhost:18232` for testnet, `http://localhost:8232` for mainnet).
    - For a local zcashd node, set `NEXT_PUBLIC_ZCASH_RPC_USER` and `NEXT_PUBLIC_ZCASH_RPC_PASSWORD` as configured in `~/.zcash/zcash.conf`.
    - The wallet is designed to work with a local zcashd node. Ensure your zcashd node is running and accessible.

- **Download Sapling parameter files (required for proof generation):**
  - Create the directory `miden-browser-wallet/public/params/` if it does not exist.
  - Download `sapling-spend.params` and `sapling-output.params` from the official Zcash downloads page.
  - Place these files in `miden-browser-wallet/public/params/` (each file is ~50MB).

- **Start the development server:**
  - In `miden-browser-wallet/`, run `pnpm dev`.
  - By default, the server will be available at `http://localhost:3000/`.
  - On startup, the wallet will attempt to connect to the configured Zcash RPC endpoint. Ensure your local zcashd node is running before starting the wallet.

**Important Notes:**
- The wallet requires a local zcashd node running and accessible at the configured RPC endpoint.
- Transparent addresses are automatically imported into the zcashd wallet when syncing, which is required for `listunspent` to discover UTXOs.
- All amounts are handled in zatoshi (1 ZEC = 100,000,000 zatoshi). The RPC client automatically converts amounts from ZEC to zatoshi.
- Shielded balance is calculated from locally scanned notes, as `z_getbalance` is deprecated in recent zcashd versions.

## Configuration

Environment variables are the only mechanism for providing credentials. Never hardcode API keys or passwords in source code. Client-side variables use the `NEXT_PUBLIC_` prefix and are exposed to the browser bundle. Server-side variables without the prefix are only available to Next.js API routes.

The `NEXT_PUBLIC_ZCASH_RPC_ENDPOINT` variable specifies the Zcash RPC endpoint URL. For testnet, use `http://localhost:18232` for a local zcashd node. For mainnet, use `http://localhost:8232`. The default is `http://localhost:18232` for testnet.

For local zcashd nodes, configure `NEXT_PUBLIC_ZCASH_RPC_USER` and `NEXT_PUBLIC_ZCASH_RPC_PASSWORD` to match the `rpcuser` and `rpcpassword` values in `~/.zcash/zcash.conf`. The `NEXT_PUBLIC_ZCASH_PROVING_SERVICE` variable specifies the URL of the delegated proving service, defaulting to `http://localhost:8081` if not set.

The `NEXT_PUBLIC_USE_BACKEND_RPC_PROXY` variable, when set to `true`, routes all RPC requests through the Next.js API route at `/api/zcash/rpc` instead of making direct RPC calls from the browser. This keeps credentials server-side and prevents exposure in the browser bundle. When using the backend proxy, configure server-side variables `ZCASH_RPC_ENDPOINT`, `ZCASH_RPC_USER`, and `ZCASH_RPC_PASSWORD` instead of the `NEXT_PUBLIC_` prefixed versions.

**Important:** The wallet is configured to work with a local zcashd node. Ensure your zcashd node is running and properly configured before starting the wallet application.

## Key Derivation

Keys are derived from Miden account private keys through a multi-step process. First, a master seed is derived using HKDF-SHA256 with the Miden account ID, Miden private key, and network as inputs. The network acts as a domain separator, ensuring keys derived for testnet are different from keys derived for mainnet.

For transparent keys, the master seed is used to derive a BIP32 master key using HMAC-SHA512. The transparent private key is then derived at the BIP32 path `m/44'/133'/0'/0/0` using hardened derivation. The public key is computed from the private key using secp256k1 point multiplication. The address is generated by hashing the public key with SHA256 and RIPEMD160, then encoding with Base58Check using the network prefix.

<<<<<<< HEAD
For shielded keys, the spending key is derived from the account key using HKDF with a specific info parameter. The spending key consists of three components: the spending key authorization component (ask), the nullifier key component (nsk), and the outgoing viewing key component (ovk). The incoming viewing key (ivk) is derived from the spending key using scalar multiplication on the Jubjub curve. The diversified public key (pk_d) is derived from the diversifier and incoming viewing key using Jubjub scalar multiplication: `pk_d = [ivk] * DiversifyHash(d)` where `DiversifyHash(d)` is a generator point derived from the diversifier using `jubjub_findGroupHash`. This is critical for correct shielded address derivation. The shielded address is generated by encoding the diversifier and pk_d using Bech32 with the `zs1` prefix for testnet or mainnet.
=======
For shielded keys, the spending key is derived from the account key using HKDF with a specific info parameter. The spending key consists of three components: the spending key authorization component (ask), the nullifier key component (nsk), and the outgoing viewing key component (ovk). The incoming viewing key (ivk) is derived from the spending key using scalar multiplication on the Jubjub curve. The diversified public key (pk_d) is derived from the diversifier and incoming viewing key using Jubjub point operations. The shielded address is generated by encoding the diversifier and pk_d using Bech32 with the `zs1` prefix for testnet.

<img width="1270" height="1030" alt="Screenshot 2025-12-04 at 12 40 16 PM" src="https://github.com/user-attachments/assets/1c396494-4995-4992-a970-9956b298c637" />

>>>>>>> 8b5282baa0cab2145c31cc0a0868f944a6a2863f

## Address Generation

Transparent addresses are generated by computing a P2PKH (Pay-to-Public-Key-Hash) script from the public key hash. The script is `OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG`. The address is the Base58Check encoding of the script hash with the network prefix byte.

Shielded addresses are generated from a diversifier and the diversified public key. The diversifier is an 11-byte value that can be chosen arbitrarily, allowing multiple addresses to be derived from the same viewing key for privacy. The diversified public key is computed as `pk_d = [ivk] * G_d` where `G_d` is a generator point derived from the diversifier using `jubjub_findGroupHash`. The address encodes both the diversifier and pk_d using Bech32 encoding.

## Note Scanning

Shielded notes are discovered by scanning the blockchain for transactions that contain Sapling outputs. The scanning process begins by determining the block range to scan, starting from the last synced block height or the wallet creation block, and ending at the current chain tip.

For each block in the range, the scanner fetches the block data via RPC and filters transactions that contain Sapling outputs. Each output description contains an encrypted note that must be decrypted to determine if it belongs to the wallet.

Note decryption uses the incoming viewing key and the ephemeral public key from the output description. The shared secret is computed using ECDH on the Jubjub curve: `shared_secret = [ivk] * epk` where `ivk` is the incoming viewing key (scalar) and `epk` is the ephemeral public key (point). The decryption key is derived from the shared secret using BLAKE2s with a personalization string: `K_enc = BLAKE2s(shared_secret || epk, personalization="ZcashSaplingK_enc")`. The nonce is derived similarly: `nonce = BLAKE2s(shared_secret || 0x00, personalization="ZcashSaplingN_enc")[0:12]`. The note plaintext is decrypted using AES-256-GCM with the derived key and nonce.

After decryption, the note commitment is verified to match the commitment in the output description. If valid, the note is added to the note cache along with its Merkle tree witness. The Merkle tree is updated incrementally by appending the new commitment as a leaf and recomputing the root.

<<<<<<< HEAD
The incoming viewing key (ivk) is cached when addresses are loaded to enable note scanning. The viewing key is derived from the account's spending key and stored in the note cache for efficient note discovery.
=======
>>>>>>> 8b5282baa0cab2145c31cc0a0868f944a6a2863f

## Transaction Building

Transparent transactions are built by selecting UTXOs from the UTXO cache or via RPC `listunspent` call. Before building a transaction, the wallet automatically imports transparent addresses into the local zcashd node using the `importaddress` RPC command. This ensures that `listunspent` can discover UTXOs for the address. If a balance exists but no UTXOs are found, the wallet may attempt a rescan with `rescan=true`.

The UTXO selector uses a largest-first strategy, sorting available UTXOs by value in descending order and selecting the minimum set that covers the transaction amount plus fees. **Important:** All amounts are handled in zatoshi (1 ZEC = 100,000,000 zatoshi). The RPC client automatically converts amounts from ZEC (decimal) to zatoshi (integer) when receiving responses from zcashd. The transaction builder includes safeguards to detect and convert any amounts that appear to be in ZEC format.

Change is calculated as the difference between total input value and the sum of output value and fees. The transaction builder constructs a transaction structure with inputs referencing selected UTXOs and outputs for the recipient and change. Each input is signed using ECDSA on secp256k1 with the corresponding private key. The signature covers the transaction hash and is included in the scriptSig. The transaction is serialized to hex format for RPC broadcasting.

Shielded transactions are built by selecting notes from the note cache using a similar largest-first strategy. The note selector filters notes by address, excludes spent notes, and ensures notes have sufficient confirmations. Selected notes are used to build spend descriptions, each containing a nullifier, Merkle tree witness, and Groth16 proof.

Nullifiers are computed from the spending key and note nullifier seed using a pseudo-random function. The nullifier prevents double-spending by revealing that a note has been spent without revealing which note. Merkle tree witnesses are generated on-demand from the cached tree state, proving that the note commitment exists in the tree.

Output descriptions are built for the recipient and any change. Each output contains an encrypted note, computed commitment, and Groth16 proof. The note is encrypted using the recipient's diversified public key and a randomly generated ephemeral secret key. The commitment is computed using Pedersen hash on the Jubjub curve.

The binding signature is computed from the value balance and all spend and output descriptions. It ensures that the total value of inputs equals the total value of outputs plus fees. The transaction is serialized to binary format according to ZIP-225 specification.

<img width="1170" height="1025" alt="Screenshot 2025-12-04 at 1 08 50 PM" src="https://github.com/user-attachments/assets/be4e1d32-8de3-4b52-8444-16ccc3a94c03" />


## Proof Generation

Groth16 zk-SNARK proofs are generated for each spend and output description in shielded transactions. The spend proof proves knowledge of a spending key, note, and Merkle tree witness without revealing them. The output proof proves that an encrypted note contains a valid commitment without revealing the note contents.

Proof generation is orchestrated by the `Groth16Integration` class, which selects an available prover based on configuration and availability. The primary prover is librustzcash compiled to WASM, which runs client-side in the browser. The WASM module is loaded from `public/zcash_prover_wasm_bg.wasm` and initialized with Sapling parameter files.

When WASM proving is unavailable or fails, the integration falls back to a delegated proving service. The `DelegatedProver` class sends proof generation requests to an HTTP endpoint, typically running on `http://localhost:8081`. The service receives proof parameters, generates proofs using librustzcash on the server, and returns the proofs to the client.

Proof generation requires Sapling parameter files: `sapling-spend.params` for spend proofs and `sapling-output.params` for output proofs. These files are approximately 50MB each and must be downloaded from the Zcash website. The parameters are loaded into memory during prover initialization and used for all subsequent proof generation.

Each proof is 192 bytes and consists of three group elements: two points on G1 and one point on G2 of the BLS12-381 curve. The proof generation process involves computing a structured reference string from the parameters, evaluating the circuit with public and private inputs, and generating the proof using the Groth16 protocol.

## State Management

The UTXO cache stores unspent transaction outputs for transparent addresses. Each entry is keyed by transaction ID and output index, and contains the script public key, amount (in zatoshi), confirmations, and block height. The cache is updated when addresses are synced via the `listunspent` RPC call. The RPC client automatically converts amounts from ZEC to zatoshi when storing in the cache. UTXOs are marked as spent when they are used in transaction inputs, and removed from the cache after confirmation. The cache includes a `clearAddress()` method to remove all UTXOs for a specific address, useful for debugging unit conversion issues.

The note cache stores shielded notes discovered through blockchain scanning. Each note entry contains the note value, nullifier, commitment, diversifier, diversified public key, and Merkle tree witness. Notes are keyed by commitment for efficient lookup. The cache tracks spent nullifiers in a separate set to prevent double-spending attempts.

The Merkle tree state is maintained separately from the note cache. The tree is stored as an incremental structure, allowing new commitments to be appended without recomputing the entire tree. The tree state includes the root hash, size (number of commitments), and the block height of the last update. Witnesses are generated on-demand by traversing the tree from the commitment leaf to the root.

State persistence uses IndexedDB in browser environments and the file system in Node.js environments. The `MerkleTreePersistence` class handles serialization and deserialization of tree state. The note cache uses a similar persistence mechanism, storing notes and spent nullifiers separately for efficient updates.

<img width="975" height="835" alt="Screenshot 2025-12-04 at 4 08 04 PM" src="https://github.com/user-attachments/assets/bbd39613-13cd-4689-ae9a-a3cd8c1454ea" />

link to the explorer: https://testnet.cipherscan.app/address/tmQpa1o4w5QMnjhv7bS1tN6iHiragzYvF6Q


## Transaction Flow

When a user initiates a transparent transaction, the `ZcashModule.sendTransaction()` method is called with transaction parameters. The module delegates to `ZcashProvider.sendTransaction()`, which first validates the addresses and checks RPC connectivity. 

**Automatic Address Import:** Before building the transaction, the wallet automatically imports the transparent address into the local zcashd node using `importaddress` RPC command. This ensures that `listunspent` can discover UTXOs. If no UTXOs are found in the cache, the wallet triggers an automatic sync of the transparent address.

The provider calls `ZcashTransactionBuilder.buildTransaction()` to construct the transaction. The transaction builder calls `selectUTXOs()` which queries the UTXO cache. If the cache is empty, it falls back to an RPC `listunspent` call. The RPC client converts all amounts from ZEC (decimal) to zatoshi (integer) when receiving responses. UTXOs are selected using the largest-first strategy, and change is calculated. The builder includes safeguards to detect and convert any amounts that appear to be in ZEC format.

The builder constructs the transaction structure with inputs and outputs, then calls `ZcashSigner.signTransaction()` to sign each input. After signing, the transaction is serialized to hex format by `TransactionSerializer.serialize()`. The serialized transaction is validated by `TransactionValidator.validate()` to ensure it meets Zcash protocol requirements. Finally, the transaction is broadcast via RPC `sendrawtransaction` and the transaction ID is returned.

For shielded transactions, the flow begins with `ZcashModule.sendShieldedTransaction()`. The provider first checks that notes exist in the cache by calling `NoteSelector.selectNotes()`. If no notes are found, an error is thrown instructing the user to sync the address first.

Selected notes are passed to `ShieldedTransactionBuilder.buildShieldedTransaction()`, which constructs spend descriptions with nullifiers and Merkle tree witnesses. Output descriptions are built for the recipient and change, with encrypted notes and commitments. The builder then calls `Groth16Integration.generateProofs()` to generate proofs for all spends and outputs.

After proof generation, the binding signature is computed and the transaction is signed by `ShieldedSigner.signTransaction()`. The transaction is serialized to binary format according to ZIP-225 by `ShieldedTransactionSerializer.serialize()`. The serialized transaction is broadcast via RPC and the transaction ID is returned.

## RPC Communication

The RPC client communicates with Zcash nodes using JSON-RPC 2.0 protocol (compatible with zcashd's JSON-RPC 1.0). Requests are sent as HTTP POST requests with JSON payloads containing the method name, parameters, and request ID. Responses contain a result field on success or an error field on failure.

Authentication is handled using Basic Auth for local zcashd nodes. Credentials are encoded in the Authorization header using the `rpcuser` and `rpcpassword` from `~/.zcash/zcash.conf`.

The client implements retry logic with exponential backoff for transient failures. Timeouts are set to 30 seconds by default, with configurable values. Connection errors are distinguished from RPC errors, allowing the application to handle network issues separately from protocol errors. The client includes an `importAddress` method that calls the `importaddress` RPC command to import addresses into the local zcashd wallet, which is required for `listunspent` to discover UTXOs.

**Unit Conversion:** The `listunspent` RPC method returns amounts in ZEC (decimal format). The RPC client automatically converts these amounts to zatoshi (integer format, 1 ZEC = 100,000,000 zatoshi) when processing responses. This conversion is critical for correct transaction building and balance calculations.

When using the backend proxy, all RPC requests are routed through the Next.js API route at `/api/zcash/rpc`. The route reads server-side environment variables for credentials, preventing exposure in the browser bundle. The proxy forwards requests to the configured RPC endpoint and returns responses to the client. The proxy includes error handling for node reindexing states, returning appropriate HTTP status codes (e.g., 503 Service Unavailable) when the node is unavailable.

## Error Handling

Errors are categorized by type and handled appropriately. RPC errors include connection failures, authentication failures, method-not-found errors, and node reindexing states. Connection failures trigger retry logic with exponential backoff. Authentication failures indicate misconfigured credentials and are surfaced immediately. Method-not-found errors indicate the RPC endpoint doesn't support the required functionality. Node reindexing states are detected and return HTTP 503 (Service Unavailable) to indicate temporary unavailability.

Transaction building errors include insufficient funds, invalid addresses, and validation failures. Insufficient funds errors distinguish between no UTXOs available (requiring address sync or import) and insufficient balance (requiring more funds). The error messages provide detailed diagnostics including available balance, required amount, and potential causes (address not imported, not funded, not confirmed). Invalid address errors provide specific validation failure reasons. Validation failures indicate protocol violations and prevent transaction broadcasting.

**Unit Conversion Errors:** The system includes safeguards to detect and handle unit mismatches between ZEC and zatoshi. If UTXO amounts are detected in ZEC format during transaction building, they are automatically converted. Critical errors are logged if conversion fails, prompting users to clear the cache.

Proof generation errors include prover unavailability, parameter loading failures, and proof generation timeouts. When a prover is unavailable, the system attempts fallback provers in order of priority. Parameter loading failures indicate missing or corrupted Sapling parameter files. Proof generation timeouts occur when proofs take longer than the configured timeout (default 5 minutes).

State synchronization errors include blockchain scanning failures and cache update failures. Scanning failures may occur due to RPC unavailability or corrupted block data. Cache update failures indicate persistence layer issues and are logged for debugging. The system includes automatic rescan logic: if a transparent address has a balance but no UTXOs are found, it attempts `importAddress` with `rescan=true`.

## Development

Build the SDK by running `npm run build` in the root directory. This compiles TypeScript source files to JavaScript in the `dist/` directory. Type checking without building is done with `npm run build:check`. Watch mode for development is available with `npm run build:watch`.

Run tests with `npm run test:unit` for unit tests, `npm run test:e2e` for end-to-end tests, and `npm run test:shielded` for shielded transaction tests. Coverage reports are generated with `npm run test:coverage`. Tests use Jest as the test runner and mock RPC responses for isolated testing.

Linting is performed with ESLint using `npm run lint`, and auto-fixing is available with `npm run lint:fix`. Code formatting uses Prettier with `npm run format` to format and `npm run format:check` to verify formatting.

The health check script (`npm run zcash:health`) verifies external dependencies including Sapling parameter files, WASM prover files, and RPC endpoint connectivity. The setup script (`npm run zcash:setup`) downloads required dependencies to the correct locations.

The proving service is built with `cargo build --release` in the `proving-service/` directory. Run the service with `cargo run`, which starts an HTTP server on port 8081 by default. The service requires Sapling parameter files at `../miden-browser-wallet/public/params/sapling-*.params` or paths specified via environment variables.

## Recent Updates

### Critical Fixes

- **ECDH Bug Fix:** Fixed critical bug in shielded address derivation where `pk_d` was incorrectly derived using SHA256 instead of Jubjub scalar multiplication. The correct derivation is `pk_d = [ivk] * DiversifyHash(d)`.

- **ZEC to Zatoshi Conversion:** Fixed unit mismatch where RPC responses from zcashd return amounts in ZEC (decimal) but the system expects zatoshi (integer). The RPC client now automatically converts all amounts from ZEC to zatoshi when processing `listunspent` responses.

- **Automatic Address Import:** Implemented automatic import of transparent addresses into the local zcashd node using `importaddress` RPC command. This ensures `listunspent` can discover UTXOs without manual intervention.

- **Viewing Key Caching:** Implemented proper caching of incoming viewing keys (ivk) when addresses are loaded, enabling note scanning for shielded addresses.

- **Auto-Sync for Transactions:** Transparent addresses are automatically synced before transaction building if no UTXOs are found in the cache.

- **Error Handling Improvements:** Enhanced error messages with detailed diagnostics, unit conversion safeguards, and proper handling of node reindexing states.

- **Tatum API Removal:** Removed all references to Tatum API. The wallet now exclusively uses local zcashd nodes.

## License

MIT

## Repository

https://github.com/amiabix/Miden-Zcash
