/**
 * Zcash UTXO Proxy API Route
 * 
 * Fetches UTXOs from block explorer APIs when RPC listunspent is unavailable.
 * This is a workaround for nodes that are reindexing or RPC endpoints that don't support listunspent.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/zcash/utxos
 * 
 * Fetches UTXOs for a transparent address from block explorer APIs
 * 
 * Query params:
 * - address: Zcash transparent address to query
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

    // Try CipherScan API first (may have transaction data)
    const cipherscanBaseUrl = network === 'testnet' 
      ? 'https://testnet.cipherscan.app' 
      : 'https://cipherscan.app';
    
    try {
      const cipherscanUrl = `${cipherscanBaseUrl}/api/address/${address}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(cipherscanUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        
        // CipherScan may have transaction data - try to extract UTXOs
        // If CipherScan doesn't provide UTXO data, we'll need another source
        // For now, return empty array and let the client handle it
        // TODO: Parse CipherScan response for UTXO data if available
        
        // Return empty array for now - this is a placeholder
        // The actual implementation would parse the CipherScan response
        return NextResponse.json({
          utxos: [],
          source: 'cipherscan',
          note: 'CipherScan API does not provide UTXO data. Use a full node or manual UTXO entry for testing.'
        });
      }
    } catch (cipherscanError) {
      // CipherScan failed, continue to next method
      console.warn('[UTXO Proxy] CipherScan failed:', cipherscanError);
    }

    // If CipherScan doesn't work, return error suggesting manual entry
    return NextResponse.json(
      { 
        error: 'UTXO data not available from block explorer APIs',
        utxos: [],
        note: 'For testing during node reindexing, you can manually add UTXOs to the cache using the developer console.'
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error('[UTXO Proxy] Error:', error);
    
    return NextResponse.json(
      { 
        error: `Failed to fetch UTXOs: ${error.message || 'Unknown error'}`,
        utxos: []
      },
      { status: 500 }
    );
  }
}
