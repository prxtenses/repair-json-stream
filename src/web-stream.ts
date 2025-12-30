/**
 * Web Streams API for repair-json-stream.
 * 
 * Standard TransformStream that works in Deno, Bun, Cloudflare Workers, and modern browsers.
 * 
 * @module
 * 
 * @example
 * ```ts
 * import { jsonRepairStream } from 'repair-json-stream/web-stream';
 * 
 * const response = await fetch('/api/llm');
 * const repairedStream = response.body
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(jsonRepairStream());
 * ```
 */

import { repairJson, RepairAction } from './repair-json.js';

export interface JsonRepairStreamOptions {
    /**
     * Optional callback to track repair actions
     */
    onRepair?: (action: RepairAction, index: number, context: string) => void;
}

/**
 * Creates a Web TransformStream that repairs incomplete JSON.
 * 
 * This buffers the entire input before processing, as JSON repair
 * requires seeing the full context. For true streaming with partial outputs,
 * use repairJson() directly on each chunk.
 * 
 * @example
 * ```typescript
 * // Browser/Deno/Bun/Cloudflare Workers
 * const stream = jsonRepairStream();
 * 
 * const readable = new ReadableStream({
 *   start(controller) {
 *     controller.enqueue('{"name": "test');
 *     controller.close();
 *   }
 * });
 * 
 * const repaired = readable.pipeThrough(stream);
 * const reader = repaired.getReader();
 * const { value } = await reader.read();
 * console.log(value); // '{"name": "test"}'
 * ```
 * 
 * @example
 * ```typescript
 * // With fetch streaming
 * const response = await fetch('/api/streaming-json');
 * const repairedStream = response.body
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(jsonRepairStream());
 * ```
 */
export function jsonRepairStream(options: JsonRepairStreamOptions = {}): TransformStream<string, string> {
    const { onRepair } = options;
    let buffer = '';

    return new TransformStream<string, string>({
        transform(chunk, _controller) {
            buffer += chunk;
        },

        flush(controller) {
            if (buffer.length > 0) {
                const repaired = repairJson(buffer, onRepair);
                controller.enqueue(repaired);
            }
        }
    });
}

/**
 * Creates a Web TransformStream that repairs JSON and outputs as chunks.
 * Useful for very large JSON where you want chunked output.
 * 
 * @param chunkSize - Size of output chunks in characters (default: 65536)
 */
export function jsonRepairChunkedStream(
    chunkSize = 65536,
    options: JsonRepairStreamOptions = {}
): TransformStream<string, string> {
    const { onRepair } = options;
    let buffer = '';

    return new TransformStream<string, string>({
        transform(chunk, _controller) {
            buffer += chunk;
        },

        flush(controller) {
            if (buffer.length > 0) {
                const repaired = repairJson(buffer, onRepair);

                // Output in chunks
                for (let i = 0; i < repaired.length; i += chunkSize) {
                    controller.enqueue(repaired.slice(i, i + chunkSize));
                }
            }
        }
    });
}

/**
 * Alias for consistency with Node.js API
 */
export const createJsonRepairStream = jsonRepairStream;
