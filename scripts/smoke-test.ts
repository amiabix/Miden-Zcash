#!/usr/bin/env npx ts-node --esm

/**
 * Smoke Test Script
 * 
 * Quick validation that the core shielded transaction functionality works.
 * Run with: npx ts-node --esm scripts/smoke-test.ts
 */

import {
  ShieldedTransactionBuilder,
  ZcashProver,
  ShieldedSigner,
  NoteCache,
  getProverStatus,
  resetGroth16Integration,
  encodeZcashAddress,
  parseZcashAddress,
  validateSpendProofInputs,
  validateOutputProofInputs
} from '../src/shielded/index.js';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function fail(message: string): void {
  log(`✗ ${message}`, colors.red);
}

function info(message: string): void {
  log(`ℹ ${message}`, colors.blue);
}

function header(message: string): void {
  console.log();
  log(`${colors.bold}━━━ ${message} ━━━${colors.reset}`);
}

// Test data generators
function generateTestSpendingKey() {
  const ask = new Uint8Array(32);
  const nsk = new Uint8Array(32);
  const ovk = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    ask[i] = (i * 7 + 13) % 256;
    nsk[i] = (i * 11 + 17) % 256;
    ovk[i] = (i * 13 + 19) % 256;
  }
  return { ask, nsk, ovk };
}

function generateTestNote(value: number = 100000) {
  const diversifier = new Uint8Array(11).fill(0x42);
  const pkD = new Uint8Array(32).fill(0x33);
  const rcm = new Uint8Array(32);
  const nullifier = new Uint8Array(32);
  const cmu = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    rcm[i] = (i * 23 + 5) % 256;
    nullifier[i] = (i * 29 + 7) % 256;
    cmu[i] = (i * 31 + 11) % 256;
  }
  return {
    value,
    diversifier,
    pkD,
    rcm,
    nullifier,
    cmu,
    memo: new Uint8Array(512),
    position: 0,
    spent: false
  };
}

function generateTestMerkleWitness() {
  const authPath: Uint8Array[] = [];
  for (let i = 0; i < 32; i++) {
    const node = new Uint8Array(32);
    for (let j = 0; j < 32; j++) {
      node[j] = (i * j + 1) % 256;
    }
    authPath.push(node);
  }
  return { authPath, position: 0 };
}

function generateTestAddress(): string {
  const diversifier = new Uint8Array(11).fill(0x55);
  const pkD = new Uint8Array(32).fill(0xAA);
  return encodeZcashAddress('ztestsapling', diversifier, pkD);
}

