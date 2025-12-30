import { describe, it, expect } from 'vitest';
import { jsonRepairStream, jsonRepairChunkedStream } from './web-stream.js';

// Helper to collect stream output
async function collectStream(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += value;
    }
    return result;
}

describe('Web Streams API', () => {
    it('should repair incomplete JSON through TransformStream', async () => {
        const input = '{"name": "test", "value": tru';

        const readable = new ReadableStream({
            start(controller) {
                controller.enqueue(input);
                controller.close();
            }
        });

        const repaired = readable.pipeThrough(jsonRepairStream());
        const result = await collectStream(repaired);

        expect(result).toBe('{"name": "test", "value": true}');
        expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle multiple chunks', async () => {
        const readable = new ReadableStream({
            start(controller) {
                controller.enqueue('{"a": ');
                controller.enqueue('1, "b"');
                controller.enqueue(': 2');
                controller.close();
            }
        });

        const repaired = readable.pipeThrough(jsonRepairStream());
        const result = await collectStream(repaired);

        expect(result).toBe('{"a": 1, "b": 2}');
        expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should call onRepair callback', async () => {
        const actions: string[] = [];

        const readable = new ReadableStream({
            start(controller) {
                controller.enqueue('{"a": tru');
                controller.close();
            }
        });

        const repaired = readable.pipeThrough(
            jsonRepairStream({
                onRepair: (action) => actions.push(action)
            })
        );

        await collectStream(repaired);

        expect(actions).toContain('fixed_literal');
        expect(actions).toContain('closed_object');
    });

    it('should output in chunks with jsonRepairChunkedStream', async () => {
        const longValue = 'x'.repeat(100);
        const input = `{"data": "${longValue}"}`;

        const readable = new ReadableStream({
            start(controller) {
                controller.enqueue(input);
                controller.close();
            }
        });

        const chunks: string[] = [];
        const repaired = readable.pipeThrough(jsonRepairChunkedStream(50));
        const reader = repaired.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.join('')).toBe(input);
    });

    it('should handle empty stream', async () => {
        const readable = new ReadableStream({
            start(controller) {
                controller.close();
            }
        });

        const repaired = readable.pipeThrough(jsonRepairStream());
        const result = await collectStream(repaired);

        expect(result).toBe('');
    });
});
