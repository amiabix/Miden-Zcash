/**
 * Zcash RPC Client
 * Handles communication with Zcash RPC nodes
 */

import type {
  RPCRequest,
  RPCResponse,
  UTXO
} from '../types/index';
import { hexToBytes } from '../utils/bytes';

export interface RPCConfig {
  endpoint: string;
  credentials?: {
    username: string;
    password: string;
  };
  /** API key for services that use header-based auth */
  apiKey?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  /** Use backend proxy instead of direct RPC calls (for production security) */
  useBackendProxy?: boolean;
  /** Backend proxy endpoint (defaults to /api/zcash/rpc) */
  backendProxyUrl?: string;
}

/**
 * Internal config with resolved defaults
 */
interface ResolvedConfig {
  endpoint: string;
  credentials?: { username: string; password: string };
  apiKey?: string;
  headers?: Record<string, string>;
  timeout: number;
  retries: number;
  retryDelay: number;
  useBackendProxy: boolean;
  backendProxyUrl: string;
}

/**
 * Zcash RPC Client
 */
export class ZcashRPCClient {
  private config: ResolvedConfig;
  private requestId: number = 0;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 20000; // Minimum 20 seconds between requests
  private rateLimitBackoff: number = 0; // Exponential backoff for rate limits

  constructor(config: RPCConfig) {
    this.config = {
      endpoint: config.endpoint,
      credentials: config.credentials,
      apiKey: config.apiKey,
      headers: config.headers,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      useBackendProxy: config.useBackendProxy ?? false,
      backendProxyUrl: config.backendProxyUrl ?? '/api/zcash/rpc'
    };
  }

  /**
   * Send RPC request
   */
  private async sendRequest(
    method: string,
    params: any[] = []
  ): Promise<any> {
    // NOWNodes uses JSON-RPC 1.0, others use 2.0
    const isNOWNodes = this.config.endpoint.includes('nownodes.io');
    const jsonrpcVersion = isNOWNodes ? '1.0' : '2.0';
    
    const request: RPCRequest = {
      jsonrpc: jsonrpcVersion as '1.0' | '2.0',
      id: isNOWNodes ? `req_${this.requestId++}` : this.requestId++,
      method,
      params
    };

    return this.executeRequest(request);
  }

  /**
   * Execute RPC request with retry logic and rate limiting
   */
  private async executeRequest(request: RPCRequest): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        // Rate limiting: ensure minimum interval between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const requiredWait = this.minRequestInterval + this.rateLimitBackoff;
        
        if (timeSinceLastRequest < requiredWait) {
          const waitTime = requiredWait - timeSinceLastRequest;
          await this.delay(waitTime);
        }

        const response = await this.makeRequest(request);
        this.lastRequestTime = Date.now();
        
        // Reset backoff on success (gradually)
        if (this.rateLimitBackoff > 0) {
          this.rateLimitBackoff = Math.max(0, this.rateLimitBackoff - 200);
        }
        
        if (response.error) {
          const rpcError = new ZcashRPCError(
            response.error.code,
            response.error.message,
            response.error.data
          );
          // Preserve the original error message for method not found detection
          (rpcError as any).originalMessage = response.error.message;
          throw rpcError;
        }

        return response.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Handle HTTP 429 errors (rate limiting)
        const isRateLimit = 
          (error instanceof ZcashRPCError && error.code === 429) ||
          (error instanceof Error && (error.message.includes('429') || error.message.includes('Rate limit')));
        
        if (isRateLimit) {
          // Exponential backoff for rate limits (up to 10 seconds)
          this.rateLimitBackoff = Math.min(10000, (this.rateLimitBackoff || 1000) * 2);
          
          // Don't retry immediately on 429 - wait with backoff
          if (attempt < this.config.retries) {
            await this.delay(this.rateLimitBackoff);
            continue; // Retry after backoff
          } else {
            throw new ZcashRPCError(
              429,
              `Rate limit exceeded after retries. Please wait ${Math.ceil(this.rateLimitBackoff / 1000)}s or use a different endpoint.`,
              null
            );
          }
        }
        
