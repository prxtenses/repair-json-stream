import { describe, it, expect } from 'vitest';
import { repairJson } from './repair-json.js';

describe('repairJson', () => {
  describe('empty and valid input', () => {
    it('should return empty string for empty input', () => {
      expect(repairJson('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(repairJson('   ')).toBe('');
    });

    it('should return valid JSON unchanged', () => {
      expect(repairJson('{"a":1}')).toBe('{"a":1}');
      expect(repairJson('[1,2,3]')).toBe('[1,2,3]');
      expect(repairJson('"hello"')).toBe('"hello"');
      expect(repairJson('true')).toBe('true');
      expect(repairJson('false')).toBe('false');
      expect(repairJson('null')).toBe('null');
      expect(repairJson('123')).toBe('123');
    });
  });

  describe('unclosed strings', () => {
    it('should close an unclosed string', () => {
      expect(repairJson('"hello')).toBe('"hello"');
    });

    it('should close an unclosed string in an object value', () => {
      const result = repairJson('{"text": "Hello');
      expect(result).toBe('{"text": "Hello"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should close an unclosed string in an object key', () => {
      const result = repairJson('{"key');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle string with trailing backslash', () => {
      const result = repairJson('{"text": "test\\');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('escaped quotes inside strings', () => {
    it('should handle escaped quotes correctly', () => {
      const result = repairJson('{"text": "He said \\"Hello\\""}');
      expect(result).toBe('{"text": "He said \\"Hello\\""}');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle incomplete string with escaped quote', () => {
      const result = repairJson('{"text": "He said \\"Hello');
      expect(result).toBe('{"text": "He said \\"Hello"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('unclosed objects', () => {
    it('should close an unclosed empty object', () => {
      const result = repairJson('{');
      expect(result).toBe('{}');
    });

    it('should close an unclosed object with content', () => {
      const result = repairJson('{"a": 1');
      expect(result).toBe('{"a": 1}');
    });

    it('should close nested unclosed objects', () => {
      const result = repairJson('{"a": {"b": 1');
      expect(result).toBe('{"a": {"b": 1}}');
    });
  });

  describe('unclosed arrays', () => {
    it('should close an unclosed empty array', () => {
      expect(repairJson('[')).toBe('[]');
    });

    it('should close an unclosed array with content', () => {
      const result = repairJson('[1, 2, 3');
      expect(result).toBe('[1, 2, 3]');
    });
  });

  describe('trailing commas', () => {
    it('should remove trailing comma in array', () => {
      const result = repairJson('[1, 2,]');
      expect(result).toBe('[1, 2]');
    });

    it('should remove trailing comma in object', () => {
      const result = repairJson('{"a": 1,}');
      expect(result).toBe('{"a": 1}');
    });
  });

  describe('incomplete literals', () => {
    it('should complete "tru" to "true"', () => {
      const result = repairJson('{"val": tru');
      expect(result).toBe('{"val": true}');
    });

    it('should complete "fals" to "false"', () => {
      const result = repairJson('{"val": fals');
      expect(result).toBe('{"val": false}');
    });

    it('should complete "nul" to "null"', () => {
      const result = repairJson('{"val": nul');
      expect(result).toBe('{"val": null}');
    });
  });

  describe('single quotes', () => {
    it('should convert single-quoted strings to double quotes', () => {
      const result = repairJson("{'name': 'John'}");
      expect(result).toBe('{"name": "John"}');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('Python constants', () => {
    it('should convert None to null', () => {
      const result = repairJson('{"val": None}');
      expect(result).toBe('{"val": null}');
    });

    it('should convert True to true', () => {
      const result = repairJson('{"val": True}');
      expect(result).toBe('{"val": true}');
    });

    it('should convert False to false', () => {
      const result = repairJson('{"val": False}');
      expect(result).toBe('{"val": false}');
    });
  });

  describe('unquoted keys', () => {
    it('should quote unquoted keys', () => {
      const result = repairJson('{name: "John"}');
      expect(result).toBe('{"name": "John"}');
    });

    it('should handle multiple unquoted keys', () => {
      const result = repairJson('{name: "John", age: 30}');
      expect(result).toBe('{"name": "John", "age": 30}');
    });
  });

  describe('comments', () => {
    it('should strip single-line comments', () => {
      const result = repairJson('{"a": 1} // comment');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should strip multi-line comments', () => {
      const result = repairJson('{"a": /* comment */ 1}');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('ellipsis', () => {
    it('should strip ellipsis in arrays', () => {
      const result = repairJson('[1, 2, 3, ...]');
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual([1, 2, 3]);
    });

    it('should strip ellipsis in objects', () => {
      const result = repairJson('{"a": 1, ...}');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  // === PHASE 3 FEATURES ===

  describe('fenced code blocks', () => {
    it('should strip ```json code fence', () => {
      const input = '```json\n{"a": 1}\n```';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual({ a: 1 });
    });

    it('should handle incomplete code fence', () => {
      const input = '```json\n{"a": 1';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('JSONP', () => {
    it('should strip JSONP callback wrapper', () => {
      const input = 'callback({"a": 1})';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual({ a: 1 });
    });

    it('should strip JSONP with semicolon', () => {
      const input = 'myCallback([1, 2, 3]);';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual([1, 2, 3]);
    });
  });

  describe('MongoDB types', () => {
    it('should strip NumberLong wrapper', () => {
      const input = '{"count": NumberLong(123)}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual({ count: 123 });
    });

    it('should strip ObjectId wrapper', () => {
      const input = '{"_id": ObjectId("507f1f77bcf86cd799439011")}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should strip ISODate wrapper', () => {
      const input = '{"date": ISODate("2020-01-01T00:00:00Z")}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('string concatenation', () => {
    it('should concatenate two strings with +', () => {
      const input = '{"text": "hello" + "world"}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual({ text: 'helloworld' });
    });

    it('should concatenate multiple strings', () => {
      const input = '["a" + "b" + "c"]';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual(['abc']);
    });
  });

  describe('newline-delimited JSON (NDJSON)', () => {
    it('should wrap multiple objects in array', () => {
      const input = '{"a": 1}\n{"b": 2}';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('should wrap multiple arrays in array', () => {
      const input = '[1, 2]\n[3, 4]';
      const result = repairJson(input);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('should not wrap single object', () => {
      const input = '{"a": 1}';
      const result = repairJson(input);
      expect(result).toBe('{"a": 1}');
    });
  });
});
