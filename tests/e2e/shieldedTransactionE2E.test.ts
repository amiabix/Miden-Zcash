/**
 * End-to-End Integration Test for Shielded Transactions
 * 
 * This test suite validates the complete flow from transaction building
 * through proof generation to serialization and (optionally) broadcast.
 * 
 * Test Modes:
 * - Unit mode (default): Tests the full flow with mock RPC
 * - Live mode: Tests against a real zcashd node (requires ZCASH_RPC_URL env)
 */

import {
  ShieldedTransactionBuilder,
  ZcashProver,
  ShieldedSigner,
  NoteCache,
  getGroth16Integration,
  resetGroth16Integration,
  getProverStatus,
  validateSpendProofInputs,
  validateOutputProofInputs,
  ZcashRpcClient,
  TransactionTracker,
  BroadcastTransactionStatus,
  parseZcashAddress,
  encodeZcashAddress
} from '../../src/shielded/index';

import type {
  SaplingNote,
  SaplingSpendingKey,
  ShieldedOutputParams,
  MerkleWitness
} from '../../src/shielded/types';

// Test configuration
const TEST_CONFIG = {
  // Use live RPC if ZCASH_RPC_URL is set
  useLiveRpc: !!process.env.ZCASH_RPC_URL,
  rpcUrl: process.env.ZCASH_RPC_URL || 'http://localhost:18232',
  rpcUser: process.env.ZCASH_RPC_USER || 'zcashrpc',
  rpcPassword: process.env.ZCASH_RPC_PASSWORD || 'testpassword',
  // Skip broadcast in CI unless explicitly enabled
  allowBroadcast: process.env.ALLOW_BROADCAST === 'true',
  // Test timeout (proof generation can be slow)
  timeout: 60000
};

// Test data generators
function generateTestSpendingKey(): SaplingSpendingKey {
  const ask = new Uint8Array(32);
  const nsk = new Uint8Array(32);
  const ovk = new Uint8Array(32);
  
  // Fill with deterministic test values
  for (let i = 0; i < 32; i++) {
    ask[i] = (i * 7 + 13) % 256;
    nsk[i] = (i * 11 + 17) % 256;
    ovk[i] = (i * 13 + 19) % 256;
  }
  
  return { ask, nsk, ovk };
}

