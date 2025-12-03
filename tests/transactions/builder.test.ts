/**
 * Transaction Builder Tests
 * Tests transparent transaction building
 */

import { ZcashTransactionBuilder } from '../../src/transactions/builder';
import { ZcashRPCClient } from '../../src/rpc/client';
import type { TransparentInput, TransparentOutput } from '../../src/types';

// Mock RPC client
const mockRPCClient = {
  getBlockCount: jest.fn().mockResolvedValue(1000000),
  listUnspent: jest.fn().mockResolvedValue([
    {
      txid: 'abc123',
      vout: 0,
      address: 'tmTestAddress',
      scriptPubKey: '76a914...',
      amount: 50000000,
      confirmations: 10,
      spendable: true
    }
  ])
} as unknown as ZcashRPCClient;

describe('ZcashTransactionBuilder', () => {
  let builder: ZcashTransactionBuilder;

  beforeEach(() => {
    builder = new ZcashTransactionBuilder({
      network: 'testnet',
      rpcClient: mockRPCClient
    });
    jest.clearAllMocks();
  });

  describe('buildTransparentTransaction', () => {
    it('should build a valid transparent transaction', async () => {
      const inputs: TransparentInput[] = [
        {
          txHash: 'abc123',
          index: 0,
          scriptPubKey: '76a914...',
          value: 50000000,
          sequence: 0xFFFFFFFF
        }
      ];

      const outputs: TransparentOutput[] = [
        {
          address: 'tmRecipient',
          value: 10000000,
          scriptPubKey: ''
        }
      ];

      const tx = await builder.buildTransparentTransaction(inputs, outputs, 1000);

      expect(tx).toBeDefined();
      expect(tx.version).toBe(4);
      expect(tx.transparentInputs).toEqual(inputs);
      expect(tx.transparentOutputs.length).toBeGreaterThan(0);
      expect(tx.expiryHeight).toBeGreaterThan(0);
    });

    it('should calculate fee if not provided', async () => {
      const inputs: TransparentInput[] = [
        {
          txHash: 'abc123',
          index: 0,
          scriptPubKey: '76a914...',
          value: 50000000,
          sequence: 0xFFFFFFFF
        }
      ];

      const outputs: TransparentOutput[] = [
        {
          address: 'tmRecipient',
          value: 10000000,
          scriptPubKey: ''
        }
      ];

      const tx = await builder.buildTransparentTransaction(inputs, outputs);

      expect(tx).toBeDefined();
      // Transaction should be valid even without explicit fee
    });
  });

  describe('selectUTXOs', () => {
    it('should select sufficient UTXOs', async () => {
      const selected = await builder.selectUTXOs('tmTestAddress', 10000000, 1000);

      expect(selected).toBeDefined();
      expect(selected.length).toBeGreaterThan(0);
      expect(mockRPCClient.listUnspent).toHaveBeenCalled();
    });

    it('should throw on insufficient funds', async () => {
      mockRPCClient.listUnspent.mockResolvedValueOnce([]);

      await expect(
        builder.selectUTXOs('tmTestAddress', 1000000000, 1000)
      ).rejects.toThrow();
    });
  });
});





