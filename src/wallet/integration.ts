/**
 * Miden Wallet Integration
 * 
 * Main integration point for connecting Zcash SDK to Miden Wallet
 * Provides a unified interface that bridges Miden accounts and Zcash functionality
 */

import { ZcashProvider } from '../provider/ZcashProvider';
import type { ZcashProviderConfig, TransactionParams, SignedTransaction } from '../types/index';
import type { MidenWalletAPI, DerivedZcashAccount } from './midenKeyBridge';
import { MidenKeyBridge } from './midenKeyBridge';

/**
 * Zcash Module Configuration
 */
export interface ZcashModuleConfig {
  /** Miden wallet API instance */
  midenWallet: MidenWalletAPI;
  
  /** Zcash RPC endpoint */
  rpcEndpoint?: string;
  
  /** RPC credentials (if needed) */
  rpcCredentials?: {
    username: string;
    password: string;
  };
  
  /** RPC API key (for services that use header-based auth) */
  rpcApiKey?: string;
  
  /** Proof generation mode */
  proofGenerationMode?: 'client' | 'delegated' | 'hybrid';
  
  /** Delegated proving service URL (required if proofGenerationMode is 'delegated') */
  delegatedProverUrl?: string;
  
  /** Sync interval in milliseconds */
  syncInterval?: number;
}

/**
 * Zcash Module for Miden Wallet
 * 
 * This is the main class that wallet developers should use to integrate
 * Zcash functionality into the Miden wallet.
 */
export class ZcashModule {
  private provider: ZcashProvider;
  private keyBridge: MidenKeyBridge;
  private config: ZcashModuleConfig;
  private initialized: boolean = false;

  constructor(config: ZcashModuleConfig) {
    this.config = config;
    
    // Determine network from Miden wallet
    const network = config.midenWallet.getNetwork() === 'testnet' ? 'testnet' : 'mainnet';
    
    // Create provider configuration
    const providerConfig: ZcashProviderConfig = {
      network,
      rpcEndpoint: config.rpcEndpoint || this.getDefaultRpcEndpoint(network),
      rpcCredentials: config.rpcCredentials,
      rpcApiKey: config.rpcApiKey,
      proofGenerationMode: config.proofGenerationMode || 'client',
      delegatedProverUrl: config.delegatedProverUrl || this.getDefaultProvingServiceUrl(),
      syncInterval: config.syncInterval || 60000,
      cacheSize: 1000
    };
    
    // Initialize provider
    this.provider = new ZcashProvider(providerConfig);
    
    // Initialize key bridge
    this.keyBridge = new MidenKeyBridge(config.midenWallet);
  }

  /**
   * Initialize the Zcash module
   * Call this after creating the module instance
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize provider
    await this.provider.initialize();
    
    this.initialized = true;
  }

  /**
   * Get Zcash account for the active Miden account
   */
  async getActiveZcashAccount(): Promise<DerivedZcashAccount> {
    try {
      console.log('[ZcashModule] getActiveZcashAccount() called');
      const activeAccount = await this.config.midenWallet.getActiveAccount();
      console.log('[ZcashModule] Active Miden account:', activeAccount?.id?.substring(0, 20) + '...');
      
      if (!activeAccount || !activeAccount.id || activeAccount.id.trim() === '') {
        throw new Error('No active Miden account found. Please create or import a wallet first.');
      }
      
      console.log('[ZcashModule] Deriving Zcash account for:', activeAccount.id.substring(0, 20) + '...');
      const zcashAccount = await this.keyBridge.deriveZcashAccount(activeAccount.id);
      console.log('[ZcashModule] Zcash account derived:', {
        tAddress: zcashAccount.tAddress?.substring(0, 20) + '...',
        zAddress: zcashAccount.zAddress?.substring(0, 20) + '...',
        hasAddresses: !!(zcashAccount.tAddress && zcashAccount.zAddress)
      });
      
      // Validate the returned account has valid addresses
      if (!zcashAccount || 
          !zcashAccount.tAddress || 
          typeof zcashAccount.tAddress !== 'string' ||
          zcashAccount.tAddress.length === 0 ||
          !zcashAccount.zAddress || 
          typeof zcashAccount.zAddress !== 'string' ||
          zcashAccount.zAddress.length === 0) {
        console.error('[ZcashModule] Invalid addresses in derived account:', {
          hasAccount: !!zcashAccount,
          tAddress: zcashAccount?.tAddress,
          zAddress: zcashAccount?.zAddress
        });
        throw new Error('Failed to derive valid Zcash addresses. Private key export may not be implemented.');
      }
      
      return zcashAccount;
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ZcashModule] getActiveZcashAccount() failed:', errorMsg);
      console.error('[ZcashModule] Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      // Re-throw with more context if it's a private key export error
      if (error.message && (
        error.message.includes('Private key export') ||
        error.message.includes('denied access') ||
        error.message.includes('not implemented')
      )) {
        throw new Error(
          'Private key export is required for Zcash integration. ' +
          'The Miden wallet must implement a method to export private keys with user confirmation.'
        );
      }
      throw error;
    }
  }