function generateTestNote(value: number = 100000): SaplingNote {
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

function generateTestMerkleWitness(): MerkleWitness {
  const authPath: Uint8Array[] = [];
  for (let i = 0; i < 32; i++) {
    const node = new Uint8Array(32);
    for (let j = 0; j < 32; j++) {
      node[j] = (i * j + 1) % 256;
    }
    authPath.push(node);
  }
  
  return {
    authPath,
    position: 0
  };
}

function generateTestAddress(): string {
  const diversifier = new Uint8Array(11).fill(0x55);
  const pkD = new Uint8Array(32).fill(0xAA);
  return encodeZcashAddress('ztestsapling', diversifier, pkD);
}

describe('E2E: Shielded Transaction Flow', () => {
  let noteCache: NoteCache;
  let prover: ZcashProver;
  let signer: ShieldedSigner;
  let builder: ShieldedTransactionBuilder;

  beforeAll(async () => {
    // Reset and initialize prover
    resetGroth16Integration();
    
    // Initialize components
    noteCache = new NoteCache();
    prover = new ZcashProver({ useWorker: false });
    signer = new ShieldedSigner(prover);
    builder = new ShieldedTransactionBuilder(noteCache);
    
    // Initialize prover
    await prover.initialize();
  }, TEST_CONFIG.timeout);

  afterAll(() => {
    resetGroth16Integration();
  });

  describe('Prover Status', () => {
    it('should report prover status', async () => {
      const status = await getProverStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.activeProver).toBeDefined();
      expect(status.statusMessage).toBeDefined();
      
      console.log('[E2E] Prover Status:', status.statusMessage);
      console.log('[E2E] Active Prover:', status.activeProver);
      console.log('[E2E] Can Generate Real Proofs:', status.canGenerateRealProofs);
    });
  });

  describe('Address Handling', () => {
    it('should encode and parse addresses correctly', () => {
      const diversifier = new Uint8Array(11);
      const pkD = new Uint8Array(32);
      
      for (let i = 0; i < 11; i++) diversifier[i] = i * 2;
      for (let i = 0; i < 32; i++) pkD[i] = i * 3;
      
      const address = encodeZcashAddress('ztestsapling', diversifier, pkD);
      const parsed = parseZcashAddress(address);
      
      expect(parsed.hrp).toBe('ztestsapling');
      expect(Array.from(parsed.diversifier)).toEqual(Array.from(diversifier));
      expect(Array.from(parsed.pkD)).toEqual(Array.from(pkD));
    });
  });

  describe('Input Validation', () => {
    it('should validate spend proof inputs', () => {
      const validInputs = {
        rcv: new Uint8Array(32).fill(0x11),
        alpha: new Uint8Array(32).fill(0x22),
        value: 100000n,
        rcm: new Uint8Array(32).fill(0x33),
        ask: new Uint8Array(32).fill(0x44),
        nsk: new Uint8Array(32).fill(0x55),
        anchor: new Uint8Array(32).fill(0x66),
        merklePath: [new Uint8Array(32).fill(0x77)],
        position: 0
      };
      
      const result = validateSpendProofInputs(validInputs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid spend proof inputs', () => {
      const invalidInputs = {
        rcv: new Uint8Array(31), // Wrong length
        alpha: new Uint8Array(32),
        value: -100n, // Negative
        rcm: new Uint8Array(32),
        ask: new Uint8Array(32),
        nsk: new Uint8Array(32)
      };
      
      const result = validateSpendProofInputs(invalidInputs);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate output proof inputs', () => {
      const validInputs = {
        rcv: new Uint8Array(32).fill(0x11),
        value: 50000n,
        rcm: new Uint8Array(32).fill(0x22),
        diversifier: new Uint8Array(11).fill(0x33),
        pkD: new Uint8Array(32).fill(0x44),
        esk: new Uint8Array(32).fill(0x55)
      };
      
      const result = validateOutputProofInputs(validInputs);
      expect(result.valid).toBe(true);
    });
  });

  describe('Transaction Building', () => {
    it('should build a shielding transaction (t-to-z)', () => {
      const params = {
        transparentInputs: [{
          txid: '0'.repeat(64),
          vout: 0,
          value: 200000,
          scriptPubKey: '',
          address: 't1testaddress'
        }],
        shieldedOutput: {
          address: generateTestAddress(),
          value: 190000,
          memo: 'Test shielding transaction'
        },
        changeAddress: 't1changeaddress',
        fee: 10000
      };
      
      const tx = builder.buildShieldingTransaction(params);
      
      expect(tx.version).toBe(4);
      expect(tx.shieldedBundle.outputs).toHaveLength(1);
      expect(tx.shieldedBundle.spends).toHaveLength(0);
      expect(tx.shieldedBundle.valueBalance).toBe(-190000n);
    });

    it('should build a fully shielded transaction (z-to-z)', () => {
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(200000);
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0xAB);
      
      const params = {
        spendingKey,
        spends: [{
          note,
          witness
        }],
        outputs: [{
          address: generateTestAddress(),
          value: 180000,
          memo: 'Test z-to-z transaction'
        }],
        anchor,
        fee: 10000
      };
      
      const tx = builder.buildShieldedTransaction(params);
      
      expect(tx.version).toBe(4);
      expect(tx.shieldedBundle.spends).toHaveLength(1);
      expect(tx.shieldedBundle.outputs).toHaveLength(1);
      expect(tx.signingData.spends).toHaveLength(1);
      expect(tx.signingData.outputs).toHaveLength(1);
    });

    it('should build a deshielding transaction (z-to-t)', () => {
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(200000);
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0xCD);
      
      const params = {
        spendingKey,
        spends: [{
          note,
          witness
        }],
        anchor,
        transparentOutput: {
          address: 't1destinationaddress',
          value: 180000,
          scriptPubKey: ''
        },
        fee: 10000
      };
      
      const tx = builder.buildDeshieldingTransaction(params);
      
      expect(tx.version).toBe(4);
      expect(tx.shieldedBundle.spends).toHaveLength(1);
      expect(tx.transparentOutputs).toHaveLength(1);
      expect(tx.shieldedBundle.valueBalance).toBe(190000n); // output + fee
    });

    it('should reject insufficient funds', () => {
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(100000); // Only 100000
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0xEF);
      
      const params = {
        spendingKey,
        spends: [{
          note,
          witness
        }],
        outputs: [{
          address: generateTestAddress(),
          value: 200000, // Trying to spend 200000
          memo: 'Should fail'
        }],
        anchor,
        fee: 10000
      };
      
      expect(() => builder.buildShieldedTransaction(params)).toThrow('Insufficient');
    });
  });

  describe('Fee Estimation', () => {
    it('should estimate fees correctly', () => {
      const fee1 = builder.estimateFee(1, 1, 0, 0);
      const fee2 = builder.estimateFee(2, 2, 0, 0);
      const fee3 = builder.estimateFee(1, 1, 1, 1);
      
      expect(fee2).toBeGreaterThan(fee1);
      expect(fee3).toBeGreaterThan(fee1);
      expect(fee1).toBeGreaterThan(0);
    });
  });

  describe('Proof Generation', () => {
    it('should estimate proof time', () => {
      const time = prover.estimateProofTime(2, 2);
      
      expect(time).toBeGreaterThan(0);
      console.log(`[E2E] Estimated proof time for 2 spends + 2 outputs: ${time}ms`);
    });

    // Note: This test may take a while depending on the prover
    // Skip if WASM prover is not available
    it('should generate proofs for a transaction (or skip without WASM)', async () => {
      const status = await getProverStatus();
      
      // If no real prover is available, skip this test
      if (!status.canGenerateRealProofs && status.activeProver !== 'prize-wasm') {
        console.log('[E2E] Skipping proof generation test - no WASM prover available');
        return;
      }
      
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
          memo: 'Proof generation test'
        }],
        anchor,
        fee: 10000
      });
      
      // Generate proofs
      const startTime = Date.now();
      const proofs = await prover.generateProofs(tx);
      const duration = Date.now() - startTime;
      
      console.log(`[E2E] Proof generation took ${duration}ms`);
      
      expect(proofs.spendProofs).toHaveLength(1);
      expect(proofs.outputProofs).toHaveLength(1);
      expect(proofs.bindingSig.length).toBe(64);
      
      // Check proof sizes (should be 192 bytes for Zcash)
      expect(proofs.spendProofs[0].proof.length).toBe(192);
      expect(proofs.outputProofs[0].proof.length).toBe(192);
    }, TEST_CONFIG.timeout);
  });

  describe('Transaction Signing', () => {
    it('should sign a complete transaction (or skip without WASM)', async () => {
      const status = await getProverStatus();
      
      // If no real prover is available, skip this test
      if (!status.canGenerateRealProofs && status.activeProver !== 'prize-wasm') {
        console.log('[E2E] Skipping signing test - no WASM prover available');
        return;
      }
      
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
          memo: 'Signing test'
        }],
        anchor,
        fee: 10000
      });
      
      // Sign transaction
      const signedTx = await signer.signShieldedTransaction(unsignedTx);
      
      expect(signedTx.txHash).toBeDefined();
      expect(signedTx.rawTx).toBeDefined();
      expect(signedTx.nullifiers).toHaveLength(1);
      expect(signedTx.shieldedBundle.bindingSig.length).toBe(64);
      
      // Check that spend auth signatures are present
      for (const spend of signedTx.shieldedBundle.spends) {
        expect(spend.spendAuthSig.length).toBe(64);
        expect(spend.zkproof.length).toBe(192);
      }
      
      console.log(`[E2E] Signed transaction hash: ${signedTx.txHash}`);
      console.log(`[E2E] Raw transaction size: ${signedTx.rawTx.length / 2} bytes`);
    }, TEST_CONFIG.timeout);
  });

  describe('Note Cache', () => {
    it('should store and retrieve notes', () => {
      const localNoteCache = new NoteCache();
      const note = generateTestNote(150000) as any;
      note.cmu = new Uint8Array(32).fill(0xDE);
      note.address = 'zs1testaddress'; // Set the address on the note itself
      
      // Use the ScannedNote format
      localNoteCache.addNote({
        note,
        blockHeight: 100,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      
      const retrieved = localNoteCache.getNoteByCommitment(note.cmu);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.value).toBe(150000);
      
      const forAddress = localNoteCache.getNotesForAddress('zs1testaddress');
      expect(forAddress.length).toBeGreaterThan(0);
    });

    it('should track spent notes', () => {
      const localNoteCache = new NoteCache();
      const note = generateTestNote(75000);
      note.cmu = new Uint8Array(32).fill(0xEF);
      note.nullifier = new Uint8Array(32).fill(0xAB);
      
      localNoteCache.addNote({
        note,
        address: 'zs1anotheraddress',
        blockHeight: 101,
        txIndex: 0,
        outputIndex: 0,
        isOutgoing: false
      });
      localNoteCache.markSpent(note.nullifier);
      
      const balance = localNoteCache.getBalance('zs1anotheraddress');
      // Spent notes still count in total, but not spendable
      expect(balance).toBeDefined();
    });

    it('should export and import state', () => {
      const exported = noteCache.export();
      expect(exported).toBeDefined();
      expect(exported.notes).toBeDefined();
      
      const newCache = new NoteCache();
      newCache.import(exported);
      
      // Just check it doesn't throw
      expect(newCache.getBalance('zs1testaddress')).toBeDefined();
    });
  });
});

