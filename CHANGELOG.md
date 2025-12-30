# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-12-30

### Added
- **Web Streams API** (`./web-stream`): Universal `TransformStream` support for Deno, Bun, Cloudflare Workers and modern browsers.
  - `jsonRepairStream()` - Standard TransformStream
  - `jsonRepairChunkedStream()` - Chunked output for large payloads
- **Incremental Stateful Repair** (`./incremental`): True streaming repair with immediate partial output.
  - `IncrementalJsonRepair` class with `.push()` and `.end()` methods
  - `.snapshot()` method to get valid JSON at any point
  - `.reset()` for reusing instances
- **LLM Garbage Filtering** (`./extract`): Extract JSON from messy LLM outputs.
  - `extractJson()` - Extracts first JSON block from prose
  - `extractAllJson()` - Extracts all JSON blocks
  - `containsJson()` - Fast heuristic check
  - `stripLlmWrapper()` - Removes thinking blocks, markdown, common LLM phrases

### Changed
- Updated Vitest to v4.0.16
- Added 34 new tests (97 total)

## [1.1.1] - 2025-12-30

### Fixed
- Synced documentation between GitHub and JSR.
- Updated README with missing CLI verbose flag documentation.

## [1.1.0] - 2025-12-30

### Added
- **Observability Callback**: Added optional `onRepair` callback to `repairJson` to track granular repair actions (e.g., `inserted_quote`, `fixed_literal`, `closed_object`).
- **CLI Verbose Mode**: Added `--verbose` flag to the CLI tool to log repair actions to `stderr` in real-time.
- New test suite `src/observability.test.ts` to verify repair event tracking.

## [1.0.4] - 2025-12-30

### Changed
- **Performance Optimization**: Achieved ~30-50% speedup by inlining character classification checks and using an optimized `CharTypes` bitmask lookup table.
- Internal: Moved benchmark scripts to a dedicated `benchmarks/` directory.

### Fixed
- `ReferenceError: end is not defined` in `preprocessJson` during JSONP stripping.
- Incorrect trailing character stripping in JSONP wrappers.

## [1.0.0] - 2025-12-29

### Added
- Core `repairJson()` function for repairing incomplete JSON
- Auto-close unclosed strings, objects, and arrays
- Complete partial literals (`tru` → `true`, `fals` → `false`, `nul` → `null`)
- Remove trailing commas
- Convert single quotes to double quotes
- Handle Python constants (`None`, `True`, `False`)
- Support special Unicode quote characters („", '', etc.)
- Handle unquoted object keys
- Strip single-line (`//`) and multi-line (`/* */`) comments
- Strip ellipsis (`...`) in arrays and objects
- Strip fenced code blocks (` ```json ... ``` `)
- Strip JSONP wrappers (`callback({...})`)
- Unescape stringified JSON
- Strip MongoDB type wrappers (`NumberLong(123)` → `123`)
- Handle string concatenation (`"a" + "b"` → `"ab"`)
- Convert newline-delimited JSON (NDJSON) to array
- Streaming Transform API (`jsonrepairTransform()`)
- CLI tool (`repair-json-stream`)
- Dual CJS/ESM builds with TypeScript declarations
- Comprehensive test suite (56 tests including robustness tests)
- Property-based testing with fast-check

### Performance
- 1.9x faster than jsonrepair for streaming use cases
- O(n) single-pass processing
- Zero dependencies
- 5.6 KB minified bundle
