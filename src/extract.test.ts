import { describe, it, expect } from 'vitest';
import { extractJson, extractAllJson, containsJson, stripLlmWrapper } from './extract.js';

describe('LLM Garbage Filtering', () => {
    describe('extractJson', () => {
        it('should extract JSON object from prose', () => {
            const input = 'Sure! Here is the data: {"name": "John", "age": 30} Hope this helps!';
            const result = extractJson(input);
            expect(result).toBe('{"name": "John", "age": 30}');
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should extract JSON array from prose', () => {
            const input = 'The numbers are: [1, 2, 3, 4, 5] as you requested.';
            const result = extractJson(input);
            expect(result).toBe('[1, 2, 3, 4, 5]');
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should handle nested structures', () => {
            const input = 'Result: {"data": {"items": [1, 2, {"nested": true}]}} Done!';
            const result = extractJson(input);
            expect(result).toBe('{"data": {"items": [1, 2, {"nested": true}]}}');
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should strip thinking blocks', () => {
            const input = '<thought>Let me think about this...</thought>\n{"result": true}';
            const result = extractJson(input);
            expect(result).toBe('{"result": true}');
        });

        it('should strip multiple thinking block types', () => {
            const input = '<thinking>hmm</thinking><scratchpad>notes</scratchpad>{"a": 1}';
            const result = extractJson(input);
            expect(result).toBe('{"a": 1}');
        });

        it('should return original if no JSON found', () => {
            const input = 'This is just plain text with no JSON.';
            const result = extractJson(input);
            expect(result).toBe(input);
        });

        it('should handle strings containing braces', () => {
            const input = 'Data: {"message": "Hello {world}!"}';
            const result = extractJson(input);
            expect(result).toBe('{"message": "Hello {world}!"}');
            expect(() => JSON.parse(result)).not.toThrow();
        });

        it('should prefer largest block when option is set', () => {
            const input = '{"a": 1} and also {"b": 2, "c": 3}';
            const result = extractJson(input, { preferLargest: true });
            expect(result).toBe('{"b": 2, "c": 3}');
        });

        it('should handle incomplete JSON blocks', () => {
            const input = 'Here is: {"name": "truncated';
            const result = extractJson(input);
            expect(result).toBe('{"name": "truncated');
        });
    });

    describe('extractAllJson', () => {
        it('should extract multiple JSON blocks', () => {
            const input = 'First: {"a": 1} Second: {"b": 2} Third: [3]';
            const results = extractAllJson(input);
            expect(results).toEqual(['{"a": 1}', '{"b": 2}', '[3]']);
        });

        it('should handle no JSON', () => {
            const input = 'No JSON here';
            const results = extractAllJson(input);
            expect(results).toEqual([]);
        });
    });

    describe('containsJson', () => {
        it('should return true for object', () => {
            expect(containsJson('{"a": 1}')).toBe(true);
        });

        it('should return true for array', () => {
            expect(containsJson('[1, 2, 3]')).toBe(true);
        });

        it('should return true for JSON in prose', () => {
            expect(containsJson('Here: {"test": true}')).toBe(true);
        });

        it('should return false for plain text', () => {
            expect(containsJson('Just some text')).toBe(false);
        });

        it('should return false for empty braces in prose (edge case)', () => {
            // This is a heuristic, might have false positives
            expect(containsJson('Function call: foo()')).toBe(false);
        });
    });

    describe('stripLlmWrapper', () => {
        it('should strip markdown code blocks', () => {
            const input = '```json\n{"a": 1}\n```';
            const result = stripLlmWrapper(input);
            expect(result).toBe('{"a": 1}');
        });

        it('should strip common LLM phrases', () => {
            const input = "Here's the JSON:\n{\"a\": 1}\nHope this helps!";
            const result = stripLlmWrapper(input);
            expect(result).toBe('{"a": 1}');
        });

        it('should handle complex wrapper', () => {
            const input = '<thinking>reasoning</thinking>\n```json\n{"result": true}\n```\nLet me know if you need anything else!';
            const result = stripLlmWrapper(input);
            expect(result).toBe('{"result": true}');
        });
    });
});
