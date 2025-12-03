/**
 * Zcash SDK Bridge
 *
 * Convenient interface for Miden Wallet UI components
 * Wraps the Zcash SDK and provides clean APIs for:
 * - Getting balances
 * - Building transactions
 * - Broadcasting transactions
 * - Getting transaction history
 */

import type { Network } from '../types/index';
import { ZcashRPCClient } from '../rpc/client';
import { ZcashTransactionBuilder } from '../transactions/builder';
// import { ZcashSigner } from '../transactions/signing'; // Reserved for future use
import { ZcashProver } from '../shielded/prover';

/**
 * Configuration for SDK bridge
 */
export interface ZcashSDKConfig {
  network: Network;
  rpcEndpoint?: string;
  feeRate?: number;
  minimumFee?: number;
  useProver?: boolean;
}

/**
 * Balance response
 */
export interface BalanceInfo {
  transparent: {
    value: bigint;
    unconfirmed: bigint;
  };
  shielded: {
    value: bigint;
    unconfirmed: bigint;
  };
}

/**
 * Transaction info
 */
export interface TransactionInfo {
  txHash: string;
  type: 'transparent' | 'shielded' | 'mixed';
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
  memo?: string;
}

/**
 * Transaction building request
 */
export interface BuildTransactionRequest {
  fromAddress: string;
  toAddress: string;
  amount: bigint;
  fee?: bigint;
  memo?: string;
}

/**
 * Zcash SDK Bridge
 *
 * Provides convenient interface to Zcash SDK for wallet integration
 */
export class ZcashSDKBridge {
  private rpcClient: ZcashRPCClient;
  private txBuilder: ZcashTransactionBuilder;
  // private signer: ZcashSigner; // Reserved for future use
  private prover: ZcashProver;
  private network: Network;
  private config: ZcashSDKConfig;

  constructor(config: ZcashSDKConfig) {
    this.network = config.network;
    this.config = config;

    // Initialize RPC client
    const rpcEndpoint =
      config.rpcEndpoint ||
      (config.network === 'testnet'
        ? 'https://testnet.zcashexplorer.com'
        : 'https://mainnet.zcashexplorer.com');

    this.rpcClient = new ZcashRPCClient({
      endpoint: rpcEndpoint,
      timeout: 30000,
      retries: 3
    });

    // Initialize transaction builder
    this.txBuilder = new ZcashTransactionBuilder({
      network: config.network,
      rpcClient: this.rpcClient,
      feeRate: config.feeRate || 1000,
      minimumFee: config.minimumFee || 1000
    });

    // Initialize signer (reserved for future use)
    // this.signer = new ZcashSigner();

    // Initialize prover (for shielded transactions)
    this.prover = new ZcashProver({
      useWorker: true,
      wasmPath: '/zcash-prover.wasm',
      timeout: 5 * 60 * 1000 // 5 minute timeout
    });
  }

  /**
   * Get balance for an address
   *
   * Returns both transparent and shielded balances
   */
  async getBalance(address: string): Promise<BalanceInfo> {
    try {
      // Determine address type
      const isTransparent = address.startsWith('t') || address.startsWith('tm');
      const isShielded = address.startsWith('zs') || address.startsWith('ztestsapling');

      if (!isTransparent && !isShielded) {
        throw new Error('Invalid Zcash address');
      }

      let transparentBalance = 0n;
      let shieldedBalance = 0n;

      if (isTransparent) {
        // Get transparent balance
        transparentBalance = BigInt(
          (await this.rpcClient.getBalance(address)) || 0
        );
      }

      if (isShielded) {
        // Get shielded balance
        shieldedBalance = BigInt(
          (await this.rpcClient.zGetBalance(address)) || 0
        );
      }

      return {
        transparent: {
          value: transparentBalance,
          unconfirmed: 0n // Pending transaction tracking not yet implemented
        },
        shielded: {
          value: shieldedBalance,
          unconfirmed: 0n
        }
      };
    } catch (error) {
      throw new Error(`Failed to get balance for ${address}: ${error}`);
    }
  }

