/**
 * LLM Output Extraction Utilities
 * 
 * Robust heuristics to extract JSON from messy LLM outputs that contain
 * prose, thinking blocks, or other non-JSON content.
 * 
 * @module
 * 
 * @example
 * ```ts
 * import { extractJson, extractAllJson } from 'repair-json-stream/extract';
 * 
 * const messy = 'Sure! Here is the data: {"name": "John"} Hope this helps!';
 * const clean = extractJson(messy); // '{"name": "John"}'
 * ```
 */

/**
 * Options for JSON extraction
 */
export interface ExtractJsonOptions {
    /**
     * If true, also strip common LLM "thinking" blocks like <thought>...</thought>
     * @default true
     */
    stripThinkingBlocks?: boolean;

    /**
     * If true, prefer the largest JSON block found (by character count)
     * @default false
     */
    preferLargest?: boolean;
}

/**
 * Common thinking block patterns used by various LLMs
 */
const THINKING_PATTERNS = [
    /<thought>[\s\S]*?<\/thought>/gi,
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /<think>[\s\S]*?<\/think>/gi,
    /<reasoning>[\s\S]*?<\/reasoning>/gi,
    /<scratchpad>[\s\S]*?<\/scratchpad>/gi,
    /<internal>[\s\S]*?<\/internal>/gi,
];

/**
 * Extracts the first valid JSON object or array from a string containing prose.
 * 
 * Handles common LLM output patterns like:
 * - "Here's the JSON: {...}"
 * - "```json\n{...}\n```"
 * - "<thought>thinking...</thought>\n{...}"
 * 
 * @param input - Raw LLM output that may contain prose around JSON
 * @param options - Extraction options
 * @returns The extracted JSON string, or the original input if no JSON found
 * 
 * @example
 * ```typescript
 * // Basic extraction
 * extractJson('Sure! {"name": "John"} Hope this helps!')
 * // → '{"name": "John"}'
 * 
 * // With thinking blocks
 * extractJson('<thought>Let me think...</thought>\n{"result": true}')
 * // → '{"result": true}'
 * 
 * // Array extraction
 * extractJson('The data is: [1, 2, 3] as requested.')
 * // → '[1, 2, 3]'
 * ```
 */
export function extractJson(input: string, options: ExtractJsonOptions = {}): string {
    const { stripThinkingBlocks = true, preferLargest = false } = options;

    let text = input;

    // Strip thinking blocks if enabled
    if (stripThinkingBlocks) {
        for (const pattern of THINKING_PATTERNS) {
            text = text.replace(pattern, '');
        }
    }

    // Find all JSON blocks
    const blocks = findJsonBlocks(text);

    if (blocks.length === 0) {
        return input; // No JSON found, return original
    }

    if (preferLargest) {
        // Return the largest block
        return blocks.reduce((a, b) => a.length > b.length ? a : b);
    }

    // Return the first block
    return blocks[0]!;
}

/**
 * Extracts ALL JSON objects/arrays from a string.
 * Useful when LLM outputs multiple JSON blocks.
 * 
 * @param input - Raw LLM output that may contain multiple JSON blocks
 * @param options - Extraction options
 * @returns Array of extracted JSON strings
 * 
 * @example
 * ```typescript
 * extractAllJson('First: {"a": 1} Second: {"b": 2}')
 * // → ['{"a": 1}', '{"b": 2}']
 * ```
 */
export function extractAllJson(input: string, options: ExtractJsonOptions = {}): string[] {
    const { stripThinkingBlocks = true } = options;

    let text = input;

    if (stripThinkingBlocks) {
        for (const pattern of THINKING_PATTERNS) {
            text = text.replace(pattern, '');
        }
    }

    return findJsonBlocks(text);
}

/**
 * Finds all balanced JSON blocks in a string.
 * Uses bracket counting to handle nested structures.
 */
function findJsonBlocks(input: string): string[] {
    const blocks: string[] = [];
    const len = input.length;
    let i = 0;

    while (i < len) {
        const char = input[i];

        // Look for start of JSON
        if (char === '{' || char === '[') {
            const closeChar = char === '{' ? '}' : ']';
            const start = i;
            let depth = 1;
            let inString = false;
            let escaped = false;
            i++;

            while (i < len && depth > 0) {
                const c = input[i];

                if (escaped) {
                    escaped = false;
                } else if (c === '\\' && inString) {
                    escaped = true;
                } else if (c === '"' && !escaped) {
                    inString = !inString;
                } else if (!inString) {
                    if (c === char) {
                        depth++;
                    } else if (c === closeChar) {
                        depth--;
                    }
                }
                i++;
            }

            // Found a complete block
            if (depth === 0) {
                blocks.push(input.slice(start, i));
            } else {
                // Incomplete block - include it anyway (will be repaired later)
                blocks.push(input.slice(start));
            }
        } else {
            i++;
        }
    }

    return blocks;
}

/**
 * Checks if a string likely contains JSON.
 * Fast heuristic check without full parsing.
 * 
 * @param input - String to check
 * @returns true if the string likely contains JSON
 */
export function containsJson(input: string): boolean {
    // Quick check for { or [
    const hasStart = /[{\[]/.test(input);
    if (!hasStart) return false;

    // Check for common JSON patterns
    return /[{\[]\s*("|\d|true|false|null|[{\[])/.test(input);
}

/**
 * Strips common LLM wrapper text and returns just the JSON.
 * More aggressive than extractJson - removes markdown, code blocks, etc.
 * 
 * @param input - Raw LLM output
 * @returns Cleaned JSON string
 */
export function stripLlmWrapper(input: string): string {
    let text = input;

    // Remove thinking blocks
    for (const pattern of THINKING_PATTERNS) {
        text = text.replace(pattern, '');
    }

    // Remove markdown code blocks
    text = text.replace(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/g, '$1');

    // Remove common prose patterns
    text = text.replace(/^(?:Here(?:'s| is) (?:the |your )?(?:JSON|data|response|result)[:\s]*)/im, '');
    text = text.replace(/(?:Hope this helps!?|Let me know if you (?:need|have) .*?|Is there anything else.*?)$/im, '');

    // Extract JSON
    return extractJson(text.trim());
}
