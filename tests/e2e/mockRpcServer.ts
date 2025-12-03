/**
 * Mock Zcash RPC Server for Testing
 * 
 * Provides a mock implementation of the Zcash JSON-RPC API
 * for testing without a real node.
 */

/**
 * Mock blockchain state
 */
interface MockBlockchainState {
  height: number;
  chain: string;
  bestBlockHash: string;
  mempool: Map<string, MockTransaction>;
  blocks: Map<string, MockBlock>;
  nullifiers: Set<string>;
}

interface MockTransaction {
  txid: string;
  hex: string;
  confirmations: number;
  blockHash?: string;
  blockTime?: number;
}

interface MockBlock {
  hash: string;
  height: number;
  time: number;
  tx: string[];
}

/**
 * Mock RPC Server
 */
export class MockRpcServer {
  private state: MockBlockchainState;
  private handlers: Map<string, (params: any[]) => any>;

  constructor() {
    this.state = {
      height: 1000000,
      chain: 'testnet',
      bestBlockHash: '0'.repeat(64),
      mempool: new Map(),
      blocks: new Map(),
      nullifiers: new Set()
    };

    this.handlers = new Map();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // getblockchaininfo
    this.handlers.set('getblockchaininfo', () => ({
      blocks: this.state.height,
      headers: this.state.height,
      chain: this.state.chain,
      bestblockhash: this.state.bestBlockHash,
      difficulty: 1234567.89,
      verificationprogress: 1.0
    }));

    // getnetworkinfo
    this.handlers.set('getnetworkinfo', () => ({
      version: 5000050,
      subversion: '/MagicBean:5.0.0/',
      protocolversion: 170017,
      connections: 8,
      networks: [
        { name: 'ipv4', limited: false, reachable: true, proxy: '' },
        { name: 'ipv6', limited: false, reachable: true, proxy: '' }
      ]
    }));

    // getblockhash
    this.handlers.set('getblockhash', (params: any[]) => {
      const height = params[0];
      return this.generateBlockHash(height);
    });

    // getblock
    this.handlers.set('getblock', (params: any[]) => {
      const hash = params[0];
      const verbosity = params[1] || 1;
      
      const block = this.state.blocks.get(hash) || {
        hash,
        height: this.state.height,
        time: Math.floor(Date.now() / 1000),
        tx: []
      };

      if (verbosity === 0) {
        return '01000000...'; // Serialized block
      }

      return {
        ...block,
        confirmations: this.state.height - block.height + 1,
        size: 1234,
        version: 4,
        merkleroot: '0'.repeat(64),
        nonce: '0'.repeat(64),
        bits: '1d00ffff'
      };
    });

    // sendrawtransaction
    this.handlers.set('sendrawtransaction', (params: any[]) => {
      const hexTx = params[0];
      const txid = this.generateTxid(hexTx);
      
      // Validate transaction format
      if (!hexTx || hexTx.length < 100) {
        throw { code: -26, message: 'Invalid transaction' };
      }

      // Add to mempool
      this.state.mempool.set(txid, {
        txid,
        hex: hexTx,
        confirmations: 0
      });

      return txid;
    });

    // getrawtransaction
    this.handlers.set('getrawtransaction', (params: any[]) => {
      const txid = params[0];
      const verbose = params[1] || false;

      // Check mempool
      const mempoolTx = this.state.mempool.get(txid);
      if (mempoolTx) {
        if (!verbose) return mempoolTx.hex;
        return {
          txid: mempoolTx.txid,
          confirmations: 0,
          size: mempoolTx.hex.length / 2,
          version: 4,
          locktime: 0
        };
      }

      throw { code: -5, message: 'Transaction not found' };
    });

    // gettransaction
    this.handlers.set('gettransaction', (params: any[]) => {
      const txid = params[0];
      
      const mempoolTx = this.state.mempool.get(txid);
      if (mempoolTx) {
        return {
          txid: mempoolTx.txid,
          confirmations: mempoolTx.confirmations,
          blockhash: mempoolTx.blockHash,
          blocktime: mempoolTx.blockTime,
          size: mempoolTx.hex.length / 2
        };
      }

      throw { code: -5, message: 'Transaction not found' };
    });

    // decoderawtransaction
    this.handlers.set('decoderawtransaction', (params: any[]) => {
      const hexTx = params[0];
      
      // Basic validation
      if (!hexTx || hexTx.length < 20) {
        throw { code: -22, message: 'TX decode failed' };
      }

      return {
        txid: this.generateTxid(hexTx),
        version: 4,
        size: hexTx.length / 2,
        locktime: 0,
        vin: [],
        vout: []
      };
    });

    // estimatefee
    this.handlers.set('estimatefee', (params: any[]) => {
      const blocks = params[0] || 6;
      return 0.00001 * (10 - Math.min(blocks, 9));
    });
  }