async function runSmokeTests(): Promise<boolean> {
  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  header('Smoke Test Suite');
  info(`Starting at ${new Date().toISOString()}`);

  try {
    // Test 1: Address encoding/decoding
    header('Test 1: Address Encoding/Decoding');
    try {
      const diversifier = new Uint8Array(11).fill(0x12);
      const pkD = new Uint8Array(32).fill(0x34);
      const address = encodeZcashAddress('ztestsapling', diversifier, pkD);
      const parsed = parseZcashAddress(address);
      
      if (parsed.hrp === 'ztestsapling' &&
          parsed.diversifier.length === 11 &&
          parsed.pkD.length === 32) {
        success('Address encoding/decoding works');
        passed++;
      } else {
        fail('Address round-trip failed');
        failed++;
      }
    } catch (e) {
      fail(`Address test error: ${e}`);
      failed++;
    }

    // Test 2: Input validation
    header('Test 2: Input Validation');
    try {
      const validSpend = validateSpendProofInputs({
        rcv: new Uint8Array(32).fill(0x11),
        alpha: new Uint8Array(32).fill(0x22),
        value: 100000n,
        rcm: new Uint8Array(32).fill(0x33),
        ask: new Uint8Array(32).fill(0x44),
        nsk: new Uint8Array(32).fill(0x55)
      });
      
      const validOutput = validateOutputProofInputs({
        rcv: new Uint8Array(32).fill(0x11),
        value: 50000n,
        rcm: new Uint8Array(32).fill(0x22),
        diversifier: new Uint8Array(11).fill(0x33),
        pkD: new Uint8Array(32).fill(0x44)
      });
      
      if (validSpend.valid && validOutput.valid) {
        success('Input validation works');
        passed++;
      } else {
        fail('Input validation rejected valid inputs');
        failed++;
      }
    } catch (e) {
      fail(`Validation test error: ${e}`);
      failed++;
    }

    // Test 3: Prover initialization
    header('Test 3: Prover Initialization');
    try {
      resetGroth16Integration();
      const prover = new ZcashProver({ useWorker: false });
      await prover.initialize();
      
      const status = await getProverStatus();
      info(`Prover type: ${status.activeProver}`);
      info(`Can generate real proofs: ${status.canGenerateRealProofs}`);
      
      if (status.initialized) {
        success('Prover initialized successfully');
        passed++;
      } else {
        fail('Prover failed to initialize');
        failed++;
      }
    } catch (e) {
      fail(`Prover test error: ${e}`);
      failed++;
    }

    // Test 4: Transaction building
    header('Test 4: Transaction Building');
    try {
      const noteCache = new NoteCache();
      const builder = new ShieldedTransactionBuilder(noteCache);
      
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(200000);
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0x11);
      
      const tx = builder.buildShieldedTransaction({
        spendingKey,
        spends: [{ note, witness }],
        outputs: [{
          address: generateTestAddress(),
          value: 180000,
          memo: 'Smoke test'
        }],
        anchor,
        fee: 10000
      });
      
      if (tx.shieldedBundle.spends.length === 1 &&
          tx.shieldedBundle.outputs.length === 1 &&
          tx.version === 4) {
        success('Transaction building works');
        passed++;
      } else {
        fail('Transaction structure incorrect');
        failed++;
      }
    } catch (e) {
      fail(`Transaction building error: ${e}`);
      failed++;
    }

    // Test 5: Full signing flow
    header('Test 5: Full Signing Flow');
    try {
      const noteCache = new NoteCache();
      const prover = new ZcashProver({ useWorker: false });
      const signer = new ShieldedSigner(prover);
      const builder = new ShieldedTransactionBuilder(noteCache);
      
      await prover.initialize();
      
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(200000);
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0x22);
      
      const unsignedTx = builder.buildShieldedTransaction({
        spendingKey,
        spends: [{ note, witness }],
        outputs: [{
          address: generateTestAddress(),
          value: 180000,
          memo: 'Smoke test signing'
        }],
        anchor,
        fee: 10000
      });
      
      info('Signing transaction (this may take a moment)...');
      const signStart = Date.now();
      const signedTx = await signer.signShieldedTransaction(unsignedTx);
      const signDuration = Date.now() - signStart;
      
      info(`Signing completed in ${signDuration}ms`);
      
      if (signedTx.txHash &&
          signedTx.rawTx.length > 0 &&
          signedTx.shieldedBundle.spends[0].zkproof.length === 192 &&
          signedTx.shieldedBundle.spends[0].spendAuthSig.length === 64) {
        success('Full signing flow works');
        info(`Transaction hash: ${signedTx.txHash}`);
        info(`Raw tx size: ${signedTx.rawTx.length / 2} bytes`);
        passed++;
      } else {
        fail('Signed transaction incomplete');
        failed++;
      }
      
      await prover.dispose();
    } catch (e) {
      fail(`Signing test error: ${e}`);
      failed++;
    }

    // Test 6: Note cache
    header('Test 6: Note Cache');
    try {
      const noteCache = new NoteCache();
      const note = generateTestNote(150000);
      note.cmu = new Uint8Array(32).fill(0xDE);
      
      noteCache.addNote(note, 'zs1testaddress', 100);
      
      const retrieved = noteCache.getNoteByCommitment(note.cmu);
      const balance = noteCache.getBalance('zs1testaddress');
      
      if (retrieved && balance.total >= 150000) {
        success('Note cache works');
        passed++;
      } else {
        fail('Note cache retrieval failed');
        failed++;
      }
    } catch (e) {
      fail(`Note cache error: ${e}`);
      failed++;
    }

  } catch (e) {
    fail(`Unexpected error: ${e}`);
    failed++;
  }

  // Summary
  const duration = Date.now() - startTime;
  header('Summary');
  log(`Total tests: ${passed + failed}`);
  success(`Passed: ${passed}`);
  if (failed > 0) {
    fail(`Failed: ${failed}`);
  }
  info(`Duration: ${duration}ms`);

  return failed === 0;
}

// Run tests
runSmokeTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
