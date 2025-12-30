/**
 * repair-json-stream
 * High-performance, zero-dependency utility for repairing incomplete JSON strings
 */

// Main repair function
export { repairJson, preprocessJson } from './repair-json.js';

// Streaming API
export { jsonrepairTransform, createJsonRepairTransform } from './stream.js';
export type { JsonRepairTransformOptions } from './stream.js';