  /**
   * Build a transparent transaction (t-to-t)
   */
  async buildTransparentTransaction(
    request: BuildTransactionRequest
  ): Promise<{ txHex: string; txFee: bigint }> {
    try {
      // Validate addresses
      if (!request.fromAddress.startsWith('t')) {
        throw new Error('Invalid transparent from address');
      }
      if (!request.toAddress.startsWith('t')) {
        throw new Error('Invalid transparent to address');
      }

      // Get UTXOs first
      const inputs = await this.txBuilder.selectUTXOs(
        request.fromAddress,
        Number(request.amount),
        request.fee ? Number(request.fee) : undefined
      );

      // Build transaction
      await this.txBuilder.buildTransparentTransaction(
        inputs,
        [
          {
            address: request.toAddress,
            value: Number(request.amount),
            scriptPubKey: ''
          }
        ],
        request.fee ? Number(request.fee) : undefined
      );

      // Signing requires private key from wallet
      // This method should be called with the private key
      // For now, return unsigned transaction
      // Wallet should use ZcashProvider.buildAndSignTransaction() instead
      
      throw new Error(
        'Use ZcashModule.buildAndSignTransaction() instead. ' +
        'This method requires private key from wallet.'
      );
    } catch (error) {
      throw new Error(`Failed to build transparent transaction: ${error}`);
    }
  }

  /**
   * Build a shielding transaction (t-to-z)
   */
  async buildShieldingTransaction(
    request: BuildTransactionRequest
  ): Promise<{ txHex: string; txFee: bigint }> {
    try {
      // Validate addresses
      if (!request.fromAddress.startsWith('t')) {
        throw new Error('Invalid from address (must be transparent)');
      }
      if (!request.toAddress.startsWith('zs') && !request.toAddress.startsWith('ztestsapling')) {
        throw new Error('Invalid to address (must be shielded)');
      }

      // Shielding transaction building not yet implemented
      throw new Error('Shielding transactions not yet implemented');
    } catch (error) {
      throw new Error(`Failed to build shielding transaction: ${error}`);
    }
  }

  /**
   * Broadcast a signed transaction to the network
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      const txHash = await this.rpcClient.sendRawTransaction(txHex);
      return txHash;
    } catch (error) {
      throw new Error(`Failed to broadcast transaction: ${error}`);
    }
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(
    _address: string,
    _limit: number = 20
  ): Promise<TransactionInfo[]> {
    try {
      // Transaction history fetching not yet implemented
      return [];
    } catch (error) {
      throw new Error(`Failed to get transaction history: ${error}`);
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(request: BuildTransactionRequest): Promise<bigint> {
    try {
      const isTransparent = request.fromAddress.startsWith('t');

      if (isTransparent) {
        const estimatedFee = await this.txBuilder.estimateFee(
          [
            {
              txHash: '',
              index: 0,
              value: Number(request.amount),
              scriptPubKey: '',
              sequence: 0xffffffff
            }
          ],
          [
            {
              address: request.toAddress,
              value: Number(request.amount),
              scriptPubKey: ''
            }
          ]
        );

        return BigInt(estimatedFee);
      } else {
        // Shielded transaction fee is higher
        return BigInt(10000);
      }
    } catch (error) {
      // Return default fee on error
      return BigInt(this.config.minimumFee || 1000);
    }
  }

  /**
   * Validate an address
   */
  validateAddress(address: string): boolean {
    const isTransparent = address.startsWith('t1') ||
      address.startsWith('t3') ||
      address.startsWith('tm') ||
      address.startsWith('t2');

    const isShielded =
      address.startsWith('zs') || address.startsWith('ztestsapling');

    return isTransparent || isShielded;
  }

  /**
   * Get network name
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Initialize prover (load WASM, etc.)
   */
  async initializeProver(): Promise<void> {
    if (this.config.useProver) {
      await this.prover.initialize();
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    await this.prover.dispose();
  }
}

/**
 * Factory function to create bridge
 */
export function createZcashSDKBridge(config: ZcashSDKConfig): ZcashSDKBridge {
  return new ZcashSDKBridge(config);
}