  /**
   * Get Zcash addresses for a Miden account
   */
  async getAddresses(midenAccountId: string): Promise<{ tAddress: string; zAddress: string }> {
    if (!midenAccountId || midenAccountId.trim() === '') {
      throw new Error('Miden account ID is required');
    }
    
    try {
      console.log('[ZcashModule] Getting addresses for account:', midenAccountId);
      const account = await this.keyBridge.deriveZcashAccount(midenAccountId);
      console.log('[ZcashModule] Account derived:', {
        tAddress: account.tAddress?.substring(0, 20) + '...',
        zAddress: account.zAddress?.substring(0, 20) + '...',
        hasAddresses: !!(account.tAddress && account.zAddress)
      });
      
      // Validate addresses are strings and not empty
      if (!account || 
          !account.tAddress || 
          typeof account.tAddress !== 'string' ||
          account.tAddress.length === 0 ||
          !account.zAddress || 
          typeof account.zAddress !== 'string' ||
          account.zAddress.length === 0) {
        console.error('[ZcashModule] Invalid addresses derived:', {
          hasAccount: !!account,
          tAddress: account?.tAddress,
          zAddress: account?.zAddress,
          tAddressType: typeof account?.tAddress,
          zAddressType: typeof account?.zAddress
        });
        throw new Error('Failed to derive valid Zcash addresses. Private key export may not be implemented.');
      }
      
      try {
        const midenPrivateKey = await this.config.midenWallet.exportPrivateKey(midenAccountId);
        if (midenPrivateKey && midenPrivateKey.length > 0) {
          await this.provider.getAddresses(midenAccountId, midenPrivateKey);
          midenPrivateKey.fill(0);
        }
      } catch (cacheError: any) {
        const errorMsg = cacheError instanceof Error ? cacheError.message : String(cacheError);
        if (errorMsg.includes('denied access') || errorMsg.includes('User denied')) {
          console.warn('Viewing key cache not populated: User denied private key access');
        } else {
          console.warn('Failed to populate viewing key cache:', errorMsg);
        }
      }
      
      return {
        tAddress: account.tAddress,
        zAddress: account.zAddress
      };
    } catch (error: any) {
      // Re-throw with more context if it's a private key export error
      if (error.message && (
        error.message.includes('Private key export') ||
        error.message.includes('denied access') ||
        error.message.includes('not implemented')
      )) {
        throw new Error(
          'Private key export is required for Zcash integration. ' +
          'The Miden wallet must implement a method to export private keys with user confirmation.'
        );
      }
      throw error;
    }
  }

