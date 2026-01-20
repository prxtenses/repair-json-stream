/**
 * High-performance, zero-dependency JSON repair for LLM streaming.
 * 
 * Repairs incomplete/malformed JSON strings from streaming LLM responses.
 * 
 * @module
 * 
 * @example
 * ```ts
 * import { repairJson } from 'repair-json-stream';
 * 
 * const fixed = repairJson('{"name": "John');
 * // => '{"name": "John"}'
 * ```
 */

// Main repair function
export { repairJson, preprocessJson } from './repair-json.js';
export type { RepairAction } from './repair-json.js';
