/**
 * repair-json-stream
 * High-performance, zero-dependency utility for repairing incomplete JSON strings
 */

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
 * Includes Python constants: None, True, False
 */
const INCOMPLETE_LITERALS: Record<string, string> = {
  // JavaScript/JSON literals
  t: 'true',
  tr: 'true',
  tru: 'true',
  f: 'false',
  fa: 'false',
  fal: 'false',
  fals: 'false',
  n: 'null',
  nu: 'null',
  nul: 'null',
  // Python constants
  N: 'null',
  No: 'null',
  Non: 'null',
  None: 'null',
  T: 'true',
  Tr: 'true',
  Tru: 'true',
  True: 'true',
  F: 'false',
  Fa: 'false',
  Fal: 'false',
  Fals: 'false',
  False: 'false',
};

/**
 * MongoDB wrapper function names that should be stripped
 */
const MONGO_WRAPPERS = new Set([
  'NumberLong',
  'NumberInt',
  'NumberDecimal',
  'ObjectId',
  'ISODate',
  'Date',
  'Timestamp',
  'BinData',
  'UUID',
  'DBRef',
  'MinKey',
  'MaxKey',
  'RegExp',
]);

/**
 * Check if character is a quote (single, double, or special Unicode quotes)
 */
function isQuoteChar(c: number): boolean {
  return (
    c === 34 || // "
    c === 39 || // '
    c === 8220 || // "
    c === 8221 || // "
    c === 8216 || // '
    c === 8217
  ); // '
}

/**
 * Check if character can start an identifier (for unquoted keys)
 */
function isIdentifierStart(c: number): boolean {
  return (
    (c >= 65 && c <= 90) || // A-Z
    (c >= 97 && c <= 122) || // a-z
    c === 95 || // _
    c === 36
  ); // $
}

/**
 * Check if character can continue an identifier
 */
function isIdentifierChar(c: number): boolean {
  return isIdentifierStart(c) || (c >= 48 && c <= 57); // + 0-9
}

/**
 * Check if character is whitespace
 */
function isWhitespace(c: number): boolean {
  return (
    c === 32 ||
    c === 9 ||
    c === 10 ||
    c === 13 || // space, tab, LF, CR
    c === 160 || // non-breaking space
    c === 8239 || // narrow no-break space
    c === 8287 || // medium mathematical space
    c === 12288
  ); // ideographic space
}

/**
 * Pre-process input to handle fenced code blocks, JSONP, and escaped JSON.
 * Exposed for advanced users who want to apply preprocessing separately.
 *
 * @param input - Raw input string
 * @returns Preprocessed string with fenced blocks, JSONP, and escapes handled
 *
 * @example
 * preprocessJson('```json\n{"a": 1}\n```')
 * // => '{"a": 1}'
 *
 * @example
 * preprocessJson('callback({"a": 1})')
 * // => '{"a": 1}'
 */
export function preprocessJson(input: string): string {
  let str = input;
  let len = str.length;

  // 1. Strip fenced code blocks (```json ... ```)
  let start = 0;
  while (start < len && isWhitespace(str.charCodeAt(start))) start++;

  if (start + 2 < len && str[start] === '`' && str[start + 1] === '`' && str[start + 2] === '`') {
    // Find end of language identifier line
    let contentStart = start + 3;
    while (contentStart < len && str[contentStart] !== '\n' && str[contentStart] !== '\r') {
      contentStart++;
    }
    // Skip the newline
    if (contentStart < len) contentStart++;

    // Find closing fence
    const closeIdx = str.indexOf('```', contentStart);
    if (closeIdx !== -1) {
      str = str.substring(contentStart, closeIdx);
    } else {
      str = str.substring(contentStart); // No closing fence
    }
    len = str.length;
    start = 0;
    while (start < len && isWhitespace(str.charCodeAt(start))) start++;
  }

  // 2. Strip JSONP wrapper (callback({...}) or callback([...]))
  if (start < len && isIdentifierStart(str.charCodeAt(start))) {
    let p = start;
    while (p < len && isIdentifierChar(str.charCodeAt(p))) p++;

    // Skip whitespace
    while (p < len && isWhitespace(str.charCodeAt(p))) p++;

    if (p < len && str[p] === '(') {
      // Could be JSONP! Look for { or [
      let jsonStart = p + 1;
      while (jsonStart < len && isWhitespace(str.charCodeAt(jsonStart))) jsonStart++;

      if (jsonStart < len && (str[jsonStart] === '{' || str[jsonStart] === '[')) {
        // It's JSONP - extract content
        str = str.substring(jsonStart);
        len = str.length;

        // Strip trailing ); or )
        let end = len - 1;
        while (end >= 0 && isWhitespace(str.charCodeAt(end))) end--;
        if (end >= 0 && str[end] === ';') end--;
        while (end >= 0 && isWhitespace(str.charCodeAt(end))) end--;
        if (end >= 0 && str[end] === ')') end--;

        str = str.substring(0, end + 1);
        len = str.length;
      }
    }
  }

  // 3. Check for escaped/stringified JSON: starts with {\" or [\"
  let trimStart = 0;
  while (trimStart < len && isWhitespace(str.charCodeAt(trimStart))) trimStart++;

  if (trimStart + 1 < len) {
    const first = str[trimStart];
    const second = str[trimStart + 1];
    if ((first === '{' || first === '[') && second === '\\') {
      // Likely escaped JSON - unescape it
      str = str
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }
  }

  return str;
}

