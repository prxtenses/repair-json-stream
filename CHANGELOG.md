# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-29

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