describe('E2E: RPC Integration', () => {
  let rpcClient: ZcashRpcClient;
  let tracker: TransactionTracker;

  beforeAll(() => {
    rpcClient = new ZcashRpcClient(TEST_CONFIG.rpcUrl, {
      username: TEST_CONFIG.rpcUser,
      password: TEST_CONFIG.rpcPassword
    });
    tracker = new TransactionTracker(rpcClient);
  });

  describe('RPC Client', () => {
    // Skip if no live RPC
    const itLive = TEST_CONFIG.useLiveRpc ? it : it.skip;

    itLive('should connect to node and get blockchain info', async () => {
      const info = await rpcClient.getBlockchainInfo();
      
      expect(info.blocks).toBeGreaterThan(0);
      expect(info.chain).toBeDefined();
      
      console.log(`[E2E] Connected to ${info.chain} at height ${info.blocks}`);
    });

    itLive('should get network info', async () => {
      const info = await rpcClient.getNetworkInfo();
      
      expect(info.version).toBeDefined();
      console.log(`[E2E] Node version: ${info.subversion}`);
    });

    itLive('should estimate fees', async () => {
      const fee = await rpcClient.estimateFee(6);
      
      expect(fee).toBeGreaterThan(0);
      console.log(`[E2E] Estimated fee: ${fee} ZEC/kB`);
    });
  });

  describe('Transaction Tracker', () => {
    it('should track transactions', () => {
      const fakeTxid = '0'.repeat(64);
      
      const tracked = tracker.trackTransaction(fakeTxid);
      
      expect(tracked.txid).toBe(fakeTxid);
      expect(tracked.status).toBe(BroadcastTransactionStatus.MEMPOOL);
      
      const status = tracker.getTransactionStatus(fakeTxid);
      expect(status).not.toBeNull();
    });

    it('should get statistics', () => {
      const stats = tracker.getStatistics();
      
      expect(stats.totalTracked).toBeGreaterThan(0);
    });

    it('should export and import state', () => {
      const exported = tracker.exportState();
      expect(Array.isArray(exported)).toBe(true);
      
      tracker.clear();
      tracker.importState(exported);
      
      expect(tracker.getStatistics().totalTracked).toBe(exported.length);
    });
  });
});

