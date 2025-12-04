/**
 * Zcash RPC Proxy API Route
 * 
 * This route proxies RPC requests to Zcash nodes, keeping API keys server-side.
 * This prevents API keys from being exposed in the browser bundle.
 * 
 * SECURITY: API keys are read from server-side environment variables only.
 */

import { NextRequest, NextResponse } from 'next/server';

// Server-side only environment variables (no NEXT_PUBLIC_ prefix)
// SECURITY: Never hardcode credentials. Always use environment variables.
const RPC_ENDPOINT = process.env.ZCASH_RPC_ENDPOINT;
const RPC_API_KEY = process.env.ZCASH_RPC_API_KEY;
const RPC_USER = process.env.ZCASH_RPC_USER;
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD;

if (!RPC_ENDPOINT) {
  console.warn('[RPC Proxy] ZCASH_RPC_ENDPOINT not set. RPC calls will fail.');
}

/**
 * POST /api/zcash/rpc
 * 
 * Proxies RPC requests to Zcash node
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { method, params = [], id } = body;

    if (!method) {
      return NextResponse.json(
        { error: { code: -32600, message: 'Invalid Request: method is required' } },
        { status: 400 }
      );
    }

    // Get RPC endpoint (use configured or default)
    const endpoint = RPC_ENDPOINT;
    
    // Determine JSON-RPC version based on endpoint
    const isNOWNodes = endpoint.includes('nownodes.io');
    const isTatum = endpoint.includes('tatum.io');
    const jsonrpc = isNOWNodes ? '1.0' : '2.0';
    const requestId = isNOWNodes ? `req_${Date.now()}_${Math.random()}` : id || Date.now();

    // Build request headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Add authentication (only for non-Tatum endpoints)
    if (!isTatum && RPC_USER && RPC_PASSWORD) {
      const auth = Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Add API key header (NOWNodes uses 'api-key', Tatum and others use 'x-api-key')
    if (RPC_API_KEY) {
      headers[isNOWNodes ? 'api-key' : 'x-api-key'] = RPC_API_KEY;
    }

    // Build RPC request
    const rpcRequest: any = {
      jsonrpc,
      method,
      params,
      id: requestId
    };

    // Debug: Log request for Tatum endpoints
    if (isTatum) {
      console.log('[RPC Proxy] Tatum request:', {
        endpoint,
        method,
        hasApiKey: !!RPC_API_KEY,
        requestBody: JSON.stringify(rpcRequest)
      });
    }

    // Make request to Zcash node
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcRequest),
      // Add timeout
      signal: AbortSignal.timeout(30000) // 30 seconds
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          error: { 
            code: response.status, 
            message: `RPC request failed: ${response.statusText}`,
            data: errorText
          } 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return RPC response
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Zcash RPC Proxy] Error:', error);
    
    // Handle timeout
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: { code: -32000, message: 'Request timeout' } },
        { status: 504 }
      );
    }

    // Handle network errors
    if (error.message?.includes('fetch')) {
      return NextResponse.json(
        { error: { code: -32001, message: 'Network error: Unable to connect to RPC endpoint' } },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: { code: -32603, message: `Internal error: ${error.message}` } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/zcash/rpc
 * 
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: RPC_ENDPOINT ? 'configured' : 'using default',
    hasApiKey: !!RPC_API_KEY,
    hasCredentials: !!(RPC_USER && RPC_PASSWORD)
  });
}




