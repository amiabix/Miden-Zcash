/**
 * Zcash JSON-RPC Client for blockchain interaction
 * Supports testnet and mainnet broadcasting and transaction verification
 */

/**
 * JSON-RPC 2.0 request format
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

/**
 * JSON-RPC 2.0 response format
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

/**
 * Block header information
 */
export interface BlockHeader {
  version: number;
  previousBlockHash: string;
  merkleRoot: string;
  time: number;
  bits: number;
  nonce: number;
  height: number;
  hash: string;
}

/**
 * Transaction information
 */
export interface TransactionInfo {
  txid: string;
  version: number;
  size: number;
  locktime: number;
  vin?: any[];
  vout?: any[];
  hex?: string;
  confirmations?: number;
  blocktime?: number;
  blockhash?: string;
}

/**
 * Zcash RPC Client for broadcasting and verifying transactions
 */
export class ZcashRpcClient {
  private rpcUrl: string;
  private rpcUsername?: string;
  private rpcPassword?: string;
  private requestId: number = 0;

  constructor(
    rpcUrl: string,
    options?: {
      username?: string;
      password?: string;
    }
  ) {
    this.rpcUrl = rpcUrl;
    this.rpcUsername = options?.username;
    this.rpcPassword = options?.password;
  }

  /**
   * Send a JSON-RPC request to the Zcash node
   */
  private async sendRequest(method: string, params: any[] = []): Promise<any> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this.requestId
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add basic auth if credentials provided
    if (this.rpcUsername && this.rpcPassword) {
      const credentials = btoa(`${this.rpcUsername}:${this.rpcPassword}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: JsonRpcResponse = await response.json();

      if (data.error) {
        throw new Error(`RPC Error (${data.error.code}): ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      throw new Error(
        `Failed to send RPC request to ${this.rpcUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get blockchain info (height, network, etc)
   */
  async getBlockchainInfo(): Promise<{
    blocks: number;
    chain: string;
    headers: number;
    bestblockhash: string;
  }> {
    return this.sendRequest('getblockchaininfo');
  }

  /**
   * Get block hash at specific height
   */
  async getBlockHash(height: number): Promise<string> {
    return this.sendRequest('getblockhash', [height]);
  }

  /**
   * Get block by hash
   */
  async getBlock(hash: string, verbosity: number = 2): Promise<any> {
    return this.sendRequest('getblock', [hash, verbosity]);
  }

  /**
   * Get raw transaction
   */
  async getRawTransaction(txid: string, verbose: boolean = false): Promise<any> {
    return this.sendRequest('getrawtransaction', [txid, verbose]);
  }

  /**
   * Broadcast a signed transaction to the network
   */
  async sendRawTransaction(hexTx: string, allowHighFees?: boolean): Promise<string> {
    try {
      const txid = await this.sendRequest('sendrawtransaction', [hexTx, allowHighFees ?? false]);
      return txid;
    } catch (error) {
      throw new Error(
        `Failed to broadcast transaction: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Decode a raw transaction without broadcasting
   */
  async decodeRawTransaction(hexTx: string): Promise<TransactionInfo> {
    return this.sendRequest('decoderawtransaction', [hexTx]);
  }

  /**
   * Validate a transaction (but don't broadcast)
   */
  async validateTransaction(hexTx: string): Promise<boolean> {
    try {
      await this.decodeRawTransaction(hexTx);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txid: string): Promise<TransactionInfo> {
    return this.sendRequest('gettransaction', [txid]);
  }

  /**
   * Get transaction from mempool without requiring it to be in a block
   */
  async getMempoolTransaction(txid: string): Promise<TransactionInfo | null> {
    try {
      return await this.sendRequest('getrawtransaction', [txid, true]);
    } catch {
      return null;
    }
  }

  /**
   * Wait for a transaction to be confirmed
   * Polls blockchain until transaction appears in a block
   */
  async waitForConfirmation(
    txid: string,
    options?: {
      maxWaitMs?: number;
      pollIntervalMs?: number;
      requiredConfirmations?: number;
    }
  ): Promise<{
    confirmed: boolean;
    confirmations: number;
    blockHeight?: number;
    blockHash?: string;
    blockTime?: number;
  }> {
    const maxWaitMs = options?.maxWaitMs ?? 600000; // 10 minutes default
    const pollIntervalMs = options?.pollIntervalMs ?? 5000; // 5 seconds default
    const requiredConfirmations = options?.requiredConfirmations ?? 1;

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const tx = await this.getMempoolTransaction(txid);
        if (!tx) {
          // Not in mempool yet, check if it was mined
          try {
            const blockchainTx = await this.getTransaction(txid);
            if (blockchainTx.confirmations && blockchainTx.confirmations >= requiredConfirmations) {
              return {
                confirmed: true,
                confirmations: blockchainTx.confirmations,
                blockHash: blockchainTx.blockhash,
                blockTime: blockchainTx.blocktime
              };
            }
          } catch {
            // Transaction not found yet
          }
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        // Continue polling on error
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    return {
      confirmed: false,
      confirmations: 0
    };
  }

  /**
   * Get fee estimates
   */
  async estimateFee(blocks: number = 6): Promise<number> {
    try {
      return await this.sendRequest('estimatefee', [blocks]);
    } catch {
      // Fallback to default if fee estimation fails
      return 0.00001; // 1 satoshi/byte default
    }
  }

  /**
   * Get network info
   */
  async getNetworkInfo(): Promise<{
    version: number;
    subversion: string;
    protocolversion: number;
    connections: number;
    networks?: Array<{
      name: string;
      limited: boolean;
      reachable: boolean;
      proxy: string;
    }>;
  }> {
    return this.sendRequest('getnetworkinfo');
  }

  /**
   * Verify a transaction is in a specific block
   */
  async verifyTransactionInBlock(txid: string, blockHash: string): Promise<boolean> {
    try {
      const block = await this.getBlock(blockHash, 2);
      if (block.tx && Array.isArray(block.tx)) {
        return block.tx.includes(txid);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get all transactions for a height range (useful for scanning)
   */
  async getTransactionsBetweenHeights(
    startHeight: number,
    endHeight: number
  ): Promise<Array<{ txid: string; height: number }>> {
    const transactions: Array<{ txid: string; height: number }> = [];

    for (let height = startHeight; height <= endHeight; height++) {
      try {
        const blockHash = await this.getBlockHash(height);
        const block = await this.getBlock(blockHash, 2);

        if (block.tx && Array.isArray(block.tx)) {
          for (const txid of block.tx) {
            transactions.push({ txid, height });
          }
        }
      } catch (error) {
        // Failed to fetch block - skip and continue with next block
        continue;
      }
    }

    return transactions;
  }
}

/**
 * Create a Zcash RPC client for testnet
 */
export function createTestnetRpcClient(rpcUrl?: string, credentials?: { username: string; password: string }): ZcashRpcClient {
  const url = rpcUrl || 'http://localhost:18232'; // Default testnet port
  return new ZcashRpcClient(url, credentials);
}

/**
 * Create a Zcash RPC client for mainnet
 */
export function createMainnetRpcClient(rpcUrl?: string, credentials?: { username: string; password: string }): ZcashRpcClient {
  const url = rpcUrl || 'http://localhost:8232'; // Default mainnet port
  return new ZcashRpcClient(url, credentials);
}
