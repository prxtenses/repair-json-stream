<p align="center">
  <h1 align="center">repair-json-stream</h1>
  <p align="center">
    <strong>Blazing-fast JSON repair for LLM streaming</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/repair-json-stream"><img src="https://img.shields.io/npm/v/repair-json-stream?style=flat-square&color=blue" alt="npm"></a>
    <a href="https://github.com/prxtenses/repair-json-stream/actions"><img src="https://img.shields.io/github/actions/workflow/status/prxtenses/repair-json-stream/ci.yml?style=flat-square" alt="CI"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
    <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square" alt="Zero Dependencies">
    <img src="https://img.shields.io/badge/size-5.5KB-blue?style=flat-square" alt="Bundle Size">
  </p>
</p>

---

When streaming responses from LLMs like OpenAI or Anthropic, JSON often arrives incomplete:

```json
{"message": "Hello, I'm currently generating your resp
```

`JSON.parse()` crashes. **repair-json-stream** fixes it instantly.

```js
import { repairJson } from 'repair-json-stream'

repairJson('{"message": "Hello, I\'m currently generating your resp')
// → '{"message": "Hello, I\'m currently generating your resp"}'
```

## ⚡ Performance

Built for real-time streaming. **1.9x faster** than alternatives.

```
┌────────────────────┬────────────────────┬────────────┬─────────┐
│ Benchmark          │ repair-json-stream │ jsonrepair │ Speedup │
├────────────────────┼────────────────────┼────────────┼─────────┤
│ Small (15 KB)      │ 0.85 ms            │ 1.53 ms    │ 1.8x    │
│ Large (3.9 MB)     │ 295 ms             │ 392 ms     │ 1.3x    │
│ Streaming (1K ops) │ 426 ms             │ 583 ms     │ 1.4x    │
└────────────────────┴────────────────────┴────────────┴─────────┘
```

## 📦 Installation

```bash
npm install repair-json-stream
```

```bash
pnpm add repair-json-stream
```

```bash
yarn add repair-json-stream
```

## 🔧 What It Fixes

| Issue | Example | Result |
|-------|---------|--------|
| Truncated strings | `{"text": "Hello` | `{"text": "Hello"}` |
| Missing brackets | `{"a": [1, 2` | `{"a": [1, 2]}` |
| Unquoted keys | `{name: "John"}` | `{"name": "John"}` |
| Single quotes | `{'key': 'val'}` | `{"key": "val"}` |
| Python constants | `{"x": None, "y": True}` | `{"x": null, "y": true}` |
| Trailing commas | `[1, 2, 3,]` | `[1, 2, 3]` |
| Comments | `{"a": 1} // comment` | `{"a": 1}` |
| Fenced code blocks | `` ```json {"a":1} ``` `` | `{"a":1}` |
| JSONP wrappers | `callback({"a": 1})` | `{"a": 1}` |
| MongoDB types | `NumberLong(123)` | `123` |
| String concatenation | `"hello" + "world"` | `"helloworld"` |
| NDJSON | `{"a":1}\n{"b":2}` | `[{"a":1},{"b":2}]` |

## 🚀 Usage

### Basic

```js
import { repairJson } from 'repair-json-stream'

const broken = '{"users": [{"name": "Alice'
const fixed = repairJson(broken)
// → '{"users": [{"name": "Alice"}]}'

JSON.parse(fixed) // Works!
```

### Streaming (Node.js)

```js
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream'
import { jsonrepairTransform } from 'repair-json-stream/stream'

pipeline(
  createReadStream('broken.json'),
  jsonrepairTransform(),
  createWriteStream('fixed.json'),
  (err) => console.log(err || 'Done!')
)
```

### CLI

```bash
# Install globally
npm install -g repair-json-stream

# Repair a file
repair-json-stream broken.json > fixed.json

# Pipe from stdin
cat broken.json | repair-json-stream

# Overwrite in place
repair-json-stream broken.json --overwrite
```

### Browser

```html
<script src="https://unpkg.com/repair-json-stream/dist/repair-json-stream.browser.global.js"></script>
<script>
  const fixed = RepairJsonStream.repairJson('{"broken": true')
  console.log(fixed) // '{"broken": true}'
</script>
```

## 📖 API Reference

### `repairJson(json: string): string`

Repairs broken JSON and returns valid JSON. Never throws.

```js
repairJson('{"a": tru')     // '{"a": true}'
repairJson("{'b': None}")   // '{"b": null}'
repairJson('[1, 2,')        // '[1, 2]'
```

### `repairJson(input, onRepair?)`

Track what was fixed using the callback:

```js
repairJson('{"a": 1,', (action, idx, context) => {
  console.log(`Action: ${action} at index ${idx} (${context})`)
})
// Output: Action: closed_object at index 7 (Closing missing })
```

### `preprocessJson(input: string): string`

Strips wrappers (fenced blocks, JSONP, escaped strings) before repair.

```js
preprocessJson('```json\n{"a": 1}\n```')  // '{"a": 1}'
preprocessJson('callback({"a": 1})')      // '{"a": 1}'
```

### `jsonrepairTransform(options?): Transform`

Node.js Transform stream for piping.

```js
import { jsonrepairTransform } from 'repair-json-stream/stream'
```

## 🏗️ Architecture

- **O(n) single-pass** - No multiple iterations
- **Stack-based state machine** - No regex parsing
- **Zero dependencies** - Minimal attack surface
- **ReDoS-safe** - No exponential backtracking
- **5.5 KB minified** - Lightweight for browsers

## 📄 License

MIT © [sonka](https://github.com/prxtenses)