/**
 * Debug endpoint for Zcash RPC operations
 * Helps diagnose UTXO and address issues
 */

import { NextRequest, NextResponse } from 'next/server';

const RPC_ENDPOINT = process.env.ZCASH_RPC_ENDPOINT;
const RPC_USER = process.env.ZCASH_RPC_USER;
const RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    if (!RPC_ENDPOINT) {
      return NextResponse.json(
        { error: 'RPC endpoint not configured' },
        { status: 500 }
      );
    }

    const results: any = {
      address,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Build auth header
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (RPC_USER && RPC_PASSWORD) {
      const auth = Buffer.from(`${RPC_USER}:${RPC_PASSWORD}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Check 1: Get address info
    try {
      const addressInfoRequest = {
        jsonrpc: '1.0',
        method: 'getaddressinfo',
        params: [address],
        id: Date.now()
      };

      const addressInfoResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(addressInfoRequest)
      });

      const addressInfoData = await addressInfoResponse.json();
      results.checks.addressInfo = addressInfoData.result || addressInfoData.error;
    } catch (error: any) {
      results.checks.addressInfo = { error: error.message };
    }

    // Check 2: List all addresses in wallet
    try {
      const addressesRequest = {
        jsonrpc: '1.0',
        method: 'getaddressesbyaccount',
        params: [''],
        id: Date.now() + 1
      };

      const addressesResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(addressesRequest)
      });

      const addressesData = await addressesResponse.json();
      const walletAddresses = addressesData.result || [];
      results.checks.walletAddresses = {
        count: Array.isArray(walletAddresses) ? walletAddresses.length : 0,
        addresses: Array.isArray(walletAddresses) ? walletAddresses : [],
        isInWallet: Array.isArray(walletAddresses) ? walletAddresses.includes(address) : false
      };
    } catch (error: any) {
      results.checks.walletAddresses = { error: error.message };
    }

    // Check 3: Get UTXOs for the address
    try {
      const listUnspentRequest = {
        jsonrpc: '1.0',
        method: 'listunspent',
        params: [0, 9999999, [address]],
        id: Date.now() + 2
      };

      const listUnspentResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(listUnspentRequest)
      });

      const listUnspentData = await listUnspentResponse.json();
      const utxos = listUnspentData.result || [];
      results.checks.utxos = {
        count: Array.isArray(utxos) ? utxos.length : 0,
        utxos: Array.isArray(utxos) ? utxos : [],
        totalAmount: Array.isArray(utxos) 
          ? utxos.reduce((sum: number, utxo: any) => sum + (utxo.amount || 0), 0)
          : 0
      };
    } catch (error: any) {
      results.checks.utxos = { error: error.message };
    }

    // Check 4: Get received by address (balance check)
    try {
      const getReceivedRequest = {
        jsonrpc: '1.0',
        method: 'getreceivedbyaddress',
        params: [address, 0],
        id: Date.now() + 3
      };

      const getReceivedResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(getReceivedRequest)
      });

      const getReceivedData = await getReceivedResponse.json();
      results.checks.receivedAmount = getReceivedData.result || getReceivedData.error;
    } catch (error: any) {
      results.checks.receivedAmount = { error: error.message };
    }

    // Check 5: Get block count
    try {
      const blockCountRequest = {
        jsonrpc: '1.0',
        method: 'getblockcount',
        params: [],
        id: Date.now() + 4
      };

      const blockCountResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(blockCountRequest)
      });

      const blockCountData = await blockCountResponse.json();
      results.checks.blockCount = blockCountData.result || blockCountData.error;
    } catch (error: any) {
      results.checks.blockCount = { error: error.message };
    }

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('[Debug Endpoint] Error:', error);
    return NextResponse.json(
      { error: `Debug check failed: ${error.message || String(error)}` },
      { status: 500 }
    );
  }
}