/**
 * Repairs an incomplete or malformed JSON string by automatically closing
 * open structures, completing partial values, and handling edge cases.
 *
 * Uses a stack-based state machine for O(n) single-pass processing.
 * Designed for LLM streaming where JSON may be cut off mid-generation.
 *
 * @param input - The incomplete/malformed JSON string to repair
 * @returns A valid, parseable JSON string (or empty string for empty input)
 *
 * @example
 * // Basic incomplete JSON
 * repairJson('{"name": "John')
 * // => '{"name": "John"}'
 *
 * @example
 * // Single quotes → double quotes
 * repairJson("{'key': 'value'}")
 * // => '{"key": "value"}'
 *
 * @example
 * // Python constants
 * repairJson('{"active": True, "data": None}')
 * // => '{"active": true, "data": null}'
 *
 * @example
 * // Unquoted keys
 * repairJson('{name: "John", age: 30}')
 * // => '{"name": "John", "age": 30}'
 *
 * @example
 * // Comments
 * repairJson('{"a": 1, /* comment *\/ "b": 2}')
 * // => '{"a": 1,  "b": 2}'
 *
 * @example
 * // Fenced code block
 * repairJson('```json\n{"a": 1}\n```')
 * // => '{"a": 1}'
 *
 * @example
 * // JSONP
 * repairJson('callback({"a": 1})')
 * // => '{"a": 1}'
 *
 * @example
 * // MongoDB types
 * repairJson('{"count": NumberLong(123)}')
 * // => '{"count": 123}'
 *
 * @example
 * // String concatenation
 * repairJson('{"text": "hello" + "world"}')
 * // => '{"text": "helloworld"}'
 *
 * @example
 * // NDJSON (newline-delimited)
 * repairJson('{"a": 1}\n{"b": 2}')
 * // => '[{"a": 1},{"b": 2}]'
 */
