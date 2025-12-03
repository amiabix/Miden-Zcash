/**
 * Miden Key Bridge
 *
 * Bridges Miden Wallet and Zcash SDK
 * Handles:
 * - Requesting Miden private keys
 * - Deriving Zcash keys from Miden keys
 * - Signing Zcash transactions with Zcash logic (not Miden signing)
 */

import type { Network } from '../types/index';
import { ZcashKeyDerivation } from '../crypto/keyDerivation';
import { ZcashSigner } from '../transactions/signing';

/**
 * Miden Wallet API interface
 * What we need from the Miden wallet to integrate
 */
export interface MidenWalletAPI {
  /**
   * Get the currently active Miden account
   */
  getActiveAccount(): Promise<{
    id: string;
    name: string;
    publicKey: Uint8Array;
  }>;

  /**
   * Request the private key for an account
   * Usually requires user confirmation in wallet UI
   */
  exportPrivateKey(accountId: string): Promise<Uint8Array>;

  /**
   * Subscribe to account changes
   */
  onAccountChange(
    callback: (account: { id: string; name: string }) => void
  ): () => void;

  /**
   * Get list of all accounts
   */
  getAccounts(): Promise<Array<{ id: string; name: string }>>;

  /**
   * Network context
   */
  getNetwork(): 'mainnet' | 'testnet';
}

/**
 * Zcash Account (derived from Miden account)
 */
export interface DerivedZcashAccount {
  id: string;
  midenAccountId: string;
  midenAccountName: string;
  network: Network;
  tAddress: string;
  zAddress: string;
  spendingKey: Uint8Array;
  viewingKey: Uint8Array;
  transparentPrivateKey: Uint8Array;
}

/**
 * Bridge between Miden Wallet and Zcash SDK
 */
export class MidenKeyBridge {
  private midenWallet: MidenWalletAPI;
  private network: Network;
  private keyDerivation: ZcashKeyDerivation;
  private signer: ZcashSigner;
  
  // Cache for derived accounts (midenAccountId -> DerivedZcashAccount)
  private accountCache: Map<string, DerivedZcashAccount> = new Map();

  constructor(midenWallet: MidenWalletAPI) {
    this.midenWallet = midenWallet;
    const detectedNetwork = midenWallet.getNetwork();
    this.network = detectedNetwork === 'testnet' ? 'testnet' : 'mainnet';
    this.keyDerivation = new ZcashKeyDerivation(this.network);
    this.signer = new ZcashSigner();
  }

  /**
   * Derive Zcash account from active Miden account
   *
   * Flow:
   * 1. Get active Miden account
   * 2. Request Miden private key (user confirmation)
   * 3. Derive Zcash keys from Miden key
   * 4. Return account information
   */
  async deriveZcashAccount(
    midenAccountId: string
  ): Promise<DerivedZcashAccount> {
    // Check in-memory cache first
    if (this.accountCache.has(midenAccountId)) {
      const cached = this.accountCache.get(midenAccountId)!;
      // Verify cached account matches current network
      if (cached.network === this.network) {
        // Also verify the address prefix matches the network
        const expectedPrefix = this.network === 'testnet' ? 'tm' : 't1';
        const actualPrefix = cached.tAddress.substring(0, 2);
        if (actualPrefix === expectedPrefix) {
          return cached;
        } else {
          this.accountCache.delete(midenAccountId);
        }
      } else {
        // Clear cache if network mismatch
        this.accountCache.delete(midenAccountId);
      }
    }

    // Check localStorage cache (persists across page refreshes)
    // Only the account ID is cached to avoid storing sensitive keys.
    // If account is cached, keys still need to be derived but password prompt can be skipped.
    if (typeof window !== 'undefined') {
      try {
        const cacheKey = `zcash_account_setup_${midenAccountId}`;
        const isSetup = localStorage.getItem(cacheKey) === 'true';
        if (isSetup) {
          // Account was set up before, but we still need to derive keys
          // However, we can skip the password dialog by using a flag
          // The adapter will check this flag and skip password requirement
          (window as any).__ZCASH_ACCOUNT_SETUP__ = (window as any).__ZCASH_ACCOUNT_SETUP__ || {};
          (window as any).__ZCASH_ACCOUNT_SETUP__[midenAccountId] = true;
        }
      } catch (e) {
        // localStorage access failed, continue normally
        // Failed to read from localStorage
      }
    }

    // 1. Get Miden account info
    const midenAccounts = await this.midenWallet.getAccounts();
    const midenAccount = midenAccounts.find((a) => a.id === midenAccountId);

    if (!midenAccount) {
      throw new Error(`Miden account ${midenAccountId} not found`);
    }

    // 2. Request private key from Miden wallet
    // This should trigger a UI confirmation in the wallet
    // Only ask if not already cached
    let midenPrivateKey: Uint8Array | null = null;
    try {
      midenPrivateKey = await this.midenWallet.exportPrivateKey(
        midenAccountId
      );
    } catch (error) {
      throw new Error('User denied access to private key');
    }

    if (!midenPrivateKey || midenPrivateKey.length === 0) {
      throw new Error('Failed to retrieve Miden private key');
    }

    // 3. Derive Zcash keys
    let derivedKeys;
    try {
      derivedKeys = this.keyDerivation.deriveKeys(
        midenAccountId,
        midenPrivateKey
      );
    } finally {
      // Scrub private key from memory after use
      if (midenPrivateKey) {
        midenPrivateKey.fill(0);
        midenPrivateKey = null;
      }
    }

    // Validate derived keys have addresses
    if (!derivedKeys || 
        !derivedKeys.tAddress || 
        typeof derivedKeys.tAddress !== 'string' ||
        derivedKeys.tAddress.length === 0 ||
        !derivedKeys.zAddress || 
        typeof derivedKeys.zAddress !== 'string' ||
        derivedKeys.zAddress.length === 0) {
      throw new Error('Failed to derive valid Zcash addresses from Miden key');
    }

    // 4. Create account object
    const zcashAccount: DerivedZcashAccount = {
      id: `${midenAccountId}-zcash`,
      midenAccountId,
      midenAccountName: midenAccount.name,
      network: this.network,
      tAddress: derivedKeys.tAddress,
      zAddress: derivedKeys.zAddress,
      spendingKey: derivedKeys.spendingKey,
      viewingKey: derivedKeys.viewingKey,
      transparentPrivateKey: derivedKeys.transparentPrivateKey
    };


    // 5. Cache the derived account (in-memory)
    this.accountCache.set(midenAccountId, zcashAccount);

    // 6. Mark account as set up in localStorage (only store a flag, not sensitive data)
    if (typeof window !== 'undefined') {
      try {
        const cacheKey = `zcash_account_setup_${midenAccountId}`;
        localStorage.setItem(cacheKey, 'true');
      } catch (e) {
        // localStorage write failed, but account is still cached in memory
        // Failed to write to localStorage
      }
    }

    return zcashAccount;
  }

