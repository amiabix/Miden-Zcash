/**
 * Test script for NOWNodes Zcash RPC API
 * Tests API connectivity and balance fetching
 */

const API_KEY = '3322113a-88b6-49b5-af3d-41c5993f1c64';
const ENDPOINT = 'https://zec.nownodes.io';

// Test address (Zcash testnet transparent address)
const TEST_ADDRESS = 'tmRABe2E6KFyLkVp6Yj2HvfMj4iL56AWvFT';

async function testNOWNodes() {
  console.log('Testing NOWNodes Zcash RPC API...\n');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`API Key: ${API_KEY.substring(0, 8)}...`);
  console.log(`Test Address: ${TEST_ADDRESS}\n`);

  // Test 1: getmininginfo (from their example)
  console.log('Test 1: getmininginfo');
  try {
    const miningInfo = await makeRequest('getmininginfo', []);
    console.log('✅ Success!');
    console.log(`  Blocks: ${miningInfo.blocks}`);
    console.log(`  Chain: ${miningInfo.chain}`);
    console.log(`  Difficulty: ${miningInfo.difficulty}`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
    return;
  }

  console.log('\n');

  // Test 2: getblockcount
  console.log('Test 2: getblockcount');
  try {
    const blockCount = await makeRequest('getblockcount', []);
    console.log('✅ Success!');
    console.log(`  Block count: ${blockCount}`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  console.log('\n');

  // Test 3: getbalance (for address)
  console.log('Test 3: getreceivedbyaddress');
  try {
    const balance = await makeRequest('getreceivedbyaddress', [TEST_ADDRESS, 1]);
    console.log('✅ Success!');
    console.log(`  Balance: ${balance} ZEC`);
    console.log(`  Balance (zatoshi): ${balance * 100000000}`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
    console.log('  Trying listunspent as fallback...');
    
    try {
      const utxos = await makeRequest('listunspent', [1, 9999999, [TEST_ADDRESS]]);
      const total = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
      console.log('✅ Fallback success!');
      console.log(`  Balance: ${total} ZEC`);
      console.log(`  Balance (zatoshi): ${total * 100000000}`);
      console.log(`  UTXOs: ${utxos.length}`);
    } catch (fallbackError) {
      console.log('❌ Fallback also failed:', fallbackError.message);
    }
  }

  console.log('\n');

  // Test 4: getblockchaininfo
  console.log('Test 4: getblockchaininfo');
  try {
    const info = await makeRequest('getblockchaininfo', []);
    console.log('✅ Success!');
    console.log(`  Blocks: ${info.blocks}`);
    console.log(`  Headers: ${info.headers}`);
    console.log(`  Verification progress: ${(info.verificationprogress * 100).toFixed(2)}%`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }
}

async function makeRequest(method, params) {
  const request = {
    jsonrpc: '1.0',
    id: `test_${Date.now()}`,
    method: method,
    params: params
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

// Run the test
testNOWNodes().catch(console.error);

