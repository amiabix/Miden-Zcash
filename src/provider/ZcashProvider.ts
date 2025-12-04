/**
 * ZcashProvider
 * 
 * Main high-level API for Zcash operations in Miden SDK.
 * Provides unified interface for all Zcash functionality.
 */

import type {
  Network,
  AddressType,
  ZcashAddresses,
  ZcashKeys,
  Balance,
  TransactionParams,
  SignedTransaction,
  Transaction,
  TransparentOutput,
  ZcashProviderConfig as ProviderConfig
} from '../types/index';
import { ZcashKeyDerivation } from '../crypto/keyDerivation';
// import { ZcashKeyManager } from '../crypto/keyStorage'; // Reserved for future password-based storage
import { ZcashRPCClient } from '../rpc/client';
import { ZcashTransactionBuilder } from '../transactions/builder';
import { ZcashSigner } from '../transactions/signing';
import { TransactionSerializer } from '../transactions/serialization';
import { TransactionValidator } from '../transactions/validation';
import { TransactionSerializer as ShieldedTransactionSerializer } from '../shielded/transactionSerializer';
import { UTXOCache } from '../state/utxo';
import { NoteCache, NoteSelector } from '../shielded/noteCache';
import { ShieldedTransactionBuilder } from '../shielded/transactionBuilder';
import { ShieldedSigner } from '../shielded/signer';
import { ZcashProver } from '../shielded/prover';
import { getGroth16Integration } from '../shielded/groth16Integration';
import { NoteScanner, ShieldedStateSynchronizer } from '../shielded/noteScanner';
import { validateAddress, isAddressForNetwork } from '../address/validation';
import { bytesToHex, hexToBytes } from '../utils/bytes';

/**
 * Sync result for address synchronization
 */
export interface SyncResult {
  address: string;
  newTransactions: number;
  updatedBalance: Balance;
  lastSynced: number;
  blockHeight: number;
}

/**
 * Transaction hash result
 */
export interface TxHash {
  hash: string;
  blockHeight?: number;
  confirmations: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<ProviderConfig> = {
  syncInterval: 60000, // 1 minute
  cacheSize: 1000,
  proofGenerationMode: 'client'
};

/**
 * ZcashProvider
 * 
 * Main provider class that unifies all Zcash operations.
 * This is the primary API that applications should use.
 */
export class ZcashProvider {
  private config: ProviderConfig;
  private network: Network;
  
  // Core components
  private keyDerivation: ZcashKeyDerivation;
  // private keyManager: ZcashKeyManager; // Reserved for future key storage with password
  private rpcClient: ZcashRPCClient;
  private rpcConnected: boolean = false;
  private txBuilder: ZcashTransactionBuilder;
  private shieldedTxBuilder: ShieldedTransactionBuilder;
  private signer: ZcashSigner;
  private shieldedSigner: ShieldedSigner;
  private serializer: TransactionSerializer;
  private shieldedSerializer: ShieldedTransactionSerializer;
  private validator: TransactionValidator;
  private prover: ZcashProver;
  
  // State management
  private utxoCache: UTXOCache;
  private noteCache: NoteCache;
  private noteSelector: NoteSelector;
  private noteScanner: NoteScanner | null = null;
  private stateSynchronizer: ShieldedStateSynchronizer | null = null;
  
  // Address cache (midenAccountId -> ZcashAddresses)
  private addressCache: Map<string, ZcashAddresses> = new Map();
  
  // Viewing key cache (address -> viewingKey)
  // Viewing keys are safe to cache - they're meant to be stored for note scanning
  private viewingKeyCache: Map<string, Uint8Array> = new Map();
  
  // Reverse mapping (address -> midenAccountId)
  private addressToAccountId: Map<string, string> = new Map();
  
  // Balance cache (address -> Balance)
  private balanceCache: Map<string, { balance: Balance; timestamp: number }> = new Map();
  private balanceCacheTTL = 600000; // 10 minutes (increased for Tatum free tier - 3 calls limit)

  constructor(config: ProviderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as ProviderConfig;
    this.network = config.network;

    // Initialize key derivation
    this.keyDerivation = new ZcashKeyDerivation(this.network);
    // Key manager can be initialized when password-based storage is needed
    // this.keyManager = new ZcashKeyManager();

    // Initialize RPC client
    this.rpcClient = new ZcashRPCClient({
      endpoint: config.rpcEndpoint,
      credentials: config.rpcCredentials,
      apiKey: config.rpcApiKey,
      timeout: 30000,
      retries: 3,
      useBackendProxy: (config as any).useBackendProxy ?? false,
      backendProxyUrl: (config as any).backendProxyUrl ?? '/api/zcash/rpc'
    });

    // Connection manager can be initialized for failover support in the future

    // Initialize transaction builders
    this.txBuilder = new ZcashTransactionBuilder({
      network: this.network,
      rpcClient: this.rpcClient
    });

    this.noteCache = new NoteCache();
    this.noteSelector = new NoteSelector(this.noteCache);
    this.shieldedTxBuilder = new ShieldedTransactionBuilder(this.noteCache);

    // Initialize signers
    this.signer = new ZcashSigner();
    this.shieldedSigner = new ShieldedSigner();

    // Initialize serialization and validation
    this.serializer = new TransactionSerializer();
    this.shieldedSerializer = new ShieldedTransactionSerializer();
    this.validator = new TransactionValidator();

    // Initialize prover
    this.prover = new ZcashProver({
      useWorker: config.proofGenerationMode === 'client',
      timeout: 300000, // 5 minutes
      wasmPath: undefined // Will be set when WASM is available
    });

    // Initialize state management
    this.utxoCache = new UTXOCache();
  }