  /**
   * Handle a JSON-RPC request
   */
  handleRequest(request: { method: string; params: any[]; id: number }): any {
    const handler = this.handlers.get(request.method);
    
    if (!handler) {
      throw { code: -32601, message: `Method not found: ${request.method}` };
    }

    try {
      const result = handler(request.params || []);
      return { jsonrpc: '2.0', result, id: request.id };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        error: {
          code: error.code || -1,
          message: error.message || 'Unknown error'
        },
        id: request.id
      };
    }
  }

  /**
   * Simulate mining a block (confirms mempool transactions)
   */
  mineBlock(): string {
    this.state.height++;
    const blockHash = this.generateBlockHash(this.state.height);
    const blockTime = Math.floor(Date.now() / 1000);
    
    const txids: string[] = [];
    
    // Confirm mempool transactions
    for (const [txid, tx] of this.state.mempool) {
      tx.confirmations = 1;
      tx.blockHash = blockHash;
      tx.blockTime = blockTime;
      txids.push(txid);
    }
    
    // Create block
    this.state.blocks.set(blockHash, {
      hash: blockHash,
      height: this.state.height,
      time: blockTime,
      tx: txids
    });
    
    this.state.bestBlockHash = blockHash;
    
    return blockHash;
  }

  /**
   * Add a nullifier to the spent set
   */
  addSpentNullifier(nullifier: string): void {
    this.state.nullifiers.add(nullifier);
  }

  /**
   * Check if a nullifier has been spent
   */
  isNullifierSpent(nullifier: string): boolean {
    return this.state.nullifiers.has(nullifier);
  }

  /**
   * Get current state
   */
  getState(): MockBlockchainState {
    return { ...this.state };
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = {
      height: 1000000,
      chain: 'testnet',
      bestBlockHash: '0'.repeat(64),
      mempool: new Map(),
      blocks: new Map(),
      nullifiers: new Set()
    };
  }

  private generateBlockHash(height: number): string {
    // Deterministic hash based on height
    let hash = height.toString(16).padStart(8, '0');
    return hash.repeat(8);
  }

  private generateTxid(hexTx: string): string {
    // Simple hash of transaction
    let sum = 0;
    for (let i = 0; i < Math.min(hexTx.length, 64); i++) {
      sum += hexTx.charCodeAt(i);
    }
    return sum.toString(16).padStart(64, '0');
  }
}

/**
 * Create a mock RPC client that uses the mock server
 */
export function createMockRpcClient(server: MockRpcServer) {
  return {
    async sendRequest(method: string, params: any[] = []): Promise<any> {
      const response = server.handleRequest({
        method,
        params,
        id: Math.floor(Math.random() * 1000000)
      });
      
      if (response.error) {
        throw new Error(`RPC Error (${response.error.code}): ${response.error.message}`);
      }
      
      return response.result;
    },

    async getBlockchainInfo() {
      return this.sendRequest('getblockchaininfo');
    },

    async getNetworkInfo() {
      return this.sendRequest('getnetworkinfo');
    },

    async sendRawTransaction(hexTx: string) {
      return this.sendRequest('sendrawtransaction', [hexTx]);
    },

    async getRawTransaction(txid: string, verbose: boolean = false) {
      return this.sendRequest('getrawtransaction', [txid, verbose]);
    },

    async getTransaction(txid: string) {
      return this.sendRequest('gettransaction', [txid]);
    },

    async decodeRawTransaction(hexTx: string) {
      return this.sendRequest('decoderawtransaction', [hexTx]);
    },

    async validateTransaction(hexTx: string): Promise<boolean> {
      try {
        await this.decodeRawTransaction(hexTx);
        return true;
      } catch {
        return false;
      }
    },

    async estimateFee(blocks: number = 6) {
      return this.sendRequest('estimatefee', [blocks]);
    }
  };
}

export default MockRpcServer;
