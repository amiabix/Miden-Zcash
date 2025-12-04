/**
 * Transaction Builder
 * Builds Zcash transactions of various types
 */

import type {
  Transaction,
  TransparentInput,
  TransparentOutput,
  Network
} from '../types/index';
import { ZcashRPCClient } from '../rpc/client';

/**
 * Transaction builder configuration
 */
export interface TransactionBuilderConfig {
  network: Network;
  rpcClient: ZcashRPCClient;
  feeRate?: number; // zatoshi per byte
  minimumFee?: number; // minimum fee in zatoshi
}

/**
 * Transaction Builder
 */
export class ZcashTransactionBuilder {
  private config: Required<TransactionBuilderConfig>;
  private readonly BASE_TRANSACTION_SIZE = 10;
  private readonly INPUT_SIZE = 148; // Approximate
  private readonly OUTPUT_SIZE = 34; // Approximate

  constructor(config: TransactionBuilderConfig) {
    this.config = {
      network: config.network,
      rpcClient: config.rpcClient,
      feeRate: config.feeRate || 1000, // Default 1000 zatoshi per byte
      minimumFee: config.minimumFee || 1000
    };
  }

  /**
   * Build transparent transaction (t-to-t)
   */
  async buildTransparentTransaction(
    inputs: TransparentInput[],
    outputs: TransparentOutput[],
    fee?: number
  ): Promise<Transaction> {
    // Calculate fee if not provided
    const calculatedFee = fee || await this.estimateFee(inputs, outputs);

    // Adjust outputs to account for fee
    const adjustedOutputs = this.adjustOutputsForFee(outputs, calculatedFee, inputs, outputs);

    // Get current block height for expiry
    const currentHeight = await this.config.rpcClient.getBlockCount();
    const expiryHeight = currentHeight + 20; // Expire in 20 blocks

    return {
      version: 4,
      versionGroupId: 0x892F2085, // Zcash v4 version group ID
      lockTime: 0,
      expiryHeight,
      transparentInputs: inputs,
      transparentOutputs: adjustedOutputs,
      valueBalance: 0
    };
  }