        // Don't retry on certain errors
        if (error instanceof ZcashRPCError && (error.code === -32602 || error.code === -32601)) {
          throw error; // Invalid params or method not found - don't retry
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.retries) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Make HTTP request to RPC endpoint
   * Uses backend proxy if configured, otherwise makes direct RPC call
   */
  private async makeRequest(request: RPCRequest): Promise<RPCResponse> {
    if (this.config.useBackendProxy) {
      return this.makeBackendProxyRequest(request);
    }

    // Direct RPC call (development mode or when proxy not available)
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add basic auth if credentials provided
    if (this.config.credentials) {
      const auth = btoa(
        `${this.config.credentials.username}:${this.config.credentials.password}`
      );
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Add API key header if provided
    // NOWNodes uses 'api-key', others use 'x-api-key'
    if (this.config.apiKey) {
      const isNOWNodes = this.config.endpoint.includes('nownodes.io');
      headers[isNOWNodes ? 'api-key' : 'x-api-key'] = this.config.apiKey;
    }

    // Add any custom headers
    if (this.config.headers) {
      Object.entries(this.config.headers).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          throw new Error(`HTTP 429: Rate limit exceeded. Too many requests.`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        // Handle fetch network errors (CORS, connection refused, etc.)
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('Load failed') ||
            error.message.includes('NetworkError') ||
            error.message.includes('Network request failed')) {
          throw new Error(
            `Cannot connect to Zcash RPC endpoint (${this.config.endpoint}). ` +
            `Please ensure the RPC server is running and accessible. ` +
            `If using a local node, make sure it's running on the specified port.`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Make request through backend proxy (for production security)
   * This prevents exposing RPC credentials to the frontend
   */
  private async makeBackendProxyRequest(request: RPCRequest): Promise<RPCResponse> {
    const proxyUrl = this.config.backendProxyUrl || '/api/zcash/rpc';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          throw new Error(`HTTP 429: Rate limit exceeded. Too many requests.`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Validate response format
      if (result.error) {
        throw new ZcashRPCError(
          result.error.code || -1,
          result.error.message || 'Unknown RPC error',
          result.error.data
        );
      }
      
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        // Handle fetch network errors
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('Load failed') ||
            error.message.includes('NetworkError') ||
            error.message.includes('Network request failed')) {
          throw new Error(
            `Cannot connect to backend proxy (${proxyUrl}). ` +
            `Please ensure the proxy server is running and accessible.`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get block count
   */
  async getBlockCount(): Promise<number> {
    return this.sendRequest('getblockcount');
  }

  /**
   * Get blockchain info (includes sync status)
   */
  async getBlockchainInfo(): Promise<{
    chain: string;
    blocks: number;
    headers: number;
    bestblockhash: string;
    difficulty: number;
    verificationprogress: number;
    chainwork: string;
    pruned: boolean;
    initialblockdownload?: boolean;
    commitments?: {
      finalRoot?: string;
      finalState?: string;
    };
  }> {
    return this.sendRequest('getblockchaininfo');
  }

  /**
   * Get commitment tree state (anchor/root)
   * Returns the current Sapling commitment tree root
   */
  async getCommitmentTreeState(): Promise<{
    root: string;
    height: number;
  } | null> {
    try {
      // Try to get from getblockchaininfo first (if available)
      const info = await this.getBlockchainInfo();
      if ((info as any).commitments?.finalRoot) {
        return {
          root: (info as any).commitments.finalRoot,
          height: info.blocks
        };
      }
      
      // Fallback: Get from best block's commitment tree
      // This requires getting the block and extracting the commitment tree root
      // For now, return null and let the caller handle it
      return null;
    } catch (error) {
      // RPC may not support this method
      return null;
    }
  }

  /**
   * Get block by hash
   */
  async getBlock(hash: string, verbosity: number = 1): Promise<any> {
    return this.sendRequest('getblock', [hash, verbosity]);
  }

  /**
   * Get block hash by height
   */
  async getBlockHash(height: number): Promise<string> {
    return this.sendRequest('getblockhash', [height]);
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(txHash: string, verbose: boolean = true): Promise<any> {
    return this.sendRequest('gettransaction', [txHash, verbose]);
  }

  /**
   * Get raw transaction
   */
  async getRawTransaction(txHash: string, verbose: boolean = false): Promise<string | any> {
    return this.sendRequest('getrawtransaction', [txHash, verbose]);
  }

  /**
   * Send raw transaction
   */
  async sendRawTransaction(txHex: string, allowHighFees: boolean = false): Promise<string> {
    return this.sendRequest('sendrawtransaction', [txHex, allowHighFees]);
  }

  /**
   * Get balance for transparent address
   * 
   * Tries getreceivedbyaddress first, falls back to calculating from listunspent
   * If both fail, returns 0 (allows wallet to work in limited RPC mode)
   */
  async getBalance(address: string, minconf: number = 1): Promise<number> {
    try {
      // Try standard method first
      return await this.sendRequest('getreceivedbyaddress', [address, minconf]);
    } catch (error: any) {
      const errorMessage = error?.message || (error as any)?.originalMessage || String(error || '');
      const errorCode = error?.code || (error as any)?.code;
      
      // If rate limited, throw to trigger backoff
      if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
        throw error;
      }
      
      // Check if method not supported
      const isMethodNotFound = 
        errorCode === -16405 || 
        errorCode === -32601 || // Standard JSON-RPC "Method not found" code
        errorMessage.includes('Method not found') ||
        errorMessage.includes('method not found') ||
        errorMessage.includes('getreceivedbyaddress') ||
        errorMessage.includes('not found');
      
      // Try fallback with listunspent
      if (isMethodNotFound) {
        try {
          // Fallback: calculate from UTXOs
          const utxos = await this.listUnspent(minconf, 9999999, [address]);
          return utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
        } catch (utxoError: any) {
          // If listunspent also fails, check if it's a rate limit or method not found
          const utxoErrorMessage = utxoError?.message || String(utxoError || '');
          const utxoErrorCode = utxoError?.code || (utxoError as any)?.code;
          
          // If rate limited, throw to trigger backoff
          if (utxoErrorCode === 429 || utxoErrorMessage.includes('429') || utxoErrorMessage.includes('Rate limit')) {
            throw utxoError; // Re-throw to trigger rate limit handling
          }
          
          // If method not found, this endpoint doesn't support balance queries
          const isMethodNotFound = 
            utxoErrorCode === -16405 || 
            utxoErrorCode === -32601 ||
            utxoErrorMessage.includes('Method not found') ||
            utxoErrorMessage.includes('method not found');
          
          if (isMethodNotFound) {
            // RPC endpoint does not support balance query methods
            // Return 0 to allow wallet to work in limited mode
            return 0;
          }
          
          // For other errors, re-throw
          throw utxoError;
        }
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get network info
   */
  async getNetworkInfo(): Promise<any> {
    return this.sendRequest('getnetworkinfo');
  }

  /**
   * Get info
   */
  async getInfo(): Promise<any> {
    return this.sendRequest('getinfo');
  }

  /**
   * Import address into wallet
   * This is required for local zcashd nodes to discover UTXOs via listunspent
   * 
   * Parameters:
   * - address: Address to import
   * - label: Optional label (default: '')
   * - rescan: Whether to rescan blockchain (default: false)
   * - watchonly: Whether to import as watch-only (default: true)
   */
  async importAddress(
    address: string,
    label: string = '',
    rescan: boolean = false,
    watchonly: boolean = true
  ): Promise<void> {
    try {
      // Try with watchonly parameter (zcashd format)
      await this.sendRequest('importaddress', [address, label, rescan, watchonly]);
      console.log(`[RPC Client] Successfully imported address ${address.substring(0, 20)}...`);
    } catch (error: any) {
      const errorMsg = error?.message || String(error || '');
      // If address is already imported, that's fine - ignore the error
      if (errorMsg.includes('already in wallet') || 
          errorMsg.includes('already exists') ||
          errorMsg.includes('already have') ||
          errorMsg.includes('duplicate')) {
        console.log(`[RPC Client] Address ${address.substring(0, 20)}... already imported`);
        return;
      }
      // Try without watchonly parameter (some versions)
      try {
        await this.sendRequest('importaddress', [address, label, rescan]);
        console.log(`[RPC Client] Successfully imported address ${address.substring(0, 20)}... (without watchonly)`);
      } catch (retryError: any) {
        const retryErrorMsg = retryError?.message || String(retryError || '');
        if (retryErrorMsg.includes('already in wallet') || 
            retryErrorMsg.includes('already exists') ||
            retryErrorMsg.includes('already have') ||
            retryErrorMsg.includes('duplicate')) {
          console.log(`[RPC Client] Address ${address.substring(0, 20)}... already imported`);
          return;
        }
        // Re-throw the original error
        throw error;
      }
    }
  }

  /**
   * List unspent outputs (UTXOs)
   * 
   * Note: zcashd returns amounts in ZEC, we convert to zatoshi (1 ZEC = 100,000,000 zatoshi)
   */
  async listUnspent(
    minconf: number = 1,
    maxconf: number = 9999999,
    addresses: string[] = []
  ): Promise<UTXO[]> {
    const result = await this.sendRequest('listunspent', [minconf, maxconf, addresses]);
    
    // Convert amounts from ZEC to zatoshi
    // zcashd returns amounts as decimal ZEC (e.g., 0.3), we need zatoshi (e.g., 30000000)
    const converted = result.map((utxo: any) => {
      const amountZEC = utxo.amount;
      const amountZatoshi = Math.round(amountZEC * 100000000);
      
      if (amountZEC < 1 && amountZatoshi === 0 && amountZEC > 0) {
        console.warn(`[RPC Client] Small UTXO amount detected: ${amountZEC} ZEC = ${amountZatoshi} zatoshi (may be rounded to 0)`);
      }
      
      return {
        ...utxo,
        amount: amountZatoshi
      };
    });
    
    if (converted.length > 0) {
      const totalZEC = result.reduce((sum: number, utxo: any) => sum + utxo.amount, 0);
      const totalZatoshi = converted.reduce((sum: number, utxo: any) => sum + utxo.amount, 0);
      console.log(`[RPC Client] Converted ${converted.length} UTXO(s): ${totalZEC} ZEC = ${totalZatoshi} zatoshi`);
    }
    
    return converted;
  }

  /**
   * Get received by address
   */
  async getReceivedByAddress(
    address: string,
    minconf: number = 1
  ): Promise<number> {
    return this.sendRequest('getreceivedbyaddress', [address, minconf]);
  }

  /**
   * Ping (test connection)
   */
  async ping(): Promise<void> {
    try {
      await this.getBlockCount();
    } catch (error) {
      throw new Error('RPC connection failed');
    }
  }

  /**
   * Get shielded balance (z_getbalance)
   */
  async zGetBalance(address: string, minconf: number = 1): Promise<number> {
    return this.sendRequest('z_getbalance', [address, minconf]);
  }

  /**
   * List received by shielded address
   */
  async zListReceivedByAddress(
    address: string,
    minconf: number = 1
  ): Promise<any[]> {
    return this.sendRequest('z_listreceivedbyaddress', [address, minconf]);
  }

  /**
   * Get commitment tree state (for Lightwalletd or zcashd)
   * 
   * This method tries multiple RPC approaches:
   * 1. z_gettreestate (Lightwalletd)
   * 2. getblockchaininfo (zcashd with commitments)
   * 3. getblock with commitment tree info
   */
  async getTreeState(blockHeight?: number): Promise<{
    root: Uint8Array;
    height: number;
    size?: number;
  } | null> {
    try {
      // Try Lightwalletd z_gettreestate first
      try {
        const result = await this.sendRequest('z_gettreestate', blockHeight ? [blockHeight] : []);
        if (result && result.trees && result.trees.sapling) {
          const rootHex = result.trees.sapling.root;
          return {
            root: hexToBytes(rootHex),
            height: result.height || blockHeight || 0,
            size: result.trees.sapling.size
          };
        }
      } catch {
        // z_gettreestate not available, try next method
      }

      // Try getblockchaininfo (some zcashd versions)
      try {
        const info = await this.getBlockchainInfo();
        if ((info as any).commitments?.finalRoot) {
          const rootHex = (info as any).commitments.finalRoot;
          return {
            root: hexToBytes(rootHex),
            height: info.blocks || 0
          };
        }
      } catch {
        // Not available
      }

      // Try getblock with commitment tree
      if (blockHeight !== undefined) {
        try {
          const block = await this.getBlock(await this.getBlockHash(blockHeight), 2);
          if (block && block.saplingCommitmentTreeRoot) {
            return {
              root: hexToBytes(block.saplingCommitmentTreeRoot),
              height: blockHeight
            };
          }
        } catch {
          // Not available
        }
      }

      return null;
    } catch {
      return null;
    }
  }

}

/**
 * RPC Error class
 */
export class ZcashRPCError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ZcashRPCError';
  }
}