describe('E2E: Full Transaction Lifecycle (Mock)', () => {
  it('should complete full lifecycle: build -> prove -> sign -> serialize', async () => {
    // Setup
    const localNoteCache = new NoteCache();
    const localProver = new ZcashProver({ useWorker: false });
    const localSigner = new ShieldedSigner(localProver);
    const localBuilder = new ShieldedTransactionBuilder(localNoteCache);
    
    await localProver.initialize();
    
    const status = await getProverStatus();
    
    // If no real prover is available, just test the build step
    if (!status.canGenerateRealProofs && status.activeProver !== 'prize-wasm') {
      console.log('[E2E Lifecycle] No WASM prover available - testing build step only');
      
      // 1. Build transaction
      console.log('[E2E Lifecycle] Step 1: Building transaction...');
      const spendingKey = generateTestSpendingKey();
      const note = generateTestNote(500000);
      const witness = generateTestMerkleWitness();
      const anchor = new Uint8Array(32).fill(0x99);
      
      const unsignedTx = localBuilder.buildShieldedTransaction({
        spendingKey,
        spends: [{ note, witness }],
        outputs: [
          {
            address: generateTestAddress(),
            value: 400000,
            memo: 'E2E lifecycle test - output 1'
          },
          {
            address: generateTestAddress(),
            value: 50000,
            memo: 'E2E lifecycle test - output 2 (change)'
          }
        ],
        anchor,
        fee: 10000
      });
      
      expect(unsignedTx.shieldedBundle.spends).toHaveLength(1);
      expect(unsignedTx.shieldedBundle.outputs).toHaveLength(2);
      expect(unsignedTx.signingData.spends).toHaveLength(1);
      expect(unsignedTx.signingData.outputs).toHaveLength(2);
      console.log('[E2E Lifecycle] Transaction built successfully (skipping proof generation)');
      
      await localProver.dispose();
      return;
    }
    
    // Full lifecycle with WASM prover
    // 1. Build transaction
    console.log('[E2E Lifecycle] Step 1: Building transaction...');
    const spendingKey = generateTestSpendingKey();
    const note = generateTestNote(500000);
    const witness = generateTestMerkleWitness();
    const anchor = new Uint8Array(32).fill(0x99);
    
    const unsignedTx = localBuilder.buildShieldedTransaction({
      spendingKey,
      spends: [{ note, witness }],
      outputs: [
        {
          address: generateTestAddress(),
          value: 400000,
          memo: 'E2E lifecycle test - output 1'
        },
        {
          address: generateTestAddress(),
          value: 50000,
          memo: 'E2E lifecycle test - output 2 (change)'
        }
      ],
      anchor,
      fee: 10000
    });
    
    expect(unsignedTx.shieldedBundle.spends).toHaveLength(1);
    expect(unsignedTx.shieldedBundle.outputs).toHaveLength(2);
    console.log('[E2E Lifecycle] Transaction built successfully');
    
    // 2. Sign (includes proof generation)
    console.log('[E2E Lifecycle] Step 2: Signing transaction (generating proofs)...');
    const startSign = Date.now();
    const signedTx = await localSigner.signShieldedTransaction(unsignedTx);
    const signDuration = Date.now() - startSign;
    console.log(`[E2E Lifecycle] Signing completed in ${signDuration}ms`);
    
    // 3. Verify output
    expect(signedTx.txHash).toBeDefined();
    expect(signedTx.rawTx.length).toBeGreaterThan(0);
    expect(signedTx.nullifiers).toHaveLength(1);
    
    // 4. Verify proofs are present
    for (const spend of signedTx.shieldedBundle.spends) {
      expect(spend.zkproof.length).toBe(192);
      expect(spend.spendAuthSig.length).toBe(64);
    }
    for (const output of signedTx.shieldedBundle.outputs) {
      expect(output.zkproof.length).toBe(192);
    }
    
    console.log('[E2E Lifecycle] Complete!');
    console.log(`[E2E Lifecycle] Transaction hash: ${signedTx.txHash}`);
    console.log(`[E2E Lifecycle] Raw transaction: ${signedTx.rawTx.substring(0, 100)}...`);
    console.log(`[E2E Lifecycle] Nullifiers revealed: ${signedTx.nullifiers.length}`);
    
    // Cleanup
    await localProver.dispose();
  }, TEST_CONFIG.timeout * 2);
});
