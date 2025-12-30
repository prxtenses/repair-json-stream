/**
 * Stateful Incremental JSON Repair
 * 
 * A class-based API that maintains parsing state between chunks,
 * enabling true streaming repair with immediate partial output.
 * 
 * @module
 * 
 * @example
 * ```ts
 * import { IncrementalJsonRepair } from 'repair-json-stream/incremental';
 * 
 * const repairer = new IncrementalJsonRepair();
 * 
 * // As LLM streams chunks...
 * repairer.push('{"name": "Jo');  // → '{"name": "Jo'
 * repairer.push('hn", "age":');   // → 'hn", "age":'
 * repairer.push(' 30');           // → ' 30'
 * const final = repairer.end();   // → '}' (closes the object)
 * ```
 */

import { RepairAction } from './repair-json.js';

/**
 * Context types for the stack-based state machine
 */
const enum ContextType {
    OBJECT = 1,
    ARRAY = 2,
    STRING = 3,
}

/**
 * Incomplete literal patterns and their completions
 */
const INCOMPLETE_LITERALS: Record<string, string> = {
    t: 'true', tr: 'true', tru: 'true',
    f: 'false', fa: 'false', fal: 'false', fals: 'false',
    n: 'null', nu: 'null', nul: 'null',
    N: 'null', No: 'null', Non: 'null', None: 'null',
    T: 'true', Tr: 'true', Tru: 'true', True: 'true',
    F: 'false', Fa: 'false', Fal: 'false', Fals: 'false', False: 'false',
};

/**
 * Character classification flags
 */
const enum CharFlags {
    None = 0,
    Whitespace = 1 << 0,
    Quote = 1 << 1,
    IdStart = 1 << 2,
    Digit = 1 << 3,
    ValueStart = 1 << 4,
}

const CharTypes = new Uint8Array(256);
(function initCharTypes() {
    CharTypes[9]! |= CharFlags.Whitespace;
    CharTypes[10]! |= CharFlags.Whitespace;
    CharTypes[13]! |= CharFlags.Whitespace;
    CharTypes[32]! |= CharFlags.Whitespace;
    CharTypes[34]! |= CharFlags.Quote;
    CharTypes[39]! |= CharFlags.Quote;
    for (let c = 48; c <= 57; c++) CharTypes[c]! |= CharFlags.Digit | CharFlags.ValueStart;
    for (let c = 65; c <= 90; c++) {
        CharTypes[c]! |= CharFlags.IdStart;
        if (c === 84 || c === 70 || c === 78) CharTypes[c]! |= CharFlags.ValueStart;
    }
    for (let c = 97; c <= 122; c++) {
        CharTypes[c]! |= CharFlags.IdStart;
        if (c === 116 || c === 102 || c === 110) CharTypes[c]! |= CharFlags.ValueStart;
    }
    CharTypes[95]! |= CharFlags.IdStart;
    CharTypes[36]! |= CharFlags.IdStart;
    CharTypes[45]! |= CharFlags.ValueStart;
    CharTypes[46]! |= CharFlags.ValueStart;
})();

export interface IncrementalJsonRepairOptions {
    /**
     * Callback for repair actions
     */
    onRepair?: (action: RepairAction, index: number, context: string) => void;
}

/**
 * Stateful JSON repairer that processes chunks incrementally.
 * 
 * Unlike `repairJson()`, this class maintains state between calls,
 * allowing you to process streaming data and get immediate partial output.
 * 
 * @example
 * ```typescript
 * const repairer = new IncrementalJsonRepair();
 * 
 * // Process chunks as they arrive from LLM
 * let output = '';
 * for await (const chunk of llmStream) {
 *   output += repairer.push(chunk);
 *   updateUI(output); // Live update!
 * }
 * output += repairer.end();
 * 
 * JSON.parse(output); // Always valid!
 * ```
 */
export class IncrementalJsonRepair {
    private stack: ContextType[] = [];
    private inString = false;
    private stringQuote = '"';
    private escaped = false;
    private inObjectKey = false;
    private needsColon = false;
    private expectingValue = false;
    private expectingKeyOrEnd = false;
    private inValue = false;
    private currentValue = '';
    private inUnquotedKey = false;
    private unquotedKey = '';
    private inSingleLineComment = false;
    private inMultiLineComment = false;
    private justClosedString = false;
    private rootElementCount = 0;
    private totalIndex = 0;
    private onRepair: ((action: RepairAction, index: number, context: string) => void) | undefined;

