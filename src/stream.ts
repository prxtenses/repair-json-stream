/**
 * Streaming API for repair-json-stream.
 * 
 * Node.js Transform stream that repairs JSON on-the-fly.
 * 
 * @module
 * 
 * @example
 * ```ts
 * import { jsonrepairTransform } from 'repair-json-stream/stream';
 * import { pipeline } from 'stream';
 * 
 * pipeline(inputStream, jsonrepairTransform(), outputStream, callback);
 * ```
 */

import { Transform, TransformCallback, TransformOptions } from 'stream';
import { repairJson } from './repair-json.js';

export interface JsonRepairTransformOptions extends TransformOptions {
  /**
   * Size of output chunks in bytes (default: 65536)
   */
  chunkSize?: number;
}

/**
 * Creates a Transform stream that repairs incomplete JSON.
 *
 * Note: This buffers the entire input before processing, as JSON repair
 * requires seeing the full context. For true streaming with partial outputs,
 * use repairJson() directly on each chunk.
 *
 * @example
 * ```typescript
 * import { createReadStream, createWriteStream } from 'fs';
 * import { pipeline } from 'stream';
 * import { jsonrepairTransform } from 'repair-json-stream/stream';
 *
 * pipeline(
 *   createReadStream('broken.json'),
 *   jsonrepairTransform(),
 *   createWriteStream('repaired.json'),
 *   (err) => console.log(err || 'done')
 * );
 * ```
 */
export function jsonrepairTransform(options: JsonRepairTransformOptions = {}): Transform {
  const { chunkSize = 65536, ...transformOptions } = options;

  let buffer = '';

  return new Transform({
    ...transformOptions,

    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback) {
      buffer += chunk.toString();
      callback();
    },

    flush(callback: TransformCallback) {
      try {
        const repaired = repairJson(buffer);

        // Output in chunks
        for (let i = 0; i < repaired.length; i += chunkSize) {
          this.push(repaired.slice(i, i + chunkSize));
        }

        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/**
 * Alias matching jsonrepair's API
 */
export const createJsonRepairTransform = jsonrepairTransform;
