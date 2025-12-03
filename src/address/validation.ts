/**
 * Address Validation
 * Validates Zcash addresses (transparent and shielded)
 */

import { base58Decode, bech32Decode } from '../utils/encoding';
import { doubleSha256 } from '../utils/hash';
import type { Network, AddressType } from '../types/index';

/**
 * Address validation result
 */
export interface AddressValidationResult {
  valid: boolean;
  type: AddressType | null;
  network: Network | null;
  error?: string;
}

/**
 * Network prefixes for transparent addresses
 */
const T_ADDRESS_PREFIXES = {
  mainnet: {
    pubKeyHash: [0x1c, 0xb8], // t1...
    scriptHash: [0x1c, 0xbd]  // t3...
  },
  testnet: {
    pubKeyHash: [0x1d, 0x25], // tm...
    scriptHash: [0x1c, 0xba]  // t2...
  }
} as const;

/**
 * Bech32 HRPs for shielded addresses
 */
const Z_ADDRESS_HRPS = {
  mainnet: {
    sapling: 'zs',
    orchard: 'u' // Unified addresses
  },
  testnet: {
    sapling: 'ztestsapling',
    orchard: 'utest'
  }
} as const;

/**
 * Validate any Zcash address
 */
export function validateAddress(address: string): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return {
      valid: false,
      type: null,
      network: null,
      error: 'Invalid address: empty or not a string'
    };
  }

  // Try transparent address validation
  const tResult = validateTransparentAddress(address);
  if (tResult.valid) {
    return tResult;
  }

  // Try shielded address validation
  const zResult = validateShieldedAddress(address);
  if (zResult.valid) {
    return zResult;
  }

  return {
    valid: false,
    type: null,
    network: null,
    error: 'Address format not recognized'
  };
}

/**
 * Validate transparent address (t-address)
 */
export function validateTransparentAddress(address: string): AddressValidationResult {
  try {
    // Decode Base58
    const decoded = base58Decode(address);

    // Check length: 2 (version) + 20 (hash) + 4 (checksum) = 26 bytes
    if (decoded.length !== 26) {
      return {
        valid: false,
        type: 'transparent',
        network: null,
        error: `Invalid length: expected 26 bytes, got ${decoded.length}`
      };
    }

    // Extract components
    const version = [decoded[0], decoded[1]];
    const payload = decoded.slice(0, 22);
    const checksum = decoded.slice(22, 26);

    // Verify checksum
    const computed = doubleSha256(payload).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== computed[i]) {
        return {
          valid: false,
          type: 'transparent',
          network: null,
          error: 'Invalid checksum'
        };
      }
    }

    // Determine network and address type
    let network: Network | null = null;

    // Check mainnet
    if (version[0] === T_ADDRESS_PREFIXES.mainnet.pubKeyHash[0] &&
        version[1] === T_ADDRESS_PREFIXES.mainnet.pubKeyHash[1]) {
      network = 'mainnet';
    } else if (version[0] === T_ADDRESS_PREFIXES.mainnet.scriptHash[0] &&
               version[1] === T_ADDRESS_PREFIXES.mainnet.scriptHash[1]) {
      network = 'mainnet';
    }
    // Check testnet
    else if (version[0] === T_ADDRESS_PREFIXES.testnet.pubKeyHash[0] &&
             version[1] === T_ADDRESS_PREFIXES.testnet.pubKeyHash[1]) {
      network = 'testnet';
    } else if (version[0] === T_ADDRESS_PREFIXES.testnet.scriptHash[0] &&
               version[1] === T_ADDRESS_PREFIXES.testnet.scriptHash[1]) {
      network = 'testnet';
    }

    if (!network) {
      return {
        valid: false,
        type: 'transparent',
        network: null,
        error: `Unrecognized version bytes: ${version[0].toString(16)}${version[1].toString(16)}`
      };
    }

    return {
      valid: true,
      type: 'transparent',
      network
    };
  } catch (error) {
    return {
      valid: false,
      type: 'transparent',
      network: null,
      error: error instanceof Error ? error.message : 'Failed to decode address'
    };
  }
}

/**
 * Validate shielded address (z-address)
 */
export function validateShieldedAddress(address: string): AddressValidationResult {
  try {
    // Decode Bech32
    const { hrp, data } = bech32Decode(address);

    // Determine network
    let network: Network | null = null;
    let type: AddressType = 'shielded';

    if (hrp === Z_ADDRESS_HRPS.mainnet.sapling) {
      network = 'mainnet';
    } else if (hrp === Z_ADDRESS_HRPS.testnet.sapling) {
      network = 'testnet';
    } else if (hrp === Z_ADDRESS_HRPS.mainnet.orchard ||
               hrp === Z_ADDRESS_HRPS.testnet.orchard) {
      type = 'orchard';
      network = hrp === Z_ADDRESS_HRPS.mainnet.orchard ? 'mainnet' : 'testnet';
    } else {
      return {
        valid: false,
        type: 'shielded',
        network: null,
        error: `Unrecognized HRP: ${hrp}`
      };
    }

    // Validate data length for Sapling
    // Sapling address: 11 (diversifier) + 32 (pkd) = 43 bytes
    if (type === 'shielded' && data.length !== 43) {
      return {
        valid: false,
        type: 'shielded',
        network,
        error: `Invalid Sapling address length: expected 43 bytes, got ${data.length}`
      };
    }

    return {
      valid: true,
      type,
      network
    };
  } catch (error) {
    return {
      valid: false,
      type: 'shielded',
      network: null,
      error: error instanceof Error ? error.message : 'Failed to decode address'
    };
  }
}

/**
 * Check if address belongs to specified network
 */
export function isAddressForNetwork(address: string, network: Network): boolean {
  const result = validateAddress(address);
  return result.valid && result.network === network;
}

/**
 * Get address type
 */
export function getAddressType(address: string): AddressType | null {
  const result = validateAddress(address);
  return result.type;
}

/**
 * Get address network
 */
export function getAddressNetwork(address: string): Network | null {
  const result = validateAddress(address);
  return result.network;
}

/**
 * Extract pubkey hash from transparent address
 */
export function extractPubKeyHash(address: string): Uint8Array | null {
  const result = validateTransparentAddress(address);
  if (!result.valid) {
    return null;
  }

  const decoded = base58Decode(address);
  return decoded.slice(2, 22); // Skip 2 version bytes, get 20 bytes hash
}

/**
 * Extract diversifier and pkd from shielded address
 */
export function extractShieldedComponents(
  address: string
): { diversifier: Uint8Array; pkd: Uint8Array } | null {
  const result = validateShieldedAddress(address);
  if (!result.valid) {
    return null;
  }

  const { data } = bech32Decode(address);
  return {
    diversifier: data.slice(0, 11),
    pkd: data.slice(11, 43)
  };
}

