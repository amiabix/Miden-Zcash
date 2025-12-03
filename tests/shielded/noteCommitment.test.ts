/**
 * Note Commitment Tests
 */

import {
  computeNoteCommitment,
  computeNullifier,
  computeValueCommitment,
  generateRcm,
  generateRseed,
  generateRcv,
  deriveRcmFromRseed,
  deriveNullifierKey,
  createNote,
  encodeNotePlaintext,
  decodeNotePlaintext,
  isNullifierSpent,
  markNullifierSpent
} from '../../src/shielded/noteCommitment';
import type { SaplingPaymentAddress } from '../../src/shielded/types';
import { bytesToHex } from '../../src/utils/bytes';

describe('Note Commitment', () => {
  describe('computeNoteCommitment', () => {
    test('produces 32-byte commitment', () => {
      const diversifier = new Uint8Array(11).fill(1);
      const pkD = new Uint8Array(32).fill(2);
      const value = 100000n;
      const rcm = new Uint8Array(32).fill(3);

      const commitment = computeNoteCommitment(diversifier, pkD, value, rcm);

      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(32);
    });

    test('is deterministic', () => {
      const diversifier = new Uint8Array(11).fill(1);
      const pkD = new Uint8Array(32).fill(2);
      const value = 100000n;
      const rcm = new Uint8Array(32).fill(3);

      const commitment1 = computeNoteCommitment(diversifier, pkD, value, rcm);
      const commitment2 = computeNoteCommitment(diversifier, pkD, value, rcm);

      expect(bytesToHex(commitment1)).toBe(bytesToHex(commitment2));
    });

    test('different inputs produce different commitments', () => {
      const diversifier = new Uint8Array(11).fill(1);
      const pkD = new Uint8Array(32).fill(2);
      const rcm = new Uint8Array(32).fill(3);

      const commitment1 = computeNoteCommitment(diversifier, pkD, 100n, rcm);
      const commitment2 = computeNoteCommitment(diversifier, pkD, 200n, rcm);

      expect(bytesToHex(commitment1)).not.toBe(bytesToHex(commitment2));
    });

    test('throws on invalid diversifier length', () => {
      const diversifier = new Uint8Array(10); // Wrong length
      const pkD = new Uint8Array(32);
      const rcm = new Uint8Array(32);

      expect(() => {
        computeNoteCommitment(diversifier, pkD, 100n, rcm);
      }).toThrow('Diversifier must be 11 bytes');
    });

    test('throws on invalid pkD length', () => {
      const diversifier = new Uint8Array(11);
      const pkD = new Uint8Array(31); // Wrong length
      const rcm = new Uint8Array(32);

      expect(() => {
        computeNoteCommitment(diversifier, pkD, 100n, rcm);
      }).toThrow('pkD must be 32 bytes');
    });
  });

  describe('computeNullifier', () => {
    test('produces 32-byte nullifier', () => {
      const nk = new Uint8Array(32).fill(1);
      const cmu = new Uint8Array(32).fill(2);
      const position = 12345n;

      const nullifier = computeNullifier(nk, cmu, position);

      expect(nullifier).toBeInstanceOf(Uint8Array);
      expect(nullifier.length).toBe(32);
    });

    test('is deterministic', () => {
      const nk = new Uint8Array(32).fill(1);
      const cmu = new Uint8Array(32).fill(2);
      const position = 12345n;

      const nullifier1 = computeNullifier(nk, cmu, position);
      const nullifier2 = computeNullifier(nk, cmu, position);

      expect(bytesToHex(nullifier1)).toBe(bytesToHex(nullifier2));
    });

    test('different positions produce different nullifiers', () => {
      const nk = new Uint8Array(32).fill(1);
      const cmu = new Uint8Array(32).fill(2);

      const nullifier1 = computeNullifier(nk, cmu, 100n);
      const nullifier2 = computeNullifier(nk, cmu, 200n);

      expect(bytesToHex(nullifier1)).not.toBe(bytesToHex(nullifier2));
    });
  });

  describe('computeValueCommitment', () => {
    test('produces 32-byte commitment', () => {
      const value = 100000n;
      const rcv = new Uint8Array(32).fill(1);

      const cv = computeValueCommitment(value, rcv);

      expect(cv).toBeInstanceOf(Uint8Array);
      expect(cv.length).toBe(32);
    });

    test('is deterministic', () => {
      const value = 100000n;
      const rcv = new Uint8Array(32).fill(1);

      const cv1 = computeValueCommitment(value, rcv);
      const cv2 = computeValueCommitment(value, rcv);

      expect(bytesToHex(cv1)).toBe(bytesToHex(cv2));
    });
  });

  describe('generateRcm', () => {
    test('produces 32-byte randomness', () => {
      const rcm = generateRcm();

      expect(rcm).toBeInstanceOf(Uint8Array);
      expect(rcm.length).toBe(32);
    });

    test('produces different values each time', () => {
      const rcm1 = generateRcm();
      const rcm2 = generateRcm();

      expect(bytesToHex(rcm1)).not.toBe(bytesToHex(rcm2));
    });
  });

  describe('generateRseed', () => {
    test('produces 32-byte randomness', () => {
      const rseed = generateRseed();

      expect(rseed).toBeInstanceOf(Uint8Array);
      expect(rseed.length).toBe(32);
    });
  });

  describe('generateRcv', () => {
    test('produces 32-byte randomness', () => {
      const rcv = generateRcv();

      expect(rcv).toBeInstanceOf(Uint8Array);
      expect(rcv.length).toBe(32);
    });
  });

  describe('deriveRcmFromRseed', () => {
    test('produces 32-byte rcm', () => {
      const rseed = new Uint8Array(32).fill(1);
      const rcm = deriveRcmFromRseed(rseed);

      expect(rcm).toBeInstanceOf(Uint8Array);
      expect(rcm.length).toBe(32);
    });

    test('is deterministic', () => {
      const rseed = new Uint8Array(32).fill(1);

      const rcm1 = deriveRcmFromRseed(rseed);
      const rcm2 = deriveRcmFromRseed(rseed);

      expect(bytesToHex(rcm1)).toBe(bytesToHex(rcm2));
    });

    test('throws on invalid rseed length', () => {
      const rseed = new Uint8Array(31);

      expect(() => {
        deriveRcmFromRseed(rseed);
      }).toThrow('rseed must be 32 bytes');
    });
  });

  describe('deriveNullifierKey', () => {
    test('produces 32-byte nk', () => {
      const nsk = new Uint8Array(32).fill(1);
      const nk = deriveNullifierKey(nsk);

      expect(nk).toBeInstanceOf(Uint8Array);
      expect(nk.length).toBe(32);
    });

    test('is deterministic', () => {
      const nsk = new Uint8Array(32).fill(1);

      const nk1 = deriveNullifierKey(nsk);
      const nk2 = deriveNullifierKey(nsk);

      expect(bytesToHex(nk1)).toBe(bytesToHex(nk2));
    });
  });

  describe('createNote', () => {
    test('creates note with correct structure', () => {
      const address: SaplingPaymentAddress = {
        diversifier: new Uint8Array(11).fill(1),
        pkD: new Uint8Array(32).fill(2)
      };
      const value = 100000n;

      const note = createNote(address, value);

      expect(note.commitment).toBeInstanceOf(Uint8Array);
      expect(note.commitment.length).toBe(32);
      expect(note.value).toBe(Number(value));
      expect(note.rcm.length).toBe(32);
      expect(note.rseed.length).toBe(32);
      expect(note.cmu.length).toBe(32);
      expect(note.diversifier).toEqual(address.diversifier);
      expect(note.pkD).toEqual(address.pkD);
      expect(note.spent).toBe(false);
    });

    test('accepts optional memo', () => {
      const address: SaplingPaymentAddress = {
        diversifier: new Uint8Array(11).fill(1),
        pkD: new Uint8Array(32).fill(2)
      };
      const memo = new Uint8Array(100).fill(0x41); // 'A'

      const note = createNote(address, 100n, memo);

      expect(note.memo).toBeDefined();
      expect(note.memo!.slice(0, 100)).toEqual(memo);
    });
  });

  describe('encodeNotePlaintext', () => {
    test('produces 564-byte plaintext', () => {
      const note = {
        diversifier: new Uint8Array(11).fill(1),
        value: 100000,
        rseed: new Uint8Array(32).fill(2),
        memo: new Uint8Array(512).fill(0)
      };

      const plaintext = encodeNotePlaintext(note);

      expect(plaintext).toBeInstanceOf(Uint8Array);
      expect(plaintext.length).toBe(564);
    });

    test('lead byte is 0x02', () => {
      const note = {
        diversifier: new Uint8Array(11),
        value: 0,
        rseed: new Uint8Array(32),
        memo: new Uint8Array(512)
      };

      const plaintext = encodeNotePlaintext(note);

      expect(plaintext[0]).toBe(0x02);
    });
  });

  describe('decodeNotePlaintext', () => {
    test('correctly decodes encoded plaintext', () => {
      const original = {
        diversifier: new Uint8Array(11).fill(5),
        value: 123456,
        rseed: new Uint8Array(32).fill(7),
        memo: new Uint8Array(512).fill(0x42)
      };

      const encoded = encodeNotePlaintext(original);
      const decoded = decodeNotePlaintext(encoded);

      expect(decoded.leadByte).toBe(0x02);
      expect(decoded.diversifier).toEqual(original.diversifier);
      expect(decoded.value).toBe(BigInt(original.value));
      expect(decoded.rseed).toEqual(original.rseed);
    });

    test('throws on invalid length', () => {
      const invalidPlaintext = new Uint8Array(100);

      expect(() => {
        decodeNotePlaintext(invalidPlaintext);
      }).toThrow('Invalid plaintext length');
    });
  });

  describe('nullifier tracking', () => {
    test('isNullifierSpent returns false for unknown nullifier', () => {
      const spentNullifiers = new Set<string>();
      const nullifier = new Uint8Array(32).fill(1);

      expect(isNullifierSpent(nullifier, spentNullifiers)).toBe(false);
    });

    test('markNullifierSpent adds to set', () => {
      const spentNullifiers = new Set<string>();
      const nullifier = new Uint8Array(32).fill(1);

      markNullifierSpent(nullifier, spentNullifiers);

      expect(isNullifierSpent(nullifier, spentNullifiers)).toBe(true);
    });

    test('different nullifiers are tracked separately', () => {
      const spentNullifiers = new Set<string>();
      const nullifier1 = new Uint8Array(32).fill(1);
      const nullifier2 = new Uint8Array(32).fill(2);

      markNullifierSpent(nullifier1, spentNullifiers);

      expect(isNullifierSpent(nullifier1, spentNullifiers)).toBe(true);
      expect(isNullifierSpent(nullifier2, spentNullifiers)).toBe(false);
    });
  });
});