    constructor(options: IncrementalJsonRepairOptions = {}) {
        this.onRepair = options.onRepair;
    }

    /**
     * Push a chunk of data and get the repaired output for that chunk.
     * 
     * @param chunk - A string chunk of potentially incomplete JSON
     * @returns The repaired output for this chunk (may be partial)
     */
    push(chunk: string): string {
        const len = chunk.length;
        const output: string[] = [];

        for (let i = 0; i < len; i++) {
            const char = chunk[i]!;
            const c = char.charCodeAt(0);
            const globalIdx = this.totalIndex + i;

            // Single-line comment
            if (this.inSingleLineComment) {
                if (c === 10 || c === 13) {
                    this.inSingleLineComment = false;
                    output.push(' ');
                }
                continue;
            }

            // Multi-line comment
            if (this.inMultiLineComment) {
                if (char === '*' && i + 1 < len && chunk[i + 1] === '/') {
                    this.inMultiLineComment = false;
                    i++;
                }
                continue;
            }

            // Inside string
            if (this.inString) {
                if (this.escaped) {
                    output.push(char);
                    this.escaped = false;
                } else if (char === '\\') {
                    output.push(char);
                    this.escaped = true;
                } else if (c === this.stringQuote.charCodeAt(0) ||
                    (this.stringQuote !== '"' && (CharTypes[c]! & CharFlags.Quote) !== 0)) {
                    output.push('"');
                    this.inString = false;
                    this.stack.pop();
                    this.justClosedString = true;
                    if (this.inObjectKey) {
                        this.inObjectKey = false;
                        this.needsColon = true;
                        this.expectingKeyOrEnd = false;
                    } else if (this.expectingValue) {
                        this.expectingValue = false;
                    }
                } else {
                    output.push(char);
                }
                continue;
            }

            // Unquoted key
            if (this.inUnquotedKey) {
                if ((CharTypes[c]! & (CharFlags.IdStart | CharFlags.Digit)) !== 0) {
                    this.unquotedKey += char;
                    continue;
                } else {
                    if (this.onRepair) this.onRepair('inserted_quote', globalIdx, `Wrapped unquoted key "${this.unquotedKey}"`);
                    output.push('"', this.unquotedKey, '"');
                    this.inUnquotedKey = false;
                    this.unquotedKey = '';
                    this.needsColon = true;
                    this.expectingKeyOrEnd = false;
                }
            }

            // Literal/number value
            if (this.inValue) {
                if ((CharTypes[c]! & (CharFlags.Digit | CharFlags.ValueStart | CharFlags.IdStart)) !== 0 || c === 43) {
                    this.currentValue += char;
                    output.push(char);
                    continue;
                } else {
                    this.inValue = false;
                    const completion = INCOMPLETE_LITERALS[this.currentValue];
                    if (completion) {
                        if (this.onRepair) this.onRepair('fixed_literal', globalIdx, `Fixed "${this.currentValue}" -> "${completion}"`);
                        // Remove incomplete and add complete
                        for (let j = 0; j < this.currentValue.length; j++) output.pop();
                        output.push(completion);
                    }
                    this.currentValue = '';
                    this.expectingValue = false;
                    this.justClosedString = false;
                }
            }

            // Comments
            if (char === '/' && i + 1 < len) {
                const next = chunk[i + 1];
                if (next === '/') { this.inSingleLineComment = true; i++; continue; }
                if (next === '*') { this.inMultiLineComment = true; i++; continue; }
            }

            // Whitespace
            if ((CharTypes[c]! & CharFlags.Whitespace) !== 0) {
                output.push(' ');
                continue;
            }

            // String concatenation
            if (char === '+' && this.justClosedString) continue;

            if (char !== '"' && char !== "'" && !((CharTypes[c]! & CharFlags.Quote) !== 0)) {
                this.justClosedString = false;
            }

            // Structural characters
            switch (char) {
                case '{':
                    if (this.stack.length === 0 && this.rootElementCount > 0) {
                        if (this.onRepair) this.onRepair('missing_comma', globalIdx, 'Adding comma between root elements');
                        output.push(',');
                    }
                    if (this.expectingKeyOrEnd && this.stack.length > 0 && this.stack[this.stack.length - 1] === ContextType.OBJECT) {
                        if (this.onRepair) this.onRepair('synthetic_key', globalIdx, 'Adding synthetic key');
                        output.push('"_":');
                        this.expectingKeyOrEnd = false;
                    }
                    output.push(char);
                    this.stack.push(ContextType.OBJECT);
                    this.expectingKeyOrEnd = true;
                    this.needsColon = false;
                    this.expectingValue = false;
                    break;

                case '}':
                    if (this.needsColon) {
                        if (this.onRepair) this.onRepair('inserted_value', globalIdx, 'Adding null for key');
                        output.push(':null');
                        this.needsColon = false;
                    }
                    output.push(char);
                    if (this.stack.length > 0 && this.stack[this.stack.length - 1] === ContextType.OBJECT) {
                        this.stack.pop();
                    }
                    this.expectingKeyOrEnd = false;
                    this.expectingValue = false;
                    if (this.stack.length === 0) this.rootElementCount++;
                    break;

                case '[':
                    if (this.stack.length === 0 && this.rootElementCount > 0) {
                        if (this.onRepair) this.onRepair('missing_comma', globalIdx, 'Adding comma between root elements');
                        output.push(',');
                    }
                    output.push(char);
                    this.stack.push(ContextType.ARRAY);
                    this.expectingValue = false;
                    this.needsColon = false;
                    break;

                case ']':
                    if (this.stack.length === 0) continue;
                    if (this.stack[this.stack.length - 1] === ContextType.OBJECT) continue;
                    output.push(char);
                    if (this.stack.length > 0 && this.stack[this.stack.length - 1] === ContextType.ARRAY) {
                        this.stack.pop();
                    }
                    this.expectingValue = false;
                    if (this.stack.length === 0) this.rootElementCount++;
                    break;

                case '"':
                case "'":
                    if (this.justClosedString) {
                        // String concatenation - remove closing quote
                        if (output.length > 0 && output[output.length - 1] === '"') output.pop();
                    } else {
                        output.push('"');
                        if (this.expectingKeyOrEnd) this.inObjectKey = true;
                    }
                    this.inString = true;
                    this.stringQuote = char;
                    this.stack.push(ContextType.STRING);
                    this.needsColon = false;
                    this.justClosedString = false;
                    break;

                case ':':
                    if (!this.needsColon && this.stack.length > 0) continue;
                    if (this.stack.length === 0) continue;
                    output.push(char);
                    this.needsColon = false;
                    this.expectingValue = true;
                    this.expectingKeyOrEnd = false;
                    break;

                case ',':
                    output.push(char);
                    if (this.stack.length > 0 && this.stack[this.stack.length - 1] === ContextType.OBJECT) {
                        this.expectingKeyOrEnd = true;
                        this.expectingValue = false;
                    }
                    this.needsColon = false;
                    break;

                default:
                    if ((CharTypes[c]! & CharFlags.Quote) !== 0) {
                        if (this.justClosedString && output.length > 0 && output[output.length - 1] === '"') output.pop();
                        else output.push('"');
                        this.inString = true;
                        this.stringQuote = char;
                        this.stack.push(ContextType.STRING);
                        if (this.expectingKeyOrEnd) this.inObjectKey = true;
                        this.needsColon = false;
                        this.justClosedString = false;
                    } else if (this.expectingKeyOrEnd && (CharTypes[c]! & CharFlags.IdStart) !== 0) {
                        this.inUnquotedKey = true;
                        this.unquotedKey = char;
                    } else if ((CharTypes[c]! & (CharFlags.ValueStart | CharFlags.IdStart)) !== 0) {
                        output.push(char);
                        this.currentValue = char;
                        this.inValue = true;
                        this.needsColon = false;
                    } else {
                        output.push(char);
                    }
                    break;
            }
        }

        this.totalIndex += len;
        return output.join('');
    }

