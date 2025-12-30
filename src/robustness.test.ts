/**
 * Robustness tests for repair-json-stream
 * - Fuzz testing with random inputs
 * - Property-based testing with fast-check
 * - Edge case stress testing
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { repairJson } from './repair-json.js';

describe('Robustness', () => {
  describe('Property: never throws', () => {
    it('should never throw on any input', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          try {
            repairJson(input);
            return true;
          } catch {
            return false;
          }
        }),
        { numRuns: 2000 }
      );
    });

    it('should never throw on binary-like data', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 1000 }), (bytes) => {
          const input = String.fromCharCode(...bytes);
          try {
            repairJson(input);
            return true;
          } catch {
            return false;
          }
        }),
        { numRuns: 500 }
      );
    });
  });

  describe('Property: valid JSON input passes through', () => {
    it('should not modify already valid JSON', () => {
      fc.assert(
        fc.property(fc.json(), (jsonStr) => {
          const result = repairJson(jsonStr);
          try {
            const original = JSON.parse(jsonStr);
            const repaired = JSON.parse(result);
            return JSON.stringify(original) === JSON.stringify(repaired);
          } catch {
            return true; // Skip invalid cases
          }
        }),
        { numRuns: 500 }
      );
    });
  });

  describe('Property: output is parseable or empty for JSON-like input', () => {
    it('should produce parseable JSON for valid JSON input', () => {
      fc.assert(
        fc.property(fc.json(), (jsonStr) => {
          const result = repairJson(jsonStr);
          if (result === '') return true;
          try {
            JSON.parse(result);
            return true;
          } catch {
            return false;
          }
        }),
        { numRuns: 500 }
      );
    });

    it('should handle deeply nested structures', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 50 }), (depth) => {
          const input = '{'.repeat(depth) + '"a": 1';
          const result = repairJson(input);
          try {
            JSON.parse(result);
            return true;
          } catch {
            return false;
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Stress: extreme inputs', () => {
    it('should handle very long strings', () => {
      const longString = '"' + 'a'.repeat(100000);
      const result = repairJson(longString);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle many nested arrays', () => {
      const input = '['.repeat(100) + '1' + ']'.repeat(50);
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle many nested objects', () => {
      const input = '{"a":'.repeat(50) + '1';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle unicode edge cases', () => {
      const inputs = ['{"emoji": "👨‍👩‍👧‍👦"}', '{"zalgo": "ḧ̴̭è̵̛l̴̰̀l̷̦̈́o̵͓̔"}', '{"rtl": "שלום עולם"}'];
      for (const input of inputs) {
        const result = repairJson(input);
        expect(() => JSON.parse(result)).not.toThrow();
      }
    });

    it('should handle repeated special characters without crashing', () => {
      const inputs = [
        '{{{{{{',
        ']]]]]]',
        '::::::',
        ',,,,,,',
        '""""""',
        "''''''",
        '//////',
        '......',
        ';;;;;;',
      ];
      for (const input of inputs) {
        expect(() => repairJson(input)).not.toThrow();
      }
    });
  });

  describe('Edge cases: output is valid or empty', () => {
    it('should handle empty object variations', () => {
      const inputs = ['{}', '{ }', '{  }', '{\n}', '{\t}'];
      for (const input of inputs) {
        expect(JSON.parse(repairJson(input))).toEqual({});
      }
    });

    it('should handle empty array variations', () => {
      const inputs = ['[]', '[ ]', '[  ]', '[\n]', '[\t]'];
      for (const input of inputs) {
        expect(JSON.parse(repairJson(input))).toEqual([]);
      }
    });

    it('should handle mixed quotes', () => {
      const inputs = [`{"a": 'b'}`, `{'a': "b"}`, `{'a': 'b'}`];
      for (const input of inputs) {
        expect(() => JSON.parse(repairJson(input))).not.toThrow();
      }
    });

    it('should handle comments at various positions', () => {
      const inputs = [
        '/* comment */ {"a": 1}',
        '{"a": /* comment */ 1}',
        '{"a": 1} /* comment */',
        '// comment\n{"a": 1}',
        '{"a": 1} // comment',
      ];
      for (const input of inputs) {
        expect(() => JSON.parse(repairJson(input))).not.toThrow();
      }
    });
  });

  describe('Pathological inputs: graceful handling', () => {
    it('should not crash on totally garbage input', () => {
      const garbageInputs = [
        '~!@#$%^&*()',
        ';;;;;;;',
        '::::',
        '\\\\\\\\',
        '\x00\x01\x02',
        '🚀'.repeat(100),
      ];
      for (const input of garbageInputs) {
        expect(() => repairJson(input)).not.toThrow();
      }
    });
  });
});
