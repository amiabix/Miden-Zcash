/**
 * Zcash Balance Proxy API Route
 * 
 * Proxies balance requests to CipherScan API to avoid CORS issues.
 * This allows the frontend to fetch balances without browser CORS restrictions.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/zcash/balance
 * 
 * Proxies balance request to CipherScan API
 * 
 * Query params:
 * - address: Zcash address to query
 * - network: 'testnet' or 'mainnet' (default: 'testnet')
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    const network = searchParams.get('network') || 'testnet';

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    // Determine CipherScan base URL based on network
    const cipherscanBaseUrl = network === 'testnet' 
      ? 'https://testnet.cipherscan.app' 
      : 'https://cipherscan.app';
    
    const cipherscanUrl = `${cipherscanBaseUrl}/api/address/${address}`;

    // Fetch from CipherScan API with timeout
    // Add cache-busting to ensure fresh data
    const cacheBustUrl = `${cipherscanUrl}${cipherscanUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(cacheBustUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          { 
            error: `CipherScan API returned ${response.status}: ${response.statusText}` 
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      // Return the balance data
      return NextResponse.json(data);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' },
          { status: 504 }
        );
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[Zcash Balance Proxy] Error:', error);
    
    return NextResponse.json(
      { 
        error: `Failed to fetch balance: ${error.message || 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}