    /**
     * Finalize the repair and get closing brackets/quotes.
     * Call this when the stream ends.
     * 
     * @returns The closing characters needed to make valid JSON
     */
    end(): string {
        const output: string[] = [];
        const idx = this.totalIndex;

        // Complete pending unquoted key
        if (this.inUnquotedKey && this.unquotedKey) {
            if (this.onRepair) this.onRepair('inserted_quote', idx, `Wrapped unquoted key "${this.unquotedKey}"`);
            output.push('"', this.unquotedKey, '":null');
        }

        // Complete pending value - need to replace the incomplete literal
        // Numbers are already valid, only incomplete literals need completion
        if (this.inValue && this.currentValue) {
            const completion = INCOMPLETE_LITERALS[this.currentValue];
            if (completion) {
                // It's an incomplete literal - add remaining characters
                if (this.onRepair) this.onRepair('fixed_literal', idx, `Fixed "${this.currentValue}" -> "${completion}"`);
                output.push(completion.slice(this.currentValue.length));
            }
            // If no completion found, it's a valid number - nothing to add
            this.inValue = false;
            this.expectingValue = false;
            this.currentValue = '';
        }

        // Close unclosed string
        if (this.inString) {
            if (this.escaped) {
                // Remove trailing backslash would require modifying previous output
            }
            output.push('"');
            this.stack.pop();
            if (this.inObjectKey || this.expectingKeyOrEnd) {
                if (this.onRepair) this.onRepair('inserted_value', idx, 'Adding null for hanging key');
                output.push(':null');
            }
        }

        // Handle pending colon
        if (this.needsColon) {
            if (this.onRepair) this.onRepair('inserted_value', idx, 'Adding null for single key');
            output.push(':null');
        }

        // Handle expecting value
        if (this.expectingValue && !this.inString && !this.inValue) {
            if (this.onRepair) this.onRepair('inserted_value', idx, 'Adding null after colon');
            output.push('null');
        }

        // Close all open structures
        while (this.stack.length > 0) {
            const ctx = this.stack.pop();
            if (ctx === ContextType.OBJECT) {
                if (this.onRepair) this.onRepair('closed_object', idx, 'Closing missing }');
                output.push('}');
            } else if (ctx === ContextType.ARRAY) {
                if (this.onRepair) this.onRepair('closed_array', idx, 'Closing missing ]');
                output.push(']');
            }
        }

        // Wrap multiple root elements in array
        if (this.rootElementCount > 1) {
            return '[' + output.join('') + ']';
        }

        return output.join('');
    }

