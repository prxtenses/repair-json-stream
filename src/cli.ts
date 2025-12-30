#!/usr/bin/env node
/**
 * CLI for repair-json-stream
 *
 * Usage:
 *   repair-json-stream [filename] [options]
 *   cat broken.json | repair-json-stream
 *
 * Options:
 *   -o, --output <file>  Output file (default: stdout)
 *   --overwrite          Overwrite the input file
 *   -h, --help           Show help
 *   -v, --version        Show version
 */

import { readFileSync, writeFileSync } from 'fs';
import { repairJson } from './repair-json.js';

const args = process.argv.slice(2);

// Parse arguments
let inputFile: string | undefined;
let outputFile: string | undefined;
let overwrite = false;
let showHelp = false;
let showVersion = false;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;

  if (arg === '-h' || arg === '--help') {
    showHelp = true;
  } else if (arg === '-v' || arg === '--version') {
    showVersion = true;
  } else if (arg === '-o' || arg === '--output') {
    outputFile = args[++i];
  } else if (arg === '--overwrite') {
    overwrite = true;
  } else if (arg === '--verbose') {
    verbose = true;
  } else if (!arg.startsWith('-')) {
    inputFile = arg;
  }
}

// Show help
if (showHelp) {
  console.log(`
repair-json-stream - Repair incomplete/malformed JSON

Usage:
  repair-json-stream [filename] [options]
  cat broken.json | repair-json-stream

Options:
  -o, --output <file>  Output file (default: stdout)
  --overwrite          Overwrite the input file
  -h, --help           Show this help
  -v, --version        Show version
  --verbose            Show repair actions (stderr)

Examples:
  repair-json-stream broken.json                    # Repair to stdout
  repair-json-stream broken.json -o fixed.json      # Repair to file
  repair-json-stream broken.json --overwrite        # Repair in place
  cat broken.json | repair-json-stream              # Repair from stdin
`);
  process.exit(0);
}

// Show version
if (showVersion) {
  console.log(process.env.npm_package_version || '1.0.0');
  process.exit(0);
}

// Main
async function main() {
  let input: string;

  if (inputFile) {
    // Read from file
    input = readFileSync(inputFile, 'utf-8');
  } else if (!process.stdin.isTTY) {
    // Read from stdin
    input = await readStdin();
  } else {
    console.error('Error: No input provided. Use --help for usage.');
    process.exit(1);
  }

  const repairCallback = verbose
    ? (action: string, index: number, context: string) => {
      console.error(`[Repair] ${action} at ${index}: ${context}`);
    }
    : undefined;

  const repaired = repairJson(input, repairCallback);

  if (overwrite && inputFile) {
    writeFileSync(inputFile, repaired, 'utf-8');
  } else if (outputFile) {
    writeFileSync(outputFile, repaired, 'utf-8');
  } else {
    process.stdout.write(repaired);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
