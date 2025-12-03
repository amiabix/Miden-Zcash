/**
 * Connection Manager
 * Handles RPC connection management, failover, and health monitoring
 */

import type { RPCRequest, RPCResponse } from '../types/index';

/**
 * Endpoint configuration
 */
export interface EndpointConfig {
  url: string;
  priority: number;
  credentials?: {
    username: string;
    password: string;
  };
  timeout?: number;
}

/**
 * Connection manager configuration
 */
export interface ConnectionManagerConfig {
  endpoints: EndpointConfig[];
  maxRetries: number;
  retryDelayMs: number;
  healthCheckIntervalMs: number;
  requestTimeoutMs: number;
}

/**
 * Endpoint health status
 */
interface EndpointHealth {
  endpoint: EndpointConfig;
  healthy: boolean;
  lastCheck: number;
  lastError?: string;
  latency?: number;
  consecutiveFailures: number;
}

/**
 * Request statistics
 */
interface RequestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
}

/**
 * Connection Manager
 * 
 * Provides reliable RPC communication with:
 * - Multiple endpoint support with priority-based selection
 * - Automatic failover on connection failures
 * - Health monitoring and circuit breaking
 * - Request retry with exponential backoff
 */
export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private endpoints: EndpointHealth[];
  private requestId: number = 0;
  private stats: Map<string, RequestStats> = new Map();
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(config: Partial<ConnectionManagerConfig> & { endpoints: EndpointConfig[] }) {
    this.config = {
      endpoints: config.endpoints,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000,
      requestTimeoutMs: config.requestTimeoutMs ?? 30000
    };

    // Initialize endpoint health tracking
    this.endpoints = this.config.endpoints
      .sort((a, b) => a.priority - b.priority)
      .map(endpoint => ({
        endpoint,
        healthy: true, // Assume healthy until proven otherwise
        lastCheck: 0,
        consecutiveFailures: 0
      }));

    // Initialize stats
    for (const ep of this.endpoints) {
      this.stats.set(ep.endpoint.url, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0
      });
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckIntervalMs
    );

    // Perform initial health check
    this.performHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Send RPC request with automatic failover
   */
  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params
    };

    let lastError: Error | null = null;

    // Try each healthy endpoint
    for (const endpointHealth of this.getHealthyEndpoints()) {
      try {
        const result = await this.sendRequest<T>(endpointHealth, request);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.handleEndpointFailure(endpointHealth, lastError);
      }
    }

    // All endpoints failed
    throw new Error(
      `All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Send request to specific endpoint with retries
   */
  private async sendRequest<T>(
    endpointHealth: EndpointHealth,
    request: RPCRequest
  ): Promise<T> {
    const { endpoint } = endpointHealth;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.makeHttpRequest(endpoint, request);
        const latency = Date.now() - startTime;

        // Update stats
        this.updateStats(endpoint.url, true, latency);

        // Update health
        endpointHealth.healthy = true;
        endpointHealth.lastCheck = Date.now();
        endpointHealth.latency = latency;
        endpointHealth.consecutiveFailures = 0;

        if (response.error) {
          throw new RPCError(
            response.error.code,
            response.error.message,
            response.error.data
          );
        }

        return response.result as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on RPC errors (only network errors)
        if (error instanceof RPCError) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // Update failure stats
    this.updateStats(endpoint.url, false);
    throw lastError || new Error('Request failed');
  }

  /**
   * Make HTTP request to endpoint
   */
  private async makeHttpRequest(
    endpoint: EndpointConfig,
    request: RPCRequest
  ): Promise<RPCResponse> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    // Add basic auth if credentials provided
    if (endpoint.credentials) {
      const auth = btoa(
        `${endpoint.credentials.username}:${endpoint.credentials.password}`
      );
      headers['Authorization'] = `Basic ${auth}`;
    }

    const controller = new AbortController();
    const timeout = endpoint.timeout || this.config.requestTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Get list of healthy endpoints, sorted by priority
   */
  private getHealthyEndpoints(): EndpointHealth[] {
    return this.endpoints
      .filter(ep => ep.healthy || this.shouldRetryEndpoint(ep))
      .sort((a, b) => {
        // Prioritize by health first, then priority
        if (a.healthy !== b.healthy) {
          return a.healthy ? -1 : 1;
        }
        return a.endpoint.priority - b.endpoint.priority;
      });
  }

  /**
   * Check if we should retry a failed endpoint
   */
  private shouldRetryEndpoint(endpoint: EndpointHealth): boolean {
    // Retry if enough time has passed since last check
    const timeSinceCheck = Date.now() - endpoint.lastCheck;
    const backoffTime = this.config.retryDelayMs * Math.pow(2, endpoint.consecutiveFailures);
    return timeSinceCheck > backoffTime;
  }

  /**
   * Handle endpoint failure
   */
  private handleEndpointFailure(
    endpointHealth: EndpointHealth,
    error: Error
  ): void {
    endpointHealth.consecutiveFailures++;
    endpointHealth.lastCheck = Date.now();
    endpointHealth.lastError = error.message;

    // Mark as unhealthy after 3 consecutive failures
    if (endpointHealth.consecutiveFailures >= 3) {
      endpointHealth.healthy = false;
    }
  }

  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    const checks = this.endpoints.map(async (ep) => {
      try {
        const startTime = Date.now();
        const response = await this.makeHttpRequest(ep.endpoint, {
          jsonrpc: '2.0',
          id: 'health-check',
          method: 'getblockcount',
          params: []
        });
        const latency = Date.now() - startTime;

        ep.healthy = !response.error;
        ep.lastCheck = Date.now();
        ep.latency = latency;
        if (ep.healthy) {
          ep.consecutiveFailures = 0;
          ep.lastError = undefined;
        }
      } catch (error) {
        ep.healthy = false;
        ep.lastCheck = Date.now();
        ep.consecutiveFailures++;
        ep.lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    });

    await Promise.allSettled(checks);
  }

  /**
   * Update request statistics
   */
  private updateStats(url: string, success: boolean, latency?: number): void {
    const stats = this.stats.get(url);
    if (!stats) return;

    stats.totalRequests++;
    if (success) {
      stats.successfulRequests++;
      if (latency !== undefined) {
        // Running average
        stats.averageLatency = (
          (stats.averageLatency * (stats.successfulRequests - 1) + latency) /
          stats.successfulRequests
        );
      }
    } else {
      stats.failedRequests++;
    }
  }

  /**
   * Get current endpoint health status
   */
  getEndpointHealth(): Array<{
    url: string;
    healthy: boolean;
    latency?: number;
    lastError?: string;
  }> {
    return this.endpoints.map(ep => ({
      url: ep.endpoint.url,
      healthy: ep.healthy,
      latency: ep.latency,
      lastError: ep.lastError
    }));
  }

  /**
   * Get request statistics
   */
  getStats(): Map<string, RequestStats> {
    return new Map(this.stats);
  }

  /**
   * Add a new endpoint
   */
  addEndpoint(endpoint: EndpointConfig): void {
    const health: EndpointHealth = {
      endpoint,
      healthy: true,
      lastCheck: 0,
      consecutiveFailures: 0
    };

    this.endpoints.push(health);
    this.endpoints.sort((a, b) => a.endpoint.priority - b.endpoint.priority);

    this.stats.set(endpoint.url, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0
    });
  }

  /**
   * Remove an endpoint
   */
  removeEndpoint(url: string): boolean {
    const index = this.endpoints.findIndex(ep => ep.endpoint.url === url);
    if (index === -1) return false;

    this.endpoints.splice(index, 1);
    this.stats.delete(url);
    return true;
  }

  /**
   * Force mark endpoint as unhealthy
   */
  markUnhealthy(url: string): void {
    const endpoint = this.endpoints.find(ep => ep.endpoint.url === url);
    if (endpoint) {
      endpoint.healthy = false;
      endpoint.lastCheck = Date.now();
    }
  }

  /**
   * Force mark endpoint as healthy
   */
  markHealthy(url: string): void {
    const endpoint = this.endpoints.find(ep => ep.endpoint.url === url);
    if (endpoint) {
      endpoint.healthy = true;
      endpoint.consecutiveFailures = 0;
      endpoint.lastError = undefined;
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * RPC Error class
 */
export class RPCError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'RPCError';
  }
}

