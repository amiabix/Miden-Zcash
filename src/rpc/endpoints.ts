/**
 * Zcash RPC Endpoint Configuration
 * 
 * Pre-configured endpoints for easy switching between local and public nodes
 */

export interface EndpointInfo {
  url: string;
  credentials?: {
    username: string;
    password: string;
  };
  description: string;
  requiresAuth: boolean;
  rateLimit?: string;
}

/**
 * Public testnet endpoints (for development/testing)
 * 
 * These endpoints may have rate limits or downtime.
 * For production testing, run your own node.
 */
export const TESTNET_ENDPOINTS: Record<string, EndpointInfo> = {
  /**
   * Local node (recommended for development)
   * Requires: zcashd running locally
   * Setup: See RPC_ENDPOINTS.md
   */
  localhost: {
    url: 'http://localhost:18232',
    description: 'Local testnet node (requires zcashd)',
    requiresAuth: true,
    credentials: {
      username: 'your_username', // Set in ~/.zcash/zcash.conf
      password: 'your_password'  // Set in ~/.zcash/zcash.conf
    }
  },

  /**
   * Public testnet node (if available)
   * May require API key or have rate limits
   */
  public: {
    url: 'https://testnet.zcashrpc.com', // Example - verify this exists
    description: 'Public testnet node (may have rate limits)',
    requiresAuth: false,
    rateLimit: 'Unknown'
  },


  /**
   * FreeRPC.com Zcash endpoint
   * Free tier available, premium plans for higher rates
   * Check: https://freerpc.com/zcash
   */
  freerpc: {
    url: 'https://zcash-testnet.rpc.freerpc.com',
    description: 'FreeRPC testnet endpoint (may require API key)',
    requiresAuth: false,
    rateLimit: 'Varies by plan'
  },

  /**
   * Stardust Staking RPC
   * High-performance, low-latency infrastructure
   * Check: https://starduststaking.com/rpc
   */
  stardust: {
    url: 'https://zcash-testnet.rpc.starduststaking.com',
    description: 'Stardust Staking testnet endpoint',
    requiresAuth: false,
    rateLimit: 'Contact for details'
  },

  /**
   * Fastnode.io Zcash endpoint
   * Enterprise-grade, 99.99% uptime
   * Check: https://fastnode.io
   */
  fastnode: {
    url: 'https://zcash-testnet.rpc.fastnode.io',
    description: 'Fastnode testnet endpoint (may require API key)',
    requiresAuth: false,
    rateLimit: 'Custom SLA'
  },

  /**
   * RPC Fast endpoint
   * Ultra-fast, low-latency nodes
   * Check: https://rpcfast.com
   */
  rpcfast: {
    url: 'https://zcash-testnet.rpcfast.com',
    description: 'RPC Fast testnet endpoint',
    requiresAuth: false,
    rateLimit: 'High performance'
  }
};

/**
 * Mainnet endpoints
 * 
 * WARNING: Never use public mainnet endpoints in production!
 * Always use your own node or a trusted service.
 */
export const MAINNET_ENDPOINTS: Record<string, EndpointInfo> = {
  /**
   * Local mainnet node (required for production)
   */
  localhost: {
    url: 'http://localhost:8232',
    description: 'Local mainnet node (requires zcashd)',
    requiresAuth: true,
    credentials: {
      username: 'your_username',
      password: 'your_password'
    }
  }
};

/**
 * Get endpoint configuration for a network
 */
export function getEndpoint(
  network: 'mainnet' | 'testnet',
  endpointName: string = 'localhost'
): EndpointInfo {
  const endpoints = network === 'testnet' ? TESTNET_ENDPOINTS : MAINNET_ENDPOINTS;
  const endpoint = endpoints[endpointName];
  
  if (!endpoint) {
    throw new Error(
      `Unknown endpoint "${endpointName}" for ${network}. ` +
      `Available: ${Object.keys(endpoints).join(', ')}`
    );
  }
  
  return endpoint;
}

/**
 * Get all available endpoints for a network
 */
export function getAvailableEndpoints(network: 'mainnet' | 'testnet'): EndpointInfo[] {
  const endpoints = network === 'testnet' ? TESTNET_ENDPOINTS : MAINNET_ENDPOINTS;
  return Object.values(endpoints);
}

/**
 * Helper to create RPC config from endpoint name
 */
export function createRpcConfig(
  network: 'mainnet' | 'testnet',
  endpointName: string = 'localhost',
  customCredentials?: { username: string; password: string }
) {
  const endpoint = getEndpoint(network, endpointName);
  
  return {
    endpoint: endpoint.url,
    credentials: customCredentials || endpoint.credentials
  };
}

