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
    
    if (!endpoint) {
      return NextResponse.json(
        { error: { code: -32603, message: 'RPC endpoint not configured. Set ZCASH_RPC_ENDPOINT environment variable.' } },
        { status: 500 }
      );
    }
    
    // Determine JSON-RPC version based on endpoint
    const isNOWNodes = endpoint.includes('nownodes.io');
    const isTatum = endpoint.includes('tatum.io');
    // zcashd uses JSON-RPC 1.0
    const jsonrpc = isNOWNodes || endpoint.includes('127.0.0.1') || endpoint.includes('localhost') ? '1.0' : '2.0';
    const requestId = isNOWNodes ? `req_${Date.now()}_${Math.random()}` : id || Date.now();

    // Build request headers
    // zcashd uses JSON-RPC 1.0 and expects text/plain content type
    const headers: HeadersInit = {
      'Content-Type': jsonrpc === '1.0' ? 'text/plain;' : 'application/json',
      'Accept': 'application/json'
    };

    // Add authentication (only for non-Tatum endpoints)
    // For zcashd nodes, always use Basic Auth if credentials are provided
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
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(rpcRequest),
        // Add timeout
        signal: AbortSignal.timeout(30000) // 30 seconds
      });
    } catch (fetchError: any) {
      console.error('[RPC Proxy] Fetch error:', fetchError);
      const errorMsg = fetchError.message || String(fetchError);
      if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('connect')) {
        return NextResponse.json(
          { 
            error: { 
              code: -32001, 
              message: `Cannot connect to RPC endpoint ${endpoint}. Check if zcashd is running and SSH tunnel is active.` 
            } 
          },
          { status: 503 }
        );
      }
      throw fetchError;
    }

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
    
    // Check if RPC returned an error (even with HTTP 200)
    if (data.error) {
      // Return the RPC error directly (preserve original error structure)
      // The client will handle the error appropriately
      const rpcErrorCode = data.error.code || -32603;
      const errorMessage = data.error.message || 'RPC error';
      
      // Map RPC error codes to HTTP status codes
      let httpStatus = 500;
      if (rpcErrorCode === -28) {
        httpStatus = 503; // Service unavailable during reindex
      } else if (rpcErrorCode === -4) {
        httpStatus = 423; // Wallet locked
      } else if (rpcErrorCode === -32601) {
        httpStatus = 404; // Method not found
      } else if (rpcErrorCode >= -32768 && rpcErrorCode <= -32000) {
        httpStatus = 400; // JSON-RPC standard errors
      }
      
      return NextResponse.json(
        data, // Return the full RPC response including error
        { status: httpStatus }
      );
    }
    
    // Return successful RPC response
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Zcash RPC Proxy] Error:', error);
    console.error('[Zcash RPC Proxy] Endpoint:', RPC_ENDPOINT);
    console.error('[Zcash RPC Proxy] Has credentials:', !!(RPC_USER && RPC_PASSWORD));
    
    // Handle timeout
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: { code: -32000, message: 'Request timeout' } },
        { status: 504 }
      );
    }

    // Handle network errors
    if (error.message?.includes('fetch') || error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      return NextResponse.json(
        { 
          error: { 
            code: -32001, 
            message: `Network error: Unable to connect to RPC endpoint ${RPC_ENDPOINT || 'not configured'}. Check if the node is running and SSH tunnel is active.` 
          } 
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: { code: -32603, message: `Internal error: ${error.message || 'Unknown error'}` } },
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