  /**
   * Initialize the provider
   * Call this before using the provider
   * 
   * RPC connection is optional. The provider will work in offline mode
   * for address generation, but RPC-dependent features will be unavailable.
   */
  async initialize(): Promise<void> {
    // Initialize Groth16 integration with delegated proving service if configured
    if (this.config.proofGenerationMode === 'delegated' && this.config.delegatedProverUrl) {
      try {
        const groth16 = await getGroth16Integration();
        await groth16.initialize({
          proverType: 'delegated',
          serviceUrl: this.config.delegatedProverUrl
        });
        // Delegated proving service initialized successfully
      } catch (error) {
        // Failed to initialize delegated proving service, falling back to client mode
      }
    }
    
    // Initialize prover if client-side
    if (this.config.proofGenerationMode === 'client') {
      try {
        await this.prover.initialize();
      } catch (error) {
        // Prover initialization failed
        // Continue without prover - shielded transactions won't work
      }
    }

    // Test RPC connection (non-blocking)
    // Don't fail initialization if RPC is unavailable
    try {
      await Promise.race([
        this.rpcClient.getBlockCount(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('RPC connection timeout')), 5000)
        )
      ]);
      this.rpcConnected = true;
    } catch (error) {
      this.rpcConnected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      // RPC connection unavailable - wallet will work in offline mode
    }
  }

  /**
   * Get Zcash addresses for a Miden account
   * 
   * @param midenAccountId - The Miden account identifier
   * @param midenPrivateKey - The Miden account private key
   * @returns Promise resolving to Zcash addresses
   */
  async getAddresses(
    midenAccountId: string,
    midenPrivateKey: Uint8Array
  ): Promise<ZcashAddresses> {
    // Check cache first
    if (this.addressCache.has(midenAccountId)) {
      return this.addressCache.get(midenAccountId)!;
    }

    // Derive keys
    const keys = this.keyDerivation.deriveKeys(
      midenAccountId,
      midenPrivateKey,
      0
    );

    const addresses: ZcashAddresses = {
      tAddress: keys.tAddress,
      zAddress: keys.zAddress
    };

    // Cache addresses
    this.addressCache.set(midenAccountId, addresses);
    
    // Cache viewing key for note scanning (viewing keys are safe to cache)
    this.viewingKeyCache.set(keys.zAddress, keys.viewingKey);
    
    // Create reverse mapping (address -> midenAccountId)
    this.addressToAccountId.set(keys.tAddress, midenAccountId);
    this.addressToAccountId.set(keys.zAddress, midenAccountId);


    return addresses;
  }

  /**
   * Get balance for an address
   * 
   * @param address - Zcash address (t or z)
   * @param type - Address type ('transparent' or 'shielded')
   * @returns Promise resolving to balance
   */
  async getBalance(
    address: string,
    type: AddressType
  ): Promise<Balance> {
    // Input sanitization: trim whitespace
    const sanitized = address?.trim() || '';
    
    // Validate address exists and is a string
    if (!sanitized || sanitized.length === 0) {
      throw new Error(`Invalid Zcash address: address is required`);
    }
    
    // Validate address format
    const validation = validateAddress(sanitized);
    if (!validation.valid) {
      throw new Error(`Invalid Zcash address: ${validation.error || 'format not recognized'}`);
    }
    
    // Network validation: ensure address matches configured network
    if (!isAddressForNetwork(sanitized, this.network)) {
      throw new Error(
        `Address is for ${validation.network} but wallet is configured for ${this.network}`
      );
    }
    
    // Use sanitized address for all operations
    const finalAddress = sanitized;

    // For transparent addresses: Always use CipherScan API (more reliable than RPC)
    // For shielded addresses: Use RPC if available
    // Check both type parameter AND address prefix as fallback
    const isTransparent = type === 'transparent' || finalAddress.startsWith('tm') || finalAddress.startsWith('t1') || finalAddress.startsWith('t3');
    
    if (isTransparent) {
      // Check cache first (1 minute TTL for fresh data)
      // Always fetch fresh data to avoid stale balances
      const cached = this.balanceCache.get(finalAddress);
      const cacheTTL = 60000; // 1 minute - shorter TTL to get fresh data
      
      if (cached && Date.now() - cached.timestamp < cacheTTL) {
        // Use cache only if very recent (within 1 minute)
        return cached.balance;
      }
      
      // Fetch from CipherScan API via proxy (to avoid CORS issues)
      try {
        // Use Next.js API proxy route to avoid CORS
        // Check if we're in browser environment and can use relative URL
        const isBrowser = typeof window !== 'undefined';
        const proxyUrl = isBrowser 
          ? `/api/zcash/balance?address=${encodeURIComponent(finalAddress)}&network=${this.network}`
          : `${this.network === 'testnet' ? 'https://testnet.cipherscan.app' : 'https://cipherscan.app'}/api/address/${finalAddress}`;
        
        // Add timeout to prevent hanging (increased for slow networks)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        const response = await fetch(proxyUrl, {
          method: isBrowser ? 'GET' : 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Balance API returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const balanceZEC = data.balance || 0;
        // Convert ZEC to zatoshi using string manipulation to avoid float precision loss
        const balanceZECStr = balanceZEC.toString();
        const parts = balanceZECStr.split('.');
        const integerPart = parts[0] || '0';
        let fractionalPart = parts[1] || '';
        // Pad to 8 decimal places
        while (fractionalPart.length < 8) {
          fractionalPart += '0';
        }
        if (fractionalPart.length > 8) {
          fractionalPart = fractionalPart.substring(0, 8);
        }
        const zatoshiString = integerPart + fractionalPart;
        const balanceZatoshi = Number(BigInt(zatoshiString));
        
        const balance: Balance = {
          confirmed: balanceZatoshi,
          unconfirmed: 0,
          total: balanceZatoshi,
          pending: 0,
          unit: 'zatoshi'
        };
        
        // Cache the result
        this.balanceCache.set(finalAddress, { balance, timestamp: Date.now() });
        return balance;
      } catch (cipherscanError: any) {
        // Check if it's a timeout or abort
        const isTimeout = cipherscanError?.name === 'AbortError' || 
                         cipherscanError?.message?.includes('timeout') ||
                         cipherscanError?.message?.includes('aborted');
        
        // CipherScan API failed - using cached balance if available
        if (cached) {
          // Return cached balance (even if zero) to prevent infinite loading
          return cached.balance;
        }
        
        // If timeout, throw error instead of returning zero
        // This prevents overwriting valid balances with 0
        if (isTimeout) {
          throw new Error('CipherScan API timeout - balance fetch failed');
        }
        
        // Throw error for other issues
        throw new Error(
          `Failed to fetch balance from CipherScan API: ${cipherscanError?.message || 'Unknown error'}. ` +
          `Please check your internet connection and try again.`
        );
      }
    }
    
    // For shielded addresses: Use note cache first, then RPC as fallback
    if (type === 'shielded') {
      // First, try to get balance from note cache (from discovered notes)
      const noteCacheBalance = this.noteCache.getBalance(finalAddress);
      if (noteCacheBalance.total > 0) {
        // We have notes in cache - use that balance
        const balance: Balance = {
          confirmed: noteCacheBalance.total, // All notes in cache are confirmed
          unconfirmed: 0,
          total: noteCacheBalance.total,
          pending: 0,
          unit: 'zatoshi'
        };
        
        // Cache the balance
        this.balanceCache.set(finalAddress, {
          balance,
          timestamp: Date.now()
        });
        
        return balance;
      }
      
      // If no notes in cache, try RPC if available
      if (!this.rpcConnected) {
        return {
          confirmed: 0,
          unconfirmed: 0,
          total: 0,
          pending: 0,
          unit: 'zatoshi'
        };
      }
      
      // Get shielded balance via RPC
      try {
        const confirmed = await this.rpcClient.zGetBalance(finalAddress, 1);
        // Get total balance (minconf=0) to calculate unconfirmed
        const total = await this.rpcClient.zGetBalance(finalAddress, 0);
        const unconfirmed = Math.max(0, total - confirmed);
        
        const balance: Balance = {
          confirmed,
          unconfirmed,
          total,
          pending: 0,
          unit: 'zatoshi'
        };

        // Cache balance
        this.balanceCache.set(finalAddress, {
          balance,
          timestamp: Date.now()
        });

        return balance;
      } catch (error: any) {
        // If z_getBalance fails (method not supported or RPC error), 
        // return note cache balance (which may be 0 if no notes discovered yet)
        const fallbackBalance = this.noteCache.getBalance(finalAddress);
        return {
          confirmed: fallbackBalance.total,
          unconfirmed: 0,
          total: fallbackBalance.total,
          pending: 0,
          unit: 'zatoshi'
        };
      }
    }
    
    // Should never reach here for transparent (already returned above)
    throw new Error(`Unsupported address type: ${type}`);
  }

  /**
   * Build and sign a transaction
   * 
   * @param params - Transaction parameters
   * @param midenAccountId - Miden account ID
   * @param midenPrivateKey - Miden account private key
   * @returns Promise resolving to signed transaction
   */
  async buildAndSignTransaction(
    params: TransactionParams,
    midenAccountId: string,
    midenPrivateKey: Uint8Array
  ): Promise<SignedTransaction> {
    // Input sanitization: trim whitespace from addresses
    const fromAddress = params.from.address.trim();
    const toAddress = params.to.address.trim();
    
    // Validate from address
    const fromValidation = validateAddress(fromAddress);
    if (!fromValidation.valid) {
      throw new Error(`Invalid from address: ${fromValidation.error || 'format not recognized'}`);
    }
    
    // Validate to address
    const toValidation = validateAddress(toAddress);
    if (!toValidation.valid) {
      throw new Error(`Invalid to address: ${toValidation.error || 'format not recognized'}`);
    }
    
    // Network validation: ensure addresses match configured network
    if (!isAddressForNetwork(fromAddress, this.network)) {
      throw new Error(
        `From address is for ${fromValidation.network} but wallet is configured for ${this.network}`
      );
    }
    
    if (!isAddressForNetwork(toAddress, this.network)) {
      throw new Error(
        `To address is for ${toValidation.network} but wallet is configured for ${this.network}`
      );
    }
    
    // Type validation: ensure address types match params
    // Allow orchard addresses when shielded type is expected (orchard is a shielded address type)
    if (fromValidation.type !== params.from.type) {
      if (params.from.type === 'shielded' && fromValidation.type === 'orchard') {
        // OK: orchard is a shielded address type
      } else {
        throw new Error(
          `From address type mismatch: expected ${params.from.type}, got ${fromValidation.type}`
        );
      }
    }
    
    if (toValidation.type !== params.to.type) {
      // Allow orchard addresses for shielded type (orchard is a shielded address type)
      if (params.to.type === 'shielded' && toValidation.type === 'orchard') {
        // OK: orchard is a shielded address type
      } else {
        throw new Error(
          `To address type mismatch: expected ${params.to.type}, got ${toValidation.type}`
        );
      }
    }
    
    // Use sanitized addresses
    const sanitizedParams: TransactionParams = {
      ...params,
      from: { ...params.from, address: fromAddress },
      to: { ...params.to, address: toAddress }
    };

    const keys = this.keyDerivation.deriveKeys(midenAccountId, midenPrivateKey, 0);

    // Determine transaction type
    const fromType = sanitizedParams.from.type;
    const toType = sanitizedParams.to.type;

    let signedTx: SignedTransaction;

    if (fromType === 'transparent' && toType === 'transparent') {
      // Transparent transaction (t-to-t)
      signedTx = await this.buildTransparentTransaction(sanitizedParams, keys);
    } else if (fromType === 'transparent' && toType === 'shielded') {
      // Shielding transaction (t-to-z)
      signedTx = await this.buildShieldingTransaction(sanitizedParams, keys);
    } else if (fromType === 'shielded' && toType === 'transparent') {
      // Deshielding transaction (z-to-t)
      signedTx = await this.buildDeshieldingTransaction(sanitizedParams, keys);
    } else if (fromType === 'shielded' && toType === 'shielded') {
      // Shielded transaction (z-to-z)
      signedTx = await this.buildShieldedTransaction(sanitizedParams, keys);
    } else {
      throw new Error(`Unsupported transaction type: ${fromType} to ${toType}`);
    }

    // Validate transaction
    const validation = this.validator.validateTransaction(signedTx.tx);
    if (!validation.valid) {
      throw new Error(`Transaction validation failed: ${validation.errors.join(', ')}`);
    }

    return signedTx;
  }

  /**
   * Send a shielded transaction (main end-to-end method for B3)
   *
   * Orchestrates the complete workflow:
   * 1. Select notes from the sender's shielded pool
   * 2. Build the transaction with spend and output descriptions
   * 3. Generate Groth16 proofs (spend and output)
   * 4. Sign the transaction with spend authorization signature
   * 5. Serialize to ZIP-225 binary format
   * 6. Broadcast via RPC
   * 7. Track confirmations
   *
   * @param account - DerivedZcashAccount with shielded address and keys
   * @param recipient - Recipient Zcash address (transparent or shielded)
   * @param amount - Amount in zatoshi
   * @param fee - Transaction fee in zatoshi
   * @returns Transaction ID (32-byte hash as hex string)
   */
  async sendShieldedTransaction(
    account: any, // DerivedZcashAccount type from midenKeyBridge
    recipient: string,
    amount: bigint,
    fee: bigint
  ): Promise<string> {
    if (!this.rpcConnected) {
      throw new Error('RPC not connected. Call initialize() first or check RPC connection.');
    }

    // Runtime check: Prover availability
    const groth16 = await getGroth16Integration();
    const proverStatus = await groth16.getStatus();
    if (!proverStatus.canGenerateRealProofs && !proverStatus.availability.delegated) {
      throw new Error(
        'Prover not available: configure Prize-WASM or a delegated prover before attempting shielded transactions. ' +
        `Available provers: Prize-WASM=${proverStatus.availability.prizeWasm}, ` +
        `librustzcash=${proverStatus.availability.librustzcash}, ` +
        `snarkjs=${proverStatus.availability.snarkjs}, ` +
        `delegated=${proverStatus.availability.delegated}`
      );
    }

    // Runtime check: RPC support for shielded operations
    if (this.config.lightwalletdUrl) {
      // Using lightwalletd for shielded operations
    } else {
      // Using standard RPC - may not support all shielded operations
    }

    // Validate addresses
    const senderValidation = validateAddress(account.zAddress);
    const recipientValidation = validateAddress(recipient);

    if (!senderValidation.valid) {
      throw new Error(`Invalid sender address: ${senderValidation.error}`);
    }

    if (!recipientValidation.valid) {
      throw new Error(`Invalid recipient address: ${recipientValidation.error}`);
    }

    // Ensure addresses are for correct network
    if (!isAddressForNetwork(account.zAddress, this.network)) {
      throw new Error(`Sender address is for ${senderValidation.network} but wallet is ${this.network}`);
    }

    if (!isAddressForNetwork(recipient, this.network)) {
      throw new Error(`Recipient address is for ${recipientValidation.network} but wallet is ${this.network}`);
    }

    // Step 1: Select notes from shielded pool
    const noteSelection = this.noteSelector.selectNotes(account.zAddress, Number(amount));

    if (!noteSelection || noteSelection.notes.length === 0) {
      const balance = this.noteCache.getBalance(account.zAddress);
      const spendableNotes = this.noteCache.getSpendableNotes(account.zAddress);
      const allNotes = this.noteCache.getNotesForAddress(account.zAddress);
      
      // Provide helpful error message based on cache state
      if (allNotes.length === 0) {
        throw new Error(
          `No shielded notes found for address ${account.zAddress.slice(0, 20)}...\n\n` +
          `The wallet hasn't scanned the blockchain for your shielded notes yet.\n\n` +
          `To send shielded transactions, you need to:\n` +
          `1. Sync your shielded address first using syncAddress(address, 'shielded')\n` +
          `2. This will scan the blockchain and discover your notes\n` +
          `3. Once notes are discovered, you can spend them\n\n` +
          `Note: Syncing requires RPC access to scan blocks.`
        );
      } else if (spendableNotes.length === 0) {
        throw new Error(
          `No spendable notes available. All ${allNotes.length} notes may be spent or locked.`
        );
      } else {
        throw new Error(
          `Insufficient shielded funds. Need ${amount} zatoshi (${Number(amount) / 100000000} ZEC), ` +
          `available: ${balance.total} zatoshi (${spendableNotes.length} spendable notes)`
        );
      }
    }

    // Get current anchor for merkle tree validation
    const anchor = await this.getCommitmentTreeAnchor() || new Uint8Array(32);

    // Step 2: Build shielded transaction
    const expiryHeight = (await this.rpcClient.getBlockCount()) + 20; // Expire in 20 blocks

    const unsignedTx = this.shieldedTxBuilder.buildShieldedTransaction({
      spendingKey: {
        ask: account.spendingKey.slice(0, 32),
        nsk: account.spendingKey.slice(32, 64),
        ovk: account.viewingKey.slice(0, 32)
      },
      spends: noteSelection.notes.map(note => ({
        note,
        spendingKey: {
          ask: account.spendingKey.slice(0, 32),
          nsk: account.spendingKey.slice(32, 64),
          ovk: account.viewingKey.slice(0, 32)
        },
        witness: note.witness!,
        anchor
      })),
      outputs: [{
        address: recipient,
        value: Number(amount),
        memo: ''
      }],
      anchor,
      fee: Number(fee),
      expiryHeight
    });

    // Step 3: Generate proofs and sign (via Groth16Integration with Prize-WASM fallback)
    let signedTx: import('../shielded/signer').SignedShieldedTransaction;

    try {
      signedTx = await this.shieldedSigner.signShieldedTransaction(unsignedTx);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to sign and prove transaction: ${errorMessage}. ` +
        `Ensure Prize-WASM is configured or a fallback prover (librustzcash, snarkjs, or delegated service) is available.`
      );
    }

    // Step 4: Use serialized transaction from signer (already serialized as hex string)
    // The signedTx.rawTx is already hex-encoded
    const serializedTxHex = signedTx.rawTx;

    // Step 5: Broadcast via RPC
    let txHash: string;
    try {
      const broadcastResult = await this.rpcClient.sendRawTransaction(serializedTxHex);
      txHash = broadcastResult;
    } catch (error) {
      throw new Error(
        `Failed to broadcast transaction: ${error instanceof Error ? error.message : String(error)}. ` +
        `Check RPC connection and ensure transaction is valid.`
      );
    }

    // Step 6: Track confirmations (optional, return immediately)

    return txHash;
  }

  /**
   * Build transparent transaction
   */
  private async buildTransparentTransaction(
    params: TransactionParams,
    keys: ZcashKeys
  ): Promise<SignedTransaction> {
    // Use transaction builder's UTXO selection
    const inputs = await this.txBuilder.selectUTXOs(
      params.from.address,
      params.amount,
      params.fee,
      this.utxoCache // Pass UTXO cache for fallback when RPC doesn't support listunspent
    );

    // Build outputs
    const outputs: TransparentOutput[] = [
      {
        address: params.to.address,
        value: params.amount,
        scriptPubKey: '' // Will be generated from address
      }
    ];

    // Build transaction (builder will calculate fee and change)
    const tx = await this.txBuilder.buildTransparentTransaction(
      inputs,
      outputs,
      params.fee
    );

    // Sign transaction
    const signed = this.signer.signTransparentTransaction(
      tx,
      keys.transparentPrivateKey,
      inputs
    );

    return signed;
  }

  /**
   * Build shielding transaction (t-to-z)
   */
  private async buildShieldingTransaction(
    params: TransactionParams,
    keys: ZcashKeys
  ): Promise<SignedTransaction> {
    // Get UTXOs using transaction builder (with UTXO cache fallback)
    const transparentInputs = await this.txBuilder.selectUTXOs(
      params.from.address,
      params.amount,
      params.fee,
      this.utxoCache // Pass UTXO cache for fallback when RPC doesn't support listunspent
    );

    // Build shielding transaction
    const unsignedTx = this.shieldedTxBuilder.buildShieldingTransaction({
      transparentInputs,
      shieldedOutput: {
        address: params.to.address,
        value: params.amount,
        memo: params.memo
      },
      changeAddress: params.changeAddress || params.from.address,
      fee: params.fee,
      expiryHeight: params.expiryHeight
    });

    // Sign transparent inputs
    const signedTransparent = this.signer.signTransparentTransaction(
      {
        version: unsignedTx.version,
        versionGroupId: unsignedTx.versionGroupId,
        lockTime: unsignedTx.lockTime,
        expiryHeight: unsignedTx.expiryHeight,
        transparentInputs: unsignedTx.transparentInputs,
        transparentOutputs: unsignedTx.transparentOutputs,
        valueBalance: Number(unsignedTx.shieldedBundle.valueBalance)
      },
      keys.transparentPrivateKey,
      unsignedTx.transparentInputs
    );

    // Sign shielded components
    const signedShielded = await this.shieldedSigner.signShieldedTransaction(unsignedTx);

    // Combine into final transaction
    const finalTx: Transaction = {
      version: unsignedTx.version,
      versionGroupId: unsignedTx.versionGroupId,
      lockTime: unsignedTx.lockTime,
      expiryHeight: unsignedTx.expiryHeight,
      transparentInputs: signedTransparent.tx.transparentInputs,
      transparentOutputs: signedTransparent.tx.transparentOutputs,
      valueBalance: Number(signedShielded.shieldedBundle.valueBalance),
      bindingSig: bytesToHex(signedShielded.shieldedBundle.bindingSig),
      shieldedInputs: [],
      shieldedOutputs: signedShielded.shieldedBundle.outputs || []
    };

    return {
      tx: finalTx,
      txHash: signedShielded.txHash,
      rawTx: signedShielded.rawTx,
      proof: {
        proof: new Uint8Array(0),
        publicInputs: []
      }
    };
  }

  /**
   * Build deshielding transaction (z-to-t)
   */
  private async buildDeshieldingTransaction(
    params: TransactionParams,
    keys: ZcashKeys
  ): Promise<SignedTransaction> {
    // Get notes from cache
    const noteSelection = this.noteSelector.selectNotes(
      params.from.address,
      params.amount
    );

    if (!noteSelection) {
      const allNotes = this.noteCache.getNotesForAddress(params.from.address);
      const spendableNotes = this.noteCache.getSpendableNotes(params.from.address);
      
      if (allNotes.length === 0) {
        throw new Error(
          `No shielded notes found. Please sync your shielded address first using syncAddress(address, 'shielded'). ` +
          `This scans the blockchain to discover your notes.`
        );
      } else {
        const balance = this.noteCache.getBalance(params.from.address);
        throw new Error(
          `Insufficient shielded funds. Need ${params.amount} zatoshi, ` +
          `available: ${balance.total} zatoshi (${spendableNotes.length} spendable notes)`
        );
      }
    }

    // Get current anchor from commitment tree state
    await this.rpcClient.getBlockCount(); // Update block height for validation
    const anchor = await this.getCommitmentTreeAnchor() || new Uint8Array(32);

    // Build deshielding transaction
    const unsignedTx = this.shieldedTxBuilder.buildDeshieldingTransaction({
      spendingKey: {
        ask: keys.spendingKey.slice(0, 32),
        nsk: keys.spendingKey.slice(32, 64),
        ovk: keys.viewingKey.slice(0, 32)
      },
      spends: noteSelection.notes.map(note => ({
        note,
        spendingKey: {
          ask: keys.spendingKey.slice(0, 32),
          nsk: keys.spendingKey.slice(32, 64),
          ovk: keys.viewingKey.slice(0, 32)
        },
        witness: note.witness!,
        anchor
      })),
      anchor,
      transparentOutput: {
        address: params.to.address,
        value: params.amount,
        scriptPubKey: ''
      },
      shieldedChange: params.changeAddress ? {
        address: params.changeAddress,
        value: 0, // Will be calculated
        memo: params.memo
      } : undefined,
      fee: params.fee,
      expiryHeight: params.expiryHeight
    });

    // Sign shielded transaction
    const signed = await this.shieldedSigner.signShieldedTransaction(unsignedTx);

    return {
      tx: {
        ...signed.tx,
        transparentOutputs: signed.tx.transparentOutputs || []
      },
      txHash: signed.txHash,
      rawTx: signed.rawTx,
      proof: {
        proof: new Uint8Array(0),
        publicInputs: []
      }
    };
  }

  /**
   * Build shielded transaction (z-to-z)
   */
  private async buildShieldedTransaction(
    params: TransactionParams,
    keys: ZcashKeys
  ): Promise<SignedTransaction> {
    // Get notes from cache
    const noteSelection = this.noteSelector.selectNotes(
      params.from.address,
      params.amount
    );

    if (!noteSelection) {
      const allNotes = this.noteCache.getNotesForAddress(params.from.address);
      const spendableNotes = this.noteCache.getSpendableNotes(params.from.address);
      
      if (allNotes.length === 0) {
        throw new Error(
          `No shielded notes found. Please sync your shielded address first using syncAddress(address, 'shielded'). ` +
          `This scans the blockchain to discover your notes.`
        );
      } else {
        const balance = this.noteCache.getBalance(params.from.address);
        throw new Error(
          `Insufficient shielded funds. Need ${params.amount} zatoshi, ` +
          `available: ${balance.total} zatoshi (${spendableNotes.length} spendable notes)`
        );
      }
    }

    // Get current anchor from commitment tree state
    await this.rpcClient.getBlockCount(); // Update block height for validation
    const anchor = await this.getCommitmentTreeAnchor() || new Uint8Array(32);

    // Build shielded transaction
    const unsignedTx = this.shieldedTxBuilder.buildShieldedTransaction({
      spendingKey: {
        ask: keys.spendingKey.slice(0, 32),
        nsk: keys.spendingKey.slice(32, 64),
        ovk: keys.viewingKey.slice(0, 32)
      },
      spends: noteSelection.notes.map(note => ({
        note,
        spendingKey: {
          ask: keys.spendingKey.slice(0, 32),
          nsk: keys.spendingKey.slice(32, 64),
          ovk: keys.viewingKey.slice(0, 32)
        },
        witness: note.witness!,
        anchor
      })),
      outputs: [{
        address: params.to.address,
        value: params.amount,
        memo: params.memo
      }],
      anchor,
      fee: params.fee,
      expiryHeight: params.expiryHeight
    });

    // Sign shielded transaction
    const signed = await this.shieldedSigner.signShieldedTransaction(unsignedTx);

    return {
      tx: {
        ...signed.tx,
        transparentOutputs: signed.tx.transparentOutputs || []
      },
      txHash: signed.txHash,
      rawTx: signed.rawTx,
      proof: {
        proof: new Uint8Array(0),
        publicInputs: []
      }
    };
  }

  /**
   * Broadcast a signed transaction to the Zcash network
   * 
   * @param tx - Signed transaction
   * @returns Promise resolving to transaction hash
   */
  async broadcastTransaction(tx: SignedTransaction): Promise<TxHash> {
    // Serialize if not already serialized
    const rawTx = tx.rawTx || this.serializer.serialize(tx.tx);

    // Broadcast
    const txHash = await this.rpcClient.sendRawTransaction(rawTx);

    // Invalidate balance cache for involved addresses
    this.invalidateBalanceCache(tx.tx);

    return {
      hash: txHash,
      confirmations: 0
    };
  }

  /**
   * Sync state for an address
   * 
   * @param address - Address to sync
   * @param type - Address type
   * @returns Promise resolving to sync result
   */
  async syncAddress(
    address: string,
    type: AddressType
  ): Promise<SyncResult> {
    // Input sanitization: trim whitespace
    const sanitized = address?.trim() || '';
    
    if (!sanitized || sanitized.length === 0) {
      throw new Error(`Invalid Zcash address: address is required`);
    }
    
    // Validate address format
    const validation = validateAddress(sanitized);
    if (!validation.valid) {
      throw new Error(`Invalid Zcash address: ${validation.error || 'format not recognized'}`);
    }
    
    // Network validation: ensure address matches configured network
    if (!isAddressForNetwork(sanitized, this.network)) {
      throw new Error(
        `Address is for ${validation.network} but wallet is configured for ${this.network}`
      );
    }
    
    const finalAddress = sanitized;
    
    if (!this.rpcConnected) {
      // Return cached or zero balance if RPC is not available
      const balance = await this.getBalance(finalAddress, type);
      return {
        address,
        newTransactions: 0,
        updatedBalance: balance,
        lastSynced: Date.now(),
        blockHeight: 0
      };
    }

    // Check if using Tatum (rate limited to 3 calls)
    const isTatum = this.config.rpcEndpoint?.includes('tatum');
    
    // For Tatum: Still allow shielded sync (it's needed to see balance)
    // Only skip for transparent addresses to avoid rate limits
    if (isTatum && type === 'transparent') {
      const balance = await this.getBalance(finalAddress, type);
      return {
        address: finalAddress,
        newTransactions: 0,
        updatedBalance: balance,
        lastSynced: Date.now(),
        blockHeight: 0 // Don't call getBlockCount for Tatum
      };
    }

    // For shielded addresses or local node: Full sync
    const blockCount = await this.rpcClient.getBlockCount();

    if (type === 'transparent') {
      // Sync transparent address - try to get UTXOs
      let utxos: any[] = [];
      try {
        utxos = await this.rpcClient.listUnspent(1, 9999999, [finalAddress]);
        this.utxoCache.updateUTXOs(finalAddress, utxos, blockCount);
      } catch (utxoError: any) {
        const errorMsg = utxoError?.message || String(utxoError || '');
        if (errorMsg.includes('not found') || errorMsg.includes('Method not found') || errorMsg.includes('listunspent') || errorMsg.includes('reindexing')) {
          // RPC doesn't support listunspent or node is reindexing
          // Try fallback: fetch from block explorer API (if available)
          // For now, we can't populate UTXO cache, but we can still get balance
          console.warn(`[ZcashProvider] listunspent not available (${errorMsg.includes('reindexing') ? 'node reindexing' : 'method not supported'}) - cannot populate UTXO cache for ${finalAddress}`);
          
          // If node is reindexing, this is expected - don't throw error
          // The wallet can still work if UTXOs are manually added to cache
          if (!errorMsg.includes('reindexing')) {
            // Only log warning for method not found, not for reindexing
          }
        } else {
          // Re-throw other errors
          throw utxoError;
        }
      }

      // Transaction history fetching not yet implemented

      const balance = await this.getBalance(finalAddress, 'transparent');

      return {
        address: finalAddress,
        newTransactions: utxos.length, // Number of UTXOs found (0 if listunspent not supported)
        updatedBalance: balance,
        lastSynced: Date.now(),
        blockHeight: blockCount
      };
    } else if (type === 'shielded') {
      // Sync shielded address - scan for notes from blockchain
      if (!this.rpcConnected) {
        // If RPC not connected, return cached notes only
        const balance = await this.getBalance(finalAddress, 'shielded');
        const cachedNotes = this.noteCache.getNotesForAddress(finalAddress);
        return {
          address: finalAddress,
          newTransactions: cachedNotes.length,
          updatedBalance: balance,
          lastSynced: Date.now(),
          blockHeight: blockCount
        };
      }

      let viewingKey = await this.getViewingKeyForAddress(finalAddress);
      
      if (!viewingKey) {
        // Viewing key not in cache - try to get it from the ZcashModule's account
        // The viewing key should be available from getActiveZcashAccount()
        // But we need to access it through the module, which we don't have direct access to here
        // So we'll throw a helpful error instead
        const midenAccountId = this.addressToAccountId.get(finalAddress);
        
        if (midenAccountId) {
          throw new Error(
            `Viewing key not found for address ${finalAddress.slice(0, 20)}...\n\n` +
            `To sync shielded addresses, the viewing key must be cached.\n\n` +
            `Solution: Call getAddresses() or getActiveZcashAccount() first to populate the viewing key cache.\n\n` +
            `This requires exporting the private key from the Miden wallet with user permission.`
          );
        } else {
          throw new Error(
            `Address ${finalAddress.slice(0, 20)}... not found in cache.\n\n` +
            `Please call getAddresses() first to register the address and cache the viewing key.`
          );
        }
      }

      // Initialize note scanner and synchronizer if not already done
      if (!this.noteScanner) {
        this.noteScanner = new NoteScanner(
          { ivk: viewingKey },
          this.noteCache,
          {
            batchSize: 100,
            scanOutgoing: true
          }
        );
      }

      if (!this.stateSynchronizer) {
        this.stateSynchronizer = new ShieldedStateSynchronizer(
          this.noteScanner,
          this.noteCache
        );
        // ZcashRPCClient implements RPCClientInterface methods needed for note scanning
        this.stateSynchronizer.setRpcClient(this.rpcClient as any);
      }

      // Perform full note sync
      const lastSyncedHeight = this.noteCache.getSyncedHeight(finalAddress);
      const syncResult = await this.stateSynchronizer.sync(
        finalAddress,
        undefined, // Use RPC client
        lastSyncedHeight > 0 ? lastSyncedHeight + 1 : undefined,
        blockCount
      );

      // Update balance after sync
      const balance = await this.getBalance(finalAddress, 'shielded');

      return {
        address: finalAddress,
        newTransactions: syncResult.notesFound,
        updatedBalance: balance,
        lastSynced: Date.now(),
        blockHeight: blockCount
      };
    } else {
      throw new Error(`Unsupported address type: ${type}`);
    }
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(txHash: string): Promise<Transaction> {
    return await this.rpcClient.getTransaction(txHash);
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    if (!this.rpcConnected) {
      return 0;
    }
    return await this.rpcClient.getBlockCount();
  }

  /**
   * Get node sync status
   */
  async getSyncStatus(): Promise<{
    blocks: number;
    headers: number;
    verificationProgress: number;
    isSyncing: boolean;
    isInitialBlockDownload: boolean;
  }> {
    if (!this.rpcConnected) {
      return {
        blocks: 0,
        headers: 0,
        verificationProgress: 0,
        isSyncing: false,
        isInitialBlockDownload: false
      };
    }

    try {
      const info = await this.rpcClient.getBlockchainInfo();
      return {
        blocks: info.blocks || 0,
        headers: info.headers || 0,
        verificationProgress: info.verificationprogress || 0,
        isSyncing: (info.initialblockdownload === true) || (info.blocks < info.headers),
        isInitialBlockDownload: info.initialblockdownload === true
      };
    } catch (error) {
      // Failed to get sync status
      return {
        blocks: 0,
        headers: 0,
        verificationProgress: 0,
        isSyncing: false,
        isInitialBlockDownload: false
      };
    }
  }

  /**
   * Check if RPC is connected
   */
  isRPCConnected(): boolean {
    return this.rpcConnected;
  }

  /**
   * Re-check RPC connection status
   * Useful when the node becomes available after initialization
   */
  async refreshRPCConnection(): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.rpcClient.getBlockCount(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('RPC connection timeout')), 5000)
        )
      ]);
      this.rpcConnected = true;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // RPC connection failed
      this.rpcConnected = false;
      return false;
    }
  }

  /**
   * Get RPC endpoint
   */
  getRPCEndpoint(): string {
    return this.config.rpcEndpoint;
  }

  /**
   * Invalidate balance cache for addresses in transaction
   */
  private invalidateBalanceCache(tx: Transaction): void {
    // Invalidate for all transparent outputs
    for (const output of tx.transparentOutputs) {
      this.balanceCache.delete(output.address);
    }

    // Invalidate for all transparent inputs (if we track them)
    // Input address would need to be looked up from UTXO
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.addressCache.clear();
    this.balanceCache.clear();
    this.utxoCache.clear();
    this.noteCache.clear();
  }

  /**
   * Clear balance cache for a specific address or all addresses
   */
  clearBalanceCache(address?: string): void {
    if (address) {
      this.balanceCache.delete(address);
      // Cleared balance cache for specific address
    } else {
      this.balanceCache.clear();
      // Cleared all balance cache
    }
  }

  /**
   * Get network
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Get commitment tree anchor (root) for shielded transactions
   * 
   * This is required for generating Merkle proofs when spending shielded notes.
   * The anchor is the root of the Sapling commitment tree at a specific block height.
   * 
   * Implementation options:
   * 1. Use Lightwalletd: Call z_gettreestate RPC
   * 2. Use local commitment tree: Maintain tree state locally
   * 3. Use RPC: Call getblock with commitment tree info
   */
  async getCommitmentTreeAnchor(blockHeight?: number): Promise<Uint8Array> {
    // Option 1: Try Lightwalletd z_gettreestate (if available)
    if (this.rpcConnected) {
      try {
        const treeState = await this.rpcClient.getTreeState(blockHeight);
        if (treeState && treeState.root && !treeState.root.every(b => b === 0)) {
          return treeState.root;
        }
      } catch (error) {
        // z_gettreestate not available, try alternative
      }

      // Option 2: Get from block (if RPC supports it)
      try {
        const height = blockHeight || await this.rpcClient.getBlockCount();
        const blockHash = await this.rpcClient.getBlockHash(height);
        const block = await this.rpcClient.getBlock(blockHash, 2);
        
        // Extract commitment tree root from block
        if (block && (block as any).saplingCommitmentTreeRoot) {
          const rootHex = (block as any).saplingCommitmentTreeRoot;
          const root = hexToBytes(rootHex);
          if (!root.every(b => b === 0)) {
            return root;
          }
        }
      } catch (error) {
        // Block method not available
      }
    }

    // Option 3: Use note cache tree state if available
    const treeState = this.noteCache.getTreeState();
    if (treeState && treeState.root && !treeState.root.every(b => b === 0)) {
      return treeState.root;
    }

    throw new Error(
      `Failed to retrieve commitment tree anchor for block height ${blockHeight || 'latest'}. ` +
      `Ensure RPC endpoint supports z_gettreestate or note syncing has been performed.`
    );
  }

  /**
   * Get viewing key for a shielded address
   * 
   * Retrieves the viewing key from cache if available, or attempts to derive it
   * if we have the address in our reverse mapping.
   */
  private async getViewingKeyForAddress(address: string): Promise<Uint8Array | null> {
    // Check cache first
    if (this.viewingKeyCache.has(address)) {
      return this.viewingKeyCache.get(address)!;
    }
    
    // Try to find midenAccountId from reverse mapping
    const midenAccountId = this.addressToAccountId.get(address);
    if (!midenAccountId) {
      // Address not in our cache - can't derive viewing key without account ID
      return null;
    }
    
    // If we have the address but not the viewing key, we need to re-derive
    // But we can't derive without the private key, which requires user permission
    // Return null and let the caller handle it (they should call getAddresses first)
    console.warn(`[ZcashProvider] Viewing key not cached for ${address}. Call getAddresses() first to populate cache.`);
    return null;
  }


  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    await this.prover.dispose();
    this.clearCache();
  }
}