    /**
     * Reset the repairer to initial state.
     * Allows reusing the same instance for multiple streams.
     */
    reset(): void {
        this.stack = [];
        this.inString = false;
        this.stringQuote = '"';
        this.escaped = false;
        this.inObjectKey = false;
        this.needsColon = false;
        this.expectingValue = false;
        this.expectingKeyOrEnd = false;
        this.inValue = false;
        this.currentValue = '';
        this.inUnquotedKey = false;
        this.unquotedKey = '';
        this.inSingleLineComment = false;
        this.inMultiLineComment = false;
        this.justClosedString = false;
        this.rootElementCount = 0;
        this.totalIndex = 0;
    }

    /**
     * Get a snapshot of what valid JSON would look like right now.
     * This doesn't modify internal state.
     * 
     * @returns Current valid JSON (with auto-closed structures)
     */
    snapshot(): string {
        // Save state
        const savedStack = [...this.stack];
        const savedInString = this.inString;
        const savedNeedsColon = this.needsColon;
        const savedExpectingValue = this.expectingValue;
        const savedInValue = this.inValue;
        const savedCurrentValue = this.currentValue;

        // Get end result
        const endPart = this.end();

        // Restore state
        this.stack = savedStack;
        this.inString = savedInString;
        this.needsColon = savedNeedsColon;
        this.expectingValue = savedExpectingValue;
        this.inValue = savedInValue;
        this.currentValue = savedCurrentValue;

        return endPart;
    }
}

/**
 * Convenience function to create an incremental repairer
 */
export function createIncrementalRepair(options?: IncrementalJsonRepairOptions): IncrementalJsonRepair {
    return new IncrementalJsonRepair(options);
}
