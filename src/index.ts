/**
 * # repair-json-stream
 * 
 * High-performance, zero-dependency JSON repair for LLM streaming.
 * **1.9x faster** than alternatives.
 * 
 * When streaming responses from LLMs like OpenAI or Anthropic, JSON often arrives incomplete.
 * `JSON.parse()` crashes. **repair-json-stream** fixes it instantly.
 * 
 * ## What It Fixes
 * 
 * - Truncated strings: `{"text": "Hello` → `{"text": "Hello"}`
 * - Missing brackets: `{"a": [1, 2` → `{"a": [1, 2]}`
 * - Unquoted keys: `{name: "John"}` → `{"name": "John"}`
 * - Single quotes: `{'key': 'val'}` → `{"key": "val"}`
 * - Python constants: `None`, `True`, `False` → `null`, `true`, `false`
 * - Trailing commas: `[1, 2, 3,]` → `[1, 2, 3]`
 * - Comments: `{"a": 1} // comment` → `{"a": 1}`
 * - Fenced code blocks: ` ```json {...} ``` `
 * - JSONP wrappers: `callback({...})`
 * - MongoDB types: `NumberLong(123)` → `123`
 * - String concatenation: `"hello" + "world"` → `"helloworld"`
 * - NDJSON: Multiple JSON objects → array
 * 
 * ## Performance
 * 
 * | Benchmark | repair-json-stream | jsonrepair | Speedup |
 * |-----------|-------------------|------------|---------|
 * | Small (15 KB) | 0.9 ms | 2.6 ms | **2.9x** |
 * | Large (3.9 MB) | 309 ms | 421 ms | **1.4x** |
 * | Streaming | 366 ms | 681 ms | **1.9x** |
 * 
 * @module
 * 
 * @example Basic usage
 * ```ts
 * import { repairJson } from 'repair-json-stream';
 * 
 * const fixed = repairJson('{"name": "John');
 * // => '{"name": "John"}'
 * 
 * JSON.parse(fixed); // Works!
 * ```
 * 
 * @example Streaming API (Node.js)
 * ```ts
 * import { jsonrepairTransform } from 'repair-json-stream/stream';
 * import { pipeline } from 'stream';
 * 
 * pipeline(inputStream, jsonrepairTransform(), outputStream, callback);
 * ```
 */

// Main repair function
export { repairJson, preprocessJson } from './repair-json.js';

// Streaming API
export { jsonrepairTransform, createJsonRepairTransform } from './stream.js';
export type { JsonRepairTransformOptions } from './stream.js';
