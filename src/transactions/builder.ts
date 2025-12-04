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
    // Log to diagnose unit mismatch issue
    console.log(`[TransactionBuilder] selectUTXOs called with: amount=${amount}, amount type=${typeof amount}, fee=${fee}`);

    let utxos: Array<{ txid: string; vout: number; amount: number; scriptPubKey: string; confirmations: number }> = [];

    // Try UTXO cache first if available
    if (utxoCache) {
      const cachedUtxos = utxoCache.getUTXOs(address);
      if (cachedUtxos.length > 0) {
        utxos = cachedUtxos.map(utxo => {
          // Check if amount is in ZEC format (less than 1 and looks like decimal) and convert
          // If amount is < 1, it's likely in ZEC format and needs conversion
          let amount = utxo.amount;
          if (amount > 0 && amount < 1) {
            console.warn(`[TransactionBuilder] Cached UTXO amount appears to be in ZEC (${amount}), converting to zatoshi`);
            amount = Math.round(amount * 100000000);
          }
          
          return {
            txid: utxo.txid,
            vout: utxo.vout,
            amount: amount,
            scriptPubKey: utxo.scriptPubKey,
            confirmations: utxo.confirmations || 0
          };
        });
        const totalCached = utxos.reduce((sum, u) => sum + u.amount, 0);
        console.log(`[TransactionBuilder] Found ${utxos.length} UTXO(s) in cache for ${address.substring(0, 20)}..., total: ${totalCached} zatoshi (${(totalCached / 100000000).toFixed(8)} ZEC)`);
      }
    }
    
    // If cache is empty or has invalid amounts, try RPC
    // Also check if cached amounts look like ZEC (less than 1) and force refresh
    const hasInvalidAmounts = utxos.some((u: any) => u.amount > 0 && u.amount < 1);
    
    if (utxos.length === 0 || hasInvalidAmounts) {
      if (hasInvalidAmounts) {
        console.warn(`[TransactionBuilder] Cached UTXOs have ZEC amounts (detected amounts < 1), clearing cache and fetching fresh from RPC`);
        // Clear cache for this address if it has invalid amounts
        if (utxoCache && typeof (utxoCache as any).clearAddress === 'function') {
          (utxoCache as any).clearAddress(address);
          console.log(`[TransactionBuilder] Cleared cache for ${address.substring(0, 20)}...`);
        }
        utxos = [];
      }
      
      console.log(`[TransactionBuilder] No UTXOs in cache or invalid amounts, fetching from RPC for ${address.substring(0, 20)}...`);
      try {
        utxos = await this.config.rpcClient.listUnspent(1, 9999999, [address]);
        console.log(`[TransactionBuilder] RPC returned ${utxos.length} UTXO(s) for ${address.substring(0, 20)}...`);
        
        if (utxos.length > 0) {
          // Verify amounts are in zatoshi (should be converted by listUnspent)
          const totalAmount = utxos.reduce((sum: number, u: any) => sum + u.amount, 0);
          console.log(`[TransactionBuilder] UTXO details:`, utxos.map((u: any) => ({
            txid: u.txid?.substring(0, 16) + '...',
            vout: u.vout,
            amount: u.amount,
            amountZEC: (u.amount / 100000000).toFixed(8),
            isZatoshi: u.amount >= 1
          })));
          console.log(`[TransactionBuilder] Total UTXO value: ${totalAmount} zatoshi (${(totalAmount / 100000000).toFixed(8)} ZEC)`);
          
          // Double-check: if any amount is < 1, it's still in ZEC and needs conversion
          const needsConversion = utxos.some((u: any) => u.amount > 0 && u.amount < 1);
          if (needsConversion) {
            console.warn(`[TransactionBuilder] Some UTXO amounts are still in ZEC format, converting...`);
            utxos = utxos.map((u: any) => {
              if (u.amount > 0 && u.amount < 1) {
                return {
                  ...u,
                  amount: Math.round(u.amount * 100000000)
                };
              }
              return u;
            });
            const convertedTotal = utxos.reduce((sum: number, u: any) => sum + u.amount, 0);
            console.log(`[TransactionBuilder] After conversion: ${convertedTotal} zatoshi (${(convertedTotal / 100000000).toFixed(8)} ZEC)`);
          }
        }
        
        // Update cache with fetched UTXOs for future use
        if (utxos.length > 0 && utxoCache && typeof (utxoCache as any).updateUTXOs === 'function') {
          try {
            const blockCount = await this.config.rpcClient.getBlockCount();
            (utxoCache as any).updateUTXOs(address, utxos, blockCount);
            console.log(`[TransactionBuilder] Updated UTXO cache with ${utxos.length} UTXO(s) for ${address.substring(0, 20)}...`);
          } catch (cacheError) {
            console.warn('[TransactionBuilder] Failed to update UTXO cache:', cacheError);
            // Continue anyway - we have UTXOs from RPC
          }
        }
      } catch (error: any) {
        const errorMsg = error?.message || String(error || '');
        if (errorMsg.includes('not found') || errorMsg.includes('Method not found') || errorMsg.includes('reindexing')) {
          // RPC doesn't support listunspent or node is reindexing
          const isReindexing = errorMsg.includes('reindexing');
          throw new Error(
            `Cannot build transaction: ${isReindexing ? 'Node is reindexing and wallet operations are disabled' : 'RPC method \'listunspent\' not supported by this endpoint'}.\n\n` +
            `To send transparent transactions, you need UTXOs.\n\n` +
            `Solutions:\n` +
            `1. Wait for node to finish reindexing (if reindexing)\n` +
            `2. Ensure your local Zcash node is running and supports listunspent\n` +
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
      let errorMessage = `No UTXOs available for address ${address.slice(0, 20)}...\n\n`;
      errorMessage += `To send transparent transactions, you need UTXOs.\n\n`;
      errorMessage += `Possible causes:\n`;
      errorMessage += `1. The address has not received any funds\n`;
      errorMessage += `2. The address is not imported into the wallet\n`;
      errorMessage += `3. The transaction is still confirming\n\n`;
      errorMessage += `Solutions:\n`;
      errorMessage += `1. Click "Sync Transparent Address" in the wallet UI\n`;
      errorMessage += `2. Import the address into your local node: importaddress "${address}"\n`;
      errorMessage += `3. Wait for transactions to confirm (6+ confirmations recommended)\n\n`;
      errorMessage += `Note: For local zcashd nodes, addresses must be imported before listunspent can find UTXOs.`;
      
      throw new Error(errorMessage);
    }

    // Sort by value (largest first)
    utxos.sort((a, b) => b.amount - a.amount);

    // Select sufficient UTXOs
    const selected: TransparentInput[] = [];
    let total = 0;
    const estimatedFee = fee || this.config.minimumFee;

    console.log(`[TransactionBuilder] Selecting UTXOs: ${utxos.length} available, need ${amount} zatoshi + ${estimatedFee} zatoshi fee = ${amount + estimatedFee} zatoshi`);

    for (const utxo of utxos) {
      selected.push({
        txHash: utxo.txid,
        index: utxo.vout,
        scriptPubKey: utxo.scriptPubKey,
        value: utxo.amount,
        sequence: 0xFFFFFFFF // Default sequence
      });

      total += utxo.amount;
      console.log(`[TransactionBuilder] Selected UTXO: ${utxo.txid.substring(0, 16)}... vout ${utxo.vout}, amount: ${utxo.amount} zatoshi, running total: ${total} zatoshi`);

      if (total >= amount + estimatedFee) {
        console.log(`[TransactionBuilder] Sufficient UTXOs selected: ${total} zatoshi >= ${amount + estimatedFee} zatoshi`);
        break;
      }
    }

    if (total < amount + estimatedFee) {
      const totalZEC = (total / 100000000).toFixed(8);
      const requiredZEC = ((amount + estimatedFee) / 100000000).toFixed(8);
      const totalZatoshi = total;
      const requiredZatoshi = amount + estimatedFee;
      
      console.error(`[TransactionBuilder] Insufficient UTXOs: total=${totalZatoshi} zatoshi (${totalZEC} ZEC), required=${requiredZatoshi} zatoshi (${requiredZEC} ZEC)`);
      
      throw new Error(
        `Insufficient funds: ${totalZatoshi} zatoshi (${totalZEC} ZEC) < ${requiredZatoshi} zatoshi (${requiredZEC} ZEC)\n\n` +
        `Available UTXOs: ${selected.length} UTXO(s) with total value ${totalZatoshi} zatoshi\n` +
        `Required: ${amount} zatoshi (amount) + ${estimatedFee} zatoshi (fee) = ${requiredZatoshi} zatoshi\n\n` +
        `Possible causes:\n` +
        `1. Not enough UTXOs to cover the transaction amount and fee\n` +
        `2. UTXOs may not have been discovered yet - try syncing the address first\n` +
        `3. Address may not be imported into the wallet - ensure address is imported`
      );
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


