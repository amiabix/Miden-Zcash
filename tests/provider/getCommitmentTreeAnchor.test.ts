/**
 * Commitment Tree Anchor Tests
 * 
 * Tests for getCommitmentTreeAnchor() method
 */

import { ZcashProvider } from '../../src/provider/ZcashProvider';
import { ZcashRPCClient } from '../../src/rpc/client';
import type { ZcashProviderConfig } from '../../src/types/index';

describe('getCommitmentTreeAnchor', () => {
  let provider: ZcashProvider;
  let mockRpcClient: jest.Mocked<ZcashRPCClient>;

  beforeEach(() => {
    // Create mock RPC client
    mockRpcClient = {
      getTreeState: jest.fn(),
      getBlockCount: jest.fn(),
      getBlock: jest.fn(),
      getBlockHash: jest.fn(),
      getBlockchainInfo: jest.fn()
    } as any;

    const config: ZcashProviderConfig = {
      network: 'testnet',
      rpcEndpoint: 'http://localhost:18232'
    };

    provider = new ZcashProvider(config);
    // Inject mock RPC client
    (provider as any).rpcClient = mockRpcClient;
    (provider as any).rpcConnected = true;
  });

  it('should return anchor from Lightwalletd z_gettreestate', async () => {
    const mockRoot = new Uint8Array(32).fill(0x42);
    mockRpcClient.getTreeState = jest.fn().mockResolvedValue({
      root: mockRoot,
      height: 1000,
      size: 5000
    });

    const anchor = await (provider as any).getCommitmentTreeAnchor(1000);

    expect(anchor).toBeDefined();
    expect(anchor).toBeInstanceOf(Uint8Array);
    expect(anchor!.length).toBe(32);
    expect(anchor).toEqual(mockRoot);
    expect(mockRpcClient.getTreeState).toHaveBeenCalledWith(1000);
  });

  it('should return anchor from getblockchaininfo commitments', async () => {
    // First call fails (z_gettreestate not available)
    mockRpcClient.getTreeState = jest.fn().mockRejectedValue(new Error('Method not found'));
    
    // Second call succeeds with blockchain info
    mockRpcClient.getBlockchainInfo = jest.fn().mockResolvedValue({
      blocks: 1000,
      commitments: {
        finalRoot: '4242424242424242424242424242424242424242424242424242424242424242'
      }
    });

    const anchor = await (provider as any).getCommitmentTreeAnchor();

    expect(anchor).toBeDefined();
    expect(anchor).toBeInstanceOf(Uint8Array);
    expect(anchor!.length).toBe(32);
  });

  it('should return zero anchor if RPC not connected', async () => {
    (provider as any).rpcConnected = false;

    const anchor = await (provider as any).getCommitmentTreeAnchor();

    expect(anchor).toBeDefined();
    expect(anchor).toBeInstanceOf(Uint8Array);
    expect(anchor!.length).toBe(32);
    // Should be all zeros (fallback)
    expect(Array.from(anchor!)).toEqual(new Array(32).fill(0));
  });

  it('should return zero anchor if all methods fail', async () => {
    mockRpcClient.getTreeState = jest.fn().mockRejectedValue(new Error('Failed'));
    mockRpcClient.getBlockchainInfo = jest.fn().mockRejectedValue(new Error('Failed'));
    mockRpcClient.getBlockCount = jest.fn().mockResolvedValue(1000);
    mockRpcClient.getBlockHash = jest.fn().mockRejectedValue(new Error('Failed'));

    const anchor = await (provider as any).getCommitmentTreeAnchor();

    expect(anchor).toBeDefined();
    expect(anchor).toBeInstanceOf(Uint8Array);
    expect(anchor!.length).toBe(32);
    // Should be all zeros (fallback)
    expect(Array.from(anchor!)).toEqual(new Array(32).fill(0));
  });

  it('should use note cache tree state as fallback', async () => {
    mockRpcClient.getTreeState = jest.fn().mockRejectedValue(new Error('Failed'));
    mockRpcClient.getBlockchainInfo = jest.fn().mockResolvedValue({ blocks: 1000 });
    
    // Set note cache tree state
    const mockRoot = new Uint8Array(32).fill(0x99);
    (provider as any).noteCache = {
      getTreeState: jest.fn().mockReturnValue({
        root: mockRoot,
        blockHeight: 1000,
        size: 5000
      })
    };

    const anchor = await (provider as any).getCommitmentTreeAnchor();

    expect(anchor).toBeDefined();
    expect(anchor).toEqual(mockRoot);
  });
});