  /**
   * Get balance for an address
   */
  async getBalance(address: string, type: 'transparent' | 'shielded'): Promise<{
    confirmed: number;
    unconfirmed: number;
    total: number;
    pending: number;
    unit: 'zatoshi' | 'ZEC';
  }> {
    return await this.provider.getBalance(address, type);
  }

  /**
   * Clear balance cache (useful for forcing fresh fetch)
   */
  clearBalanceCache(address?: string): void {
    this.provider.clearBalanceCache(address);
  }

  /**
   * Build and sign a transaction
   */
  async buildAndSignTransaction(
    midenAccountId: string,
    params: TransactionParams
  ): Promise<SignedTransaction> {
    // Get Miden private key
    const midenPrivateKey = await this.config.midenWallet.exportPrivateKey(midenAccountId);
    
    // Build and sign using provider
    return await this.provider.buildAndSignTransaction(
      params,
      midenAccountId,
      midenPrivateKey
    );
  }

  /**
   * Broadcast a signed transaction
   */
  async broadcastTransaction(tx: SignedTransaction): Promise<{ hash: string; confirmations: number }> {
    return await this.provider.broadcastTransaction(tx);
  }

  /**
   * Sync address state
   */
  async syncAddress(address: string, type: 'transparent' | 'shielded'): Promise<{
    address: string;
    newTransactions: number;
    updatedBalance: {
      confirmed: number;
      unconfirmed: number;
      total: number;
      pending: number;
      unit: 'zatoshi' | 'ZEC';
    };
    lastSynced: number;
    blockHeight: number;
  }> {
    // For shielded addresses, ensure viewing key is cached first
    if (type === 'shielded') {
      try {
        console.log('[ZcashModule] syncAddress: Ensuring viewing key is cached for:', address.substring(0, 20) + '...');
        
        // Get the active account to ensure viewing key is available
        const account = await this.getActiveZcashAccount();
        console.log('[ZcashModule] syncAddress: Got account, zAddress:', account.zAddress?.substring(0, 20) + '...');
        
        // Check if the address matches
        if (account.zAddress === address) {
          console.log('[ZcashModule] syncAddress: Address matches, caching viewing key...');
          
          // Cache the viewing key in the provider if not already cached
          // The provider's getAddresses() should have cached it, but ensure it's there
          if (account.viewingKey && account.viewingKey.length > 0) {
            try {
              const midenPrivateKey = await this.config.midenWallet.exportPrivateKey(account.midenAccountId);
              if (midenPrivateKey && midenPrivateKey.length > 0) {
                console.log('[ZcashModule] syncAddress: Calling provider.getAddresses() to cache viewing key...');
                await this.provider.getAddresses(account.midenAccountId, midenPrivateKey);
                console.log('[ZcashModule] syncAddress: Viewing key cached successfully');
                midenPrivateKey.fill(0);
              } else {
                console.warn('[ZcashModule] syncAddress: Private key is empty');
              }
            } catch (keyError) {
              const keyErrorMsg = keyError instanceof Error ? keyError.message : String(keyError);
              console.error('[ZcashModule] syncAddress: Failed to export private key:', keyErrorMsg);
              // If private key export fails, we can't cache the viewing key
              // But we can still try to sync if it's already cached
              console.warn('Could not cache viewing key, but proceeding with sync if already cached');
            }
          } else {
            console.warn('[ZcashModule] syncAddress: Account viewing key is missing or empty');
          }
        } else {
          console.warn('[ZcashModule] syncAddress: Address mismatch:', {
            requested: address.substring(0, 20) + '...',
            account: account.zAddress?.substring(0, 20) + '...'
          });
        }
      } catch (accountError) {
        const accountErrorMsg = accountError instanceof Error ? accountError.message : String(accountError);
        console.error('[ZcashModule] syncAddress: Failed to get account:', accountErrorMsg);
        // If we can't get the account, the sync will fail with a helpful error
        console.warn('Could not ensure viewing key is cached:', accountError);
      }
    }
    
    console.log('[ZcashModule] syncAddress: Calling provider.syncAddress()...');
    return await this.provider.syncAddress(address, type);
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    return await this.provider.getBlockHeight();
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
    return await this.provider.getSyncStatus();
  }