export function repairJson(input: string): string {
  if (!input || input.trim().length === 0) {
    return '';
  }

  // Pre-process for fenced code blocks, JSONP, escaped JSON
  const processed = preprocessJson(input);
  const len = processed.length;

  // Use array buffer for O(n) performance instead of string concatenation
  // Extra space for closing brackets, quotes, wrapping array, etc.
  const output: string[] = new Array(len + 128);
  let outIdx = 0;

  // Stack of context types (OBJECT, ARRAY, STRING)
  const stack: ContextType[] = [];

  // Tracking state
  let inString = false;
  let stringQuote = '"'; // Track which quote started the string
  let escaped = false;
  let inObjectKey = false;
  let needsColon = false;
  let expectingValue = false;
  let expectingKeyOrEnd = false;
  let inValue = false;
  let currentValue = '';
  let inUnquotedKey = false;
  let unquotedKey = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;

  // Phase 3: Additional state
  let justClosedString = false; // For string concatenation
  let rootElementCount = 0; // For NDJSON detection
  let inMongoWrapper = false; // Inside MongoDB wrapper like NumberLong(
  let mongoParenDepth = 0; // Depth of parens in mongo wrapper

  for (let i = 0; i < len; i++) {
    const char = processed[i]!;
    const c = char.charCodeAt(0);

    // === Inside single-line comment ===
    if (inSingleLineComment) {
      if (c === 10 || c === 13) {
        // newline ends comment
        inSingleLineComment = false;
        output[outIdx++] = char; // preserve the newline
      }
      continue;
    }

    // === Inside multi-line comment ===
    if (inMultiLineComment) {
      if (char === '*' && i + 1 < len && processed[i + 1] === '/') {
        inMultiLineComment = false;
        i++; // skip the /
      }
      continue;
    }

    // === Inside MongoDB wrapper (extract content) ===
    if (inMongoWrapper) {
      if (char === '(') {
        mongoParenDepth++;
        if (mongoParenDepth === 1) continue; // Skip the opening (
      } else if (char === ')') {
        mongoParenDepth--;
        if (mongoParenDepth === 0) {
          inMongoWrapper = false;
          continue; // Skip the closing )
        }
      }
      // Fall through to process content inside the wrapper
    }

    // === Inside a string ===
    if (inString) {
      if (escaped) {
        output[outIdx++] = char;
        escaped = false;
      } else if (char === '\\') {
        output[outIdx++] = char;
        escaped = true;
      } else if (c === stringQuote.charCodeAt(0) || (stringQuote !== '"' && isQuoteChar(c))) {
        // End of string - always output as double quote
        output[outIdx++] = '"';
        inString = false;
        stack.pop();
        justClosedString = true;

        if (inObjectKey) {
          inObjectKey = false;
          needsColon = true;
          expectingKeyOrEnd = false;
        } else if (expectingValue) {
          expectingValue = false;
          needsColon = false;
        }
      } else {
        output[outIdx++] = char;
      }
      continue;
    }

    // === Inside an unquoted key or identifier ===
    if (inUnquotedKey) {
      if (isIdentifierChar(c)) {
        unquotedKey += char;
        continue;
      } else {
        // Check if this is a MongoDB wrapper function
        if (char === '(' && MONGO_WRAPPERS.has(unquotedKey)) {
          inMongoWrapper = true;
          mongoParenDepth = 1;
          inUnquotedKey = false;
          unquotedKey = '';
          continue;
        }

        // End of unquoted key - output as quoted string
        output[outIdx++] = '"';
        for (let j = 0; j < unquotedKey.length; j++) {
          output[outIdx++] = unquotedKey[j]!;
        }
        output[outIdx++] = '"';
        inUnquotedKey = false;
        unquotedKey = '';
        needsColon = true;
        expectingKeyOrEnd = false;
        // Don't continue - process this character
      }
    }

    // === Inside a literal/number value ===
    if (inValue) {
      const isValueChar =
        (c >= 48 && c <= 57) || // 0-9
        c === 46 ||
        c === 101 ||
        c === 69 ||
        c === 43 ||
        c === 45 || // . e E + -
        (c >= 97 && c <= 122) || // a-z
        (c >= 65 && c <= 90); // A-Z (for True, False, None)

      if (isValueChar) {
        currentValue += char;
        output[outIdx++] = char;
        continue;
      } else {
        // Value ended - check if it needs completion
        inValue = false;

        // Check if it's a MongoDB wrapper that starts without being after {
        if (char === '(' && MONGO_WRAPPERS.has(currentValue)) {
          // Remove the wrapper name from output
          outIdx -= currentValue.length;
          inMongoWrapper = true;
          mongoParenDepth = 1;
          currentValue = '';
          continue;
        }

        const completion = INCOMPLETE_LITERALS[currentValue];
        if (completion) {
          // Replace with complete literal
          outIdx -= currentValue.length;
          for (let j = 0; j < completion.length; j++) {
            output[outIdx++] = completion[j]!;
          }
        }
        currentValue = '';
        expectingValue = false;
        justClosedString = false;
        // Don't continue - process this character
      }
    }

    // === Check for comments ===
    if (char === '/') {
      if (i + 1 < len) {
        const next = processed[i + 1];
        if (next === '/') {
          inSingleLineComment = true;
          i++; // skip the second /
          continue;
        } else if (next === '*') {
          inMultiLineComment = true;
          i++; // skip the *
          continue;
        }
      }
    }

    // === Whitespace ===
    if (isWhitespace(c)) {
      output[outIdx++] = ' '; // normalize to regular space
      continue;
    }

    // === Check for ellipsis (...) ===
    if (char === '.' && i + 2 < len && processed[i + 1] === '.' && processed[i + 2] === '.') {
      // Skip ellipsis
      i += 2;
      continue;
    }

    // === String concatenation: + ===
    if (char === '+' && justClosedString) {
      // Skip the + operator, strings will be merged
      continue;
    }

    // Reset justClosedString for non-special chars
    if (char !== '"' && char !== "'" && !isQuoteChar(c) && !isWhitespace(c)) {
      justClosedString = false;
    }

    // === Structural characters ===
    switch (char) {
      case '{':
        // Check for NDJSON: multiple root elements
        if (stack.length === 0 && rootElementCount > 0) {
          output[outIdx++] = ','; // Add comma between root elements
        }
        // If we're in an object expecting a value, this is a nested object - that's valid
        // If we're in an object expecting a key, we need to add a synthetic key
        if (
          expectingKeyOrEnd &&
          stack.length > 0 &&
          stack[stack.length - 1] === ContextType.OBJECT
        ) {
          // Add synthetic key for nested object
          output[outIdx++] = '"';
          output[outIdx++] = '_';
          output[outIdx++] = '"';
          output[outIdx++] = ':';
          expectingKeyOrEnd = false;
          expectingValue = false;
        }
        output[outIdx++] = char;
        stack.push(ContextType.OBJECT);
        expectingKeyOrEnd = true;
        needsColon = false;
        expectingValue = false;
        justClosedString = false;
        break;

      case '}':
        // Remove trailing comma
        outIdx = removeTrailingCommaFromBuffer(output, outIdx);

        // If we just had a key with no value, add null
        if (needsColon) {
          output[outIdx++] = ':';
          output[outIdx++] = 'n';
          output[outIdx++] = 'u';
          output[outIdx++] = 'l';
          output[outIdx++] = 'l';
          needsColon = false;
        }

        output[outIdx++] = char;
        if (stack.length > 0 && stack[stack.length - 1] === ContextType.OBJECT) {
          stack.pop();
        }
        expectingKeyOrEnd = false;
        expectingValue = false;
        justClosedString = false;

        // Track root element completion
        if (stack.length === 0) rootElementCount++;
        break;

      case '[':
        // Check for NDJSON
        if (stack.length === 0 && rootElementCount > 0) {
          output[outIdx++] = ',';
        }
        output[outIdx++] = char;
        stack.push(ContextType.ARRAY);
        expectingValue = false;
        needsColon = false;
        justClosedString = false;
        break;

      case ']':
        // Skip stray ] at root level
        if (stack.length === 0) {
          continue;
        }
        // Skip if we're in an object (invalid position)
        if (stack[stack.length - 1] === ContextType.OBJECT) {
          continue;
        }
        outIdx = removeTrailingCommaFromBuffer(output, outIdx);
        output[outIdx++] = char;
        if (stack.length > 0 && stack[stack.length - 1] === ContextType.ARRAY) {
          stack.pop();
        }
        expectingValue = false;
        justClosedString = false;

        // Track root element completion
        if (stack.length === 0) rootElementCount++;
        break;

      case '"':
      case "'":
        // String concatenation: merge with previous string
        if (justClosedString) {
          // Backtrack through whitespace to find the closing quote
          let backtrack = outIdx - 1;
          while (backtrack >= 0 && (output[backtrack] === ' ' || output[backtrack] === '\t')) {
            backtrack--;
          }
          // Remove the closing quote and any whitespace after it
          if (backtrack >= 0 && output[backtrack] === '"') {
            outIdx = backtrack; // Remove quote and all spaces after
          }
          // Continue the string without adding opening quote
          inString = true;
          stringQuote = char;
          stack.push(ContextType.STRING);
          justClosedString = false;
        } else {
          output[outIdx++] = '"'; // Always output double quote
          inString = true;
          stringQuote = char;
          stack.push(ContextType.STRING);
          if (expectingKeyOrEnd) {
            inObjectKey = true;
          }
          needsColon = false;
          justClosedString = false;
        }
        break;

      case ':':
        // Skip stray colons that aren't after a key
        if (!needsColon && stack.length > 0 && stack[stack.length - 1] === ContextType.OBJECT) {
          continue;
        }
        // Skip colons at root level entirely
        if (stack.length === 0) {
          continue;
        }
        output[outIdx++] = char;
        needsColon = false;
        expectingValue = true;
        expectingKeyOrEnd = false;
        justClosedString = false;
        break;

      case ',':
        output[outIdx++] = char;
        if (stack.length > 0 && stack[stack.length - 1] === ContextType.OBJECT) {
          expectingKeyOrEnd = true;
          expectingValue = false;
        }
        needsColon = false;
        justClosedString = false;
        break;

      default:
        // Check for special Unicode quotes
        if (isQuoteChar(c)) {
          if (justClosedString) {
            if (outIdx > 0 && output[outIdx - 1] === '"') outIdx--;
            inString = true;
            stringQuote = char;
            stack.push(ContextType.STRING);
            justClosedString = false;
          } else {
            output[outIdx++] = '"';
            inString = true;
            stringQuote = char;
            stack.push(ContextType.STRING);
            if (expectingKeyOrEnd) {
              inObjectKey = true;
            }
            needsColon = false;
            justClosedString = false;
          }
          break;
        }

        // Check for unquoted key (when expecting key in object)
        if (expectingKeyOrEnd && isIdentifierStart(c)) {
          inUnquotedKey = true;
          unquotedKey = char;
          justClosedString = false;
          break;
        }

        // Start of a literal or number value (or maybe MongoDB wrapper)
        if (
          char === 't' ||
          char === 'f' ||
          char === 'n' ||
          char === 'T' ||
          char === 'F' ||
          char === 'N' || // Python constants
          char === '-' ||
          (c >= 48 && c <= 57) || // 0-9
          (isIdentifierStart(c) && !expectingKeyOrEnd) // Could be MongoDB wrapper
        ) {
          output[outIdx++] = char;
          currentValue = char;
          inValue = true;
          needsColon = false;
          justClosedString = false;
        } else {
          output[outIdx++] = char;
          justClosedString = false;
        }
        break;
    }
  }

  // === Finalize ===

  // Complete any pending unquoted key
  if (inUnquotedKey && unquotedKey) {
    output[outIdx++] = '"';
    for (let j = 0; j < unquotedKey.length; j++) {
      output[outIdx++] = unquotedKey[j]!;
    }
    output[outIdx++] = '"';
    output[outIdx++] = ':';
    output[outIdx++] = 'n';
    output[outIdx++] = 'u';
    output[outIdx++] = 'l';
    output[outIdx++] = 'l';
  }

  // Complete any pending value
  if (inValue && currentValue) {
    const completion = INCOMPLETE_LITERALS[currentValue];
    if (completion) {
      outIdx -= currentValue.length;
      for (let j = 0; j < completion.length; j++) {
        output[outIdx++] = completion[j]!;
      }
    }
  }

  // Close any unclosed string
  if (inString) {
    if (escaped && outIdx > 0 && output[outIdx - 1] === '\\') {
      outIdx--;
    }
    output[outIdx++] = '"'; // Always close with double quote
    stack.pop();

    if (inObjectKey || expectingKeyOrEnd) {
      output[outIdx++] = ':';
      output[outIdx++] = 'n';
      output[outIdx++] = 'u';
      output[outIdx++] = 'l';
      output[outIdx++] = 'l';
      needsColon = false;
    }
  }

  // If a key just finished but no colon came
  if (needsColon) {
    output[outIdx++] = ':';
    output[outIdx++] = 'n';
    output[outIdx++] = 'u';
    output[outIdx++] = 'l';
    output[outIdx++] = 'l';
  }

  // If expecting value after colon
  if (expectingValue && !inString && !inValue) {
    let lastNonWs = outIdx - 1;
    while (lastNonWs >= 0) {
      const ch = output[lastNonWs];
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
      lastNonWs--;
    }
    if (lastNonWs >= 0 && output[lastNonWs] === ':') {
      output[outIdx++] = 'n';
      output[outIdx++] = 'u';
      output[outIdx++] = 'l';
      output[outIdx++] = 'l';
    }
  }

  // Remove trailing comma
  outIdx = removeTrailingCommaFromBuffer(output, outIdx);

  // Close all open structures
  while (stack.length > 0) {
    const ctx = stack.pop();
    if (ctx === ContextType.OBJECT) {
      output[outIdx++] = '}';
      if (stack.length === 0) rootElementCount++;
    } else if (ctx === ContextType.ARRAY) {
      output[outIdx++] = ']';
      if (stack.length === 0) rootElementCount++;
    }
  }

  let result = output.slice(0, outIdx).join('');

  // Wrap in array if we had multiple root elements (NDJSON)
  if (rootElementCount > 1) {
    result = '[' + result + ']';
  }

  return result;
}

/**
 * Remove trailing comma from buffer, returns new length
 */
function removeTrailingCommaFromBuffer(buf: string[], len: number): number {
  let i = len - 1;

  // Skip trailing whitespace
  while (i >= 0) {
    const c = buf[i];
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') break;
    i--;
  }

  // If last non-whitespace is comma, remove it
  if (i >= 0 && buf[i] === ',') {
    // Shift whitespace left by one (removing comma)
    for (let j = i; j < len - 1; j++) {
      buf[j] = buf[j + 1]!;
    }
    return len - 1;
  }

  return len;
}
