/**
 * Tests for script generation
 */

import {
  createP2PKHScript,
  createP2SHScript,
  createP2PKScript,
  createOpReturnScript,
  createP2PKHScriptSig,
  decodeScript,
  identifyScriptType,
  isValidScriptPubKey,
  getRequiredSignatures,
  OP
} from '../../src/address/script';
import { bytesToHex, hexToBytes } from '../../src/utils/bytes';

describe('createP2PKHScript', () => {
  test('creates correct script format', () => {
    const pubKeyHash = new Uint8Array(20).fill(0x42);
    const script = createP2PKHScript(pubKeyHash);
    
    // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    expect(script.length).toBe(25);
    expect(script[0]).toBe(OP.OP_DUP);
    expect(script[1]).toBe(OP.OP_HASH160);
    expect(script[2]).toBe(0x14); // Push 20 bytes
    expect(script[23]).toBe(OP.OP_EQUALVERIFY);
    expect(script[24]).toBe(OP.OP_CHECKSIG);
  });

  test('throws for invalid pubKeyHash length', () => {
    expect(() => createP2PKHScript(new Uint8Array(19))).toThrow();
    expect(() => createP2PKHScript(new Uint8Array(21))).toThrow();
  });
});

describe('createP2SHScript', () => {
  test('creates correct script format', () => {
    const scriptHash = new Uint8Array(20).fill(0x42);
    const script = createP2SHScript(scriptHash);
    
    // OP_HASH160 <20 bytes> OP_EQUAL
    expect(script.length).toBe(23);
    expect(script[0]).toBe(OP.OP_HASH160);
    expect(script[1]).toBe(0x14); // Push 20 bytes
    expect(script[22]).toBe(OP.OP_EQUAL);
  });

  test('throws for invalid scriptHash length', () => {
    expect(() => createP2SHScript(new Uint8Array(19))).toThrow();
  });
});

describe('createP2PKScript', () => {
  test('creates correct script for compressed pubkey', () => {
    const pubKey = new Uint8Array(33).fill(0x02);
    const script = createP2PKScript(pubKey);
    
    // <33 bytes> OP_CHECKSIG
    expect(script.length).toBe(35);
    expect(script[0]).toBe(33); // Push 33 bytes
    expect(script[34]).toBe(OP.OP_CHECKSIG);
  });

  test('creates correct script for uncompressed pubkey', () => {
    const pubKey = new Uint8Array(65).fill(0x04);
    const script = createP2PKScript(pubKey);
    
    expect(script.length).toBe(67);
    expect(script[0]).toBe(65);
    expect(script[66]).toBe(OP.OP_CHECKSIG);
  });

  test('throws for invalid pubkey length', () => {
    expect(() => createP2PKScript(new Uint8Array(32))).toThrow();
  });
});

describe('createOpReturnScript', () => {
  test('creates correct script for small data', () => {
    const data = new TextEncoder().encode('hello');
    const script = createOpReturnScript(data);
    
    expect(script[0]).toBe(OP.OP_RETURN);
    expect(script[1]).toBe(data.length);
    expect(script.slice(2)).toEqual(data);
  });

  test('throws for data exceeding 80 bytes', () => {
    const data = new Uint8Array(81);
    expect(() => createOpReturnScript(data)).toThrow();
  });
});

describe('createP2PKHScriptSig', () => {
  test('creates correct scriptSig format', () => {
    const signature = new Uint8Array(70).fill(0x30);
    const publicKey = new Uint8Array(33).fill(0x02);
    
    const scriptSig = createP2PKHScriptSig(signature, publicKey);
    
    // <sig length> <sig + hashtype> <pubkey length> <pubkey>
    expect(scriptSig[0]).toBe(71); // sig + 1 byte hash type
    expect(scriptSig[72]).toBe(33); // pubkey length
  });
});

describe('decodeScript', () => {
  test('decodes P2PKH script', () => {
    const pubKeyHash = new Uint8Array(20).fill(0x42);
    const script = createP2PKHScript(pubKeyHash);
    
    const decoded = decodeScript(script);
    expect(decoded.type).toBe('p2pkh');
    expect(decoded.asm).toContain('OP_DUP');
    expect(decoded.asm).toContain('OP_HASH160');
  });

  test('decodes P2SH script', () => {
    const scriptHash = new Uint8Array(20).fill(0x42);
    const script = createP2SHScript(scriptHash);
    
    const decoded = decodeScript(script);
    expect(decoded.type).toBe('p2sh');
    expect(decoded.asm).toContain('OP_HASH160');
    expect(decoded.asm).toContain('OP_EQUAL');
  });

  test('decodes OP_RETURN script', () => {
    const data = new TextEncoder().encode('test');
    const script = createOpReturnScript(data);
    
    const decoded = decodeScript(script);
    expect(decoded.type).toBe('nulldata');
    expect(decoded.asm).toContain('OP_RETURN');
  });

  test('returns unknown for unrecognized scripts', () => {
    const script = new Uint8Array([0x00, 0x00, 0x00]);
    const decoded = decodeScript(script);
    expect(decoded.type).toBe('unknown');
  });
});

describe('identifyScriptType', () => {
  test('identifies P2PKH', () => {
    const script = createP2PKHScript(new Uint8Array(20));
    expect(identifyScriptType(script)).toBe('p2pkh');
  });

  test('identifies P2SH', () => {
    const script = createP2SHScript(new Uint8Array(20));
    expect(identifyScriptType(script)).toBe('p2sh');
  });
});

describe('isValidScriptPubKey', () => {
  test('returns true for P2PKH', () => {
    const script = createP2PKHScript(new Uint8Array(20));
    expect(isValidScriptPubKey(script)).toBe(true);
  });

  test('returns false for unknown scripts', () => {
    expect(isValidScriptPubKey(new Uint8Array([0x00]))).toBe(false);
  });
});

describe('getRequiredSignatures', () => {
  test('returns 1 for P2PKH', () => {
    const script = createP2PKHScript(new Uint8Array(20));
    expect(getRequiredSignatures(script)).toBe(1);
  });

  test('returns 0 for nulldata', () => {
    const script = createOpReturnScript(new Uint8Array(1));
    expect(getRequiredSignatures(script)).toBe(0);
  });
});