  /**
   * Select UTXOs for transaction
   * 
   * @param utxoCache - Optional UTXO cache to use instead of RPC
   */
  async selectUTXOs(
    address: string,
    amount: number,
    fee?: number,
    utxoCache?: { getUTXOs: (address: string) => Array<{ txid: string; vout: number; amount: number; scriptPubKey: string; confirmations: number }> }
  ): Promise<TransparentInput[]> {
    let utxos: Array<{ txid: string; vout: number; amount: number; scriptPubKey: string; confirmations: number }> = [];
    
    // Try UTXO cache first if available
    if (utxoCache) {
      const cachedUtxos = utxoCache.getUTXOs(address);
      if (cachedUtxos.length > 0) {
        utxos = cachedUtxos.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          amount: utxo.amount,
          scriptPubKey: utxo.scriptPubKey,
          confirmations: utxo.confirmations || 0
        }));
      }
    }
    
    // If cache is empty, try RPC
    if (utxos.length === 0) {
      try {
        utxos = await this.config.rpcClient.listUnspent(1, 9999999, [address]);
      } catch (error: any) {
        const errorMsg = error?.message || String(error || '');
        if (errorMsg.includes('not found') || errorMsg.includes('Method not found') || errorMsg.includes('reindexing')) {
          // RPC doesn't support listunspent or node is reindexing
          // Provide helpful error message with workaround
          const isReindexing = errorMsg.includes('reindexing');
          throw new Error(
            `Cannot build transaction: ${isReindexing ? 'Node is reindexing and wallet operations are disabled' : 'RPC method \'listunspent\' not supported by this endpoint'}.\n\n` +
            `To send transparent transactions, you need UTXOs.\n\n` +
            `Solutions:\n` +
            `1. Wait for node to finish reindexing (if reindexing)\n` +
            `2. Use a full Zcash node that supports listunspent\n` +
            `3. For testing: Manually add UTXOs to cache using developer console\n\n` +
            `Development workaround:\n` +
            `Open browser console and run:\n` +
            `  window.__zcashProvider?.utxoCache?.addUTXO('${address}', {txid: '...', vout: 0, amount: ..., scriptPubKey: '...', confirmations: 6}, ${await this.config.rpcClient.getBlockCount()})`
          );
        }
        throw error;
      }
    }

    if (utxos.length === 0) {
      throw new Error(
        `No UTXOs available for address ${address.slice(0, 20)}...\n\n` +
        `To send transparent transactions, you need UTXOs.\n\n` +
        `Solutions:\n` +
        `1. Click "Sync Transparent Address" in the wallet UI to discover UTXOs\n` +
        `2. If using a full node, ensure the address is imported: importaddress "${address}"\n` +
        `3. For testing: Manually add UTXOs using browser console:\n` +
        `   window.__zcashUtxoCache?.addUTXO('${address}', {txid: '...', vout: 0, amount: ..., scriptPubKey: '', confirmations: 6}, ${await this.config.rpcClient.getBlockCount()})\n\n` +
        `Note: If the address was just funded, wait a few minutes for the transaction to confirm.`
      );
    }

    // Sort by value (largest first)
    utxos.sort((a, b) => b.amount - a.amount);

    // Select sufficient UTXOs
    const selected: TransparentInput[] = [];
    let total = 0;
    const estimatedFee = fee || this.config.minimumFee;

    for (const utxo of utxos) {
      selected.push({
        txHash: utxo.txid,
        index: utxo.vout,
        scriptPubKey: utxo.scriptPubKey,
        value: utxo.amount,
        sequence: 0xFFFFFFFF // Default sequence
      });

      total += utxo.amount;

      if (total >= amount + estimatedFee) {
        break;
      }
    }

    if (total < amount + estimatedFee) {
      throw new Error(`Insufficient funds: ${total} < ${amount + estimatedFee}`);
    }

    return selected;
  }

  /**
   * Calculate change output
   */
  calculateChange(
    inputs: TransparentInput[],
    outputs: TransparentOutput[],
    fee: number,
    changeAddress: string
  ): TransparentOutput | null {
    const inputTotal = inputs.reduce((sum, input) => sum + input.value, 0);
    const outputTotal = outputs.reduce((sum, output) => sum + output.value, 0);
    const change = inputTotal - outputTotal - fee;

    // Only create change output if change is significant (more than dust)
    if (change > 1000) { // Dust threshold
      return {
        address: changeAddress,
        value: change,
        scriptPubKey: '' // Will be generated from address
      };
    }

    return null;
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(
    inputs: TransparentInput[],
    outputs: TransparentOutput[]
  ): Promise<number> {
    // Estimate transaction size
    const estimatedSize = this.estimateTransactionSize(inputs, outputs);

    // Calculate fee
    const fee = estimatedSize * this.config.feeRate;

    // Apply minimum fee
    return Math.max(fee, this.config.minimumFee);
  }

  /**
   * Estimate transaction size
   */
  private estimateTransactionSize(
    inputs: TransparentInput[],
    outputs: TransparentOutput[]
  ): number {
    let size = this.BASE_TRANSACTION_SIZE;

    // Version group ID (if v4+)
    size += 4;

    // Inputs
    size += this.compactSizeSize(inputs.length);
    size += inputs.length * this.INPUT_SIZE;

    // Outputs
    size += this.compactSizeSize(outputs.length);
    size += outputs.length * this.OUTPUT_SIZE;

    // Lock time and expiry
    size += 4 + 4;

    return size;
  }

  /**
   * Adjust outputs to account for fee
   */
  private adjustOutputsForFee(
    outputs: TransparentOutput[],
    fee: number,
    inputs: TransparentInput[],
    originalOutputs: TransparentOutput[]
  ): TransparentOutput[] {
    const inputTotal = inputs.reduce((sum, input) => sum + input.value, 0);
    const outputTotal = originalOutputs.reduce((sum, output) => sum + output.value, 0);
    const available = inputTotal - fee;

    // If outputs exceed available, reduce the last output
    if (outputTotal > available) {
      const adjusted = [...outputs];
      const reduction = outputTotal - available;
      
      if (adjusted.length > 0) {
        adjusted[adjusted.length - 1] = {
          ...adjusted[adjusted.length - 1],
          value: Math.max(0, adjusted[adjusted.length - 1].value - reduction)
        };
      }

      return adjusted;
    }

    return outputs;
  }

  /**
   * Calculate compact size encoding length
   */
  private compactSizeSize(value: number): number {
    if (value < 0xFD) return 1;
    if (value <= 0xFFFF) return 3;
    if (value <= 0xFFFFFFFF) return 5;
    return 9;
  }
}