  /**
   * Subscribe to account changes
   */
  onAccountChange(callback: (account: DerivedZcashAccount) => void): () => void {
    return this.keyBridge.onZcashAccountChange(callback);
  }

  /**
   * Get the Zcash provider (for advanced usage)
   */
  getProvider(): ZcashProvider {
    return this.provider;
  }

  /**
   * Get the key bridge (for advanced usage)
   */
  getKeyBridge(): MidenKeyBridge {
    return this.keyBridge;
  }

  /**
   * Check if RPC is connected
   */
  isRPCConnected(): boolean {
    return this.provider.isRPCConnected();
  }

  /**
   * Refresh RPC connection status
   */
  async refreshRPCConnection(): Promise<boolean> {
    return this.provider.refreshRPCConnection();
  }

  /**
   * Get RPC endpoint
   */
  getRPCEndpoint(): string {
    return this.provider.getRPCEndpoint();
  }

  /**
   * Get network (mainnet or testnet)
   */
  getNetwork(): 'mainnet' | 'testnet' {
    return this.provider.getNetwork();
  }

  /**
   * Send a shielded transaction
   *
   * This is the main end-to-end method for sending shielded transactions.
   * It orchestrates the full workflow: select notes → build → prove → sign → serialize → broadcast
   *
   * @param recipient - Recipient Zcash address (can be transparent or shielded)
   * @param amount - Amount in zatoshi (1 ZEC = 100,000,000 zatoshi)
   * @param fee - Optional transaction fee in zatoshi (default: 10,000)
   * @returns Transaction ID (32-byte hash as hex string)
   */
  async sendShieldedTransaction(
    recipient: string,
    amount: number | bigint,
    fee?: number
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('ZcashModule not initialized. Call initialize() first.');
    }

    // Get active account
    const account = await this.getActiveZcashAccount();

    // Delegate to provider's sendShieldedTransaction method
    return await this.provider.sendShieldedTransaction(
      account,
      recipient,
      BigInt(amount),
      BigInt(fee || 10000)
    );
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }

  /**
   * Get default proving service URL
   */
  private getDefaultProvingServiceUrl(): string {
    // Check environment variable first
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_ZCASH_PROVING_SERVICE) {
      return process.env.NEXT_PUBLIC_ZCASH_PROVING_SERVICE;
    }
    // Default to local proving server
    return 'http://localhost:8080';
  }

  /**
   * Get default RPC endpoint for network
   * 
   * Public testnet endpoints (no authentication required):
   * - Uses public Zcash testnet nodes when available
   * - Falls back to localhost if you're running your own node
   * 
   * To use your own node:
   * - Install zcashd: https://z.cash/downloads/
   * - Configure for testnet in ~/.zcash/zcash.conf
   * - Use: http://localhost:18232 (testnet) or http://localhost:8232 (mainnet)
   */
  private getDefaultRpcEndpoint(network: 'mainnet' | 'testnet'): string {
    if (network === 'testnet') {
      // Public testnet endpoints (try these first, fallback to localhost)
      // Option 1: Community public node (may have rate limits)
      // return 'https://testnet.zcashrpc.com';
      
      // Option 2: Local node (recommended for development)
      return 'http://localhost:18232';
      
      // Option 3: Public RPC services (may require API key)
      // - Other services available at: https://freerpc.com/zcash
    } else {
      // Mainnet - ALWAYS use your own node or trusted service
      return 'http://localhost:8232';
    }
  }
}

/**
 * Factory function to create Zcash module
 */
export function createZcashModule(config: ZcashModuleConfig): ZcashModule {
  return new ZcashModule(config);
}