  /**
   * Get all Zcash accounts (derived from all Miden accounts)
   */
  async getAllZcashAccounts(): Promise<DerivedZcashAccount[]> {
    const midenAccounts = await this.midenWallet.getAccounts();
    const zcashAccounts: DerivedZcashAccount[] = [];

    for (const account of midenAccounts) {
      try {
        const zcashAccount = await this.deriveZcashAccount(account.id);
        zcashAccounts.push(zcashAccount);
      } catch (error) {
        // Skip accounts that fail to derive
      }
    }

    return zcashAccounts;
  }

  /**
   * Sign a Zcash transaction
   *
   * Uses Zcash signing logic (secp256k1 ECDSA), not Miden signing
   * The key is derived from Miden but the signing is Zcash-specific
   * 
   * This is a low-level method. For building and signing transactions,
   * use ZcashProvider.buildAndSignTransaction() instead.
   */
  async signZcashTransaction(
    midenAccountId: string,
    transaction: any,
    inputs: any[]
  ): Promise<{ txHash: string; rawTx: string }> {
    // 1. Derive Zcash account
    const zcashAccount = await this.deriveZcashAccount(midenAccountId);

    // 2. Sign with Zcash logic (secp256k1 for transparent)
    // This uses the transparentPrivateKey, not any Miden signing
    const signedTx = this.signer.signTransparentTransaction(
      transaction,
      zcashAccount.transparentPrivateKey,
      inputs
    );

    // 3. Return signed transaction
    return {
      txHash: signedTx.txHash,
      rawTx: signedTx.rawTx
    };
  }

  /**
   * Watch for Miden account changes
   * When user switches Miden account, update Zcash account
   */
  onZcashAccountChange(
    callback: (account: DerivedZcashAccount) => void
  ): () => void {
    return this.midenWallet.onAccountChange(async (account) => {
      try {
        const zcashAccount = await this.deriveZcashAccount(account.id);
        callback(zcashAccount);
      } catch (error) {
        // Failed to derive Zcash account on account change
      }
    });
  }

  /**
   * Get the network this bridge is operating on
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Verify that a Zcash address belongs to this account
   */
  verifyAddressOwnership(
    zcashAccount: DerivedZcashAccount,
    address: string
  ): boolean {
    return address === zcashAccount.tAddress || address === zcashAccount.zAddress;
  }
}

/**
 * Factory function to create bridge
 * Use this when initializing Zcash module in Miden wallet
 */
export function createMidenKeyBridge(midenWallet: MidenWalletAPI): MidenKeyBridge {
  return new MidenKeyBridge(midenWallet);
}
