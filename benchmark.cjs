/**
 * Benchmark: repair-json-stream vs jsonrepair
 * 
 * Generates increasingly large incomplete JSON payloads and measures
 * repair performance of both libraries.
 * 
 * Run: node benchmark.cjs
 */

const { repairJson } = require('./dist/index.cjs');

let jsonrepair;
try {
    jsonrepair = require('jsonrepair').jsonrepair;
} catch {
    console.error('❌ jsonrepair not installed. Run: npm install jsonrepair');
    process.exit(1);
}

/**
 * Generate a large incomplete JSON structure
 * Simulates LLM streaming that gets cut off
 */
function generateIncompleteJson(itemCount, cutOffRatio = 0.9) {
    const items = [];
    for (let i = 0; i < itemCount; i++) {
        items.push({
            id: i,
            name: `User ${i}`,
            email: `user${i}@example.com`,
            active: i % 2 === 0,
            metadata: {
                created: '2024-01-01T00:00:00Z',
                tags: ['tag1', 'tag2', 'tag3'],
                score: Math.random() * 100
            }
        });
    }

    const fullJson = JSON.stringify({ data: items, total: itemCount });
    // Cut off at specified ratio to simulate incomplete stream
    const cutPoint = Math.floor(fullJson.length * cutOffRatio);
    return fullJson.slice(0, cutPoint);
}

/**
 * Measure execution time of a function
 */
function benchmark(fn, input, iterations = 10) {
    // Warmup
    for (let i = 0; i < 3; i++) {
        fn(input);
    }

    const times = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn(input);
        const end = performance.now();
        times.push(end - start);
    }

    // Return median to avoid outliers
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Verify both libraries produce valid JSON
 */
function verifyOutput(input, name) {
    try {
        const ours = repairJson(input);
        JSON.parse(ours);
    } catch (e) {
        console.error(`❌ repair-json-stream failed on ${name}:`, e.message);
        return false;
    }

    try {
        const theirs = jsonrepair(input);
        JSON.parse(theirs);
    } catch (e) {
        console.error(`❌ jsonrepair failed on ${name}:`, e.message);
        return false;
    }

    return true;
}

// ============================================
// Run Benchmarks
// ============================================

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║          BENCHMARK: repair-json-stream vs jsonrepair              ║');
console.log('╠════════════════════════════════════════════════════════════════════╣');
console.log('║  Simulating LLM streaming with incomplete JSON payloads           ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const testSizes = [100, 500, 1000, 5000, 10000, 25000];

console.log('┌─────────────┬───────────┬─────────────────┬─────────────────┬─────────────┐');
console.log('│ Items       │ Size      │ repair-json-str │ jsonrepair      │ Speedup     │');
console.log('├─────────────┼───────────┼─────────────────┼─────────────────┼─────────────┤');

for (const size of testSizes) {
    const input = generateIncompleteJson(size);
    const inputSize = formatBytes(input.length);

    // Verify both work
    if (!verifyOutput(input, `${size} items`)) {
        continue;
    }

    // Benchmark
    const oursTime = benchmark(repairJson, input);
    const theirsTime = benchmark(jsonrepair, input);
    const speedup = theirsTime / oursTime;

    const oursStr = `${oursTime.toFixed(2)} ms`.padEnd(15);
    const theirsStr = `${theirsTime.toFixed(2)} ms`.padEnd(15);
    const speedupStr = `${speedup.toFixed(1)}x`.padEnd(11);
    const sizeStr = size.toString().padEnd(11);
    const inputSizeStr = inputSize.padEnd(9);

    console.log(`│ ${sizeStr} │ ${inputSizeStr} │ ${oursStr} │ ${theirsStr} │ ${speedupStr} │`);
}

console.log('└─────────────┴───────────┴─────────────────┴─────────────────┴─────────────┘');

console.log('\n📊 Legend:');
console.log('   - Items: Number of objects in the JSON array');
console.log('   - Size: Payload size in KB/MB');
console.log('   - Speedup: How many times faster repair-json-stream is\n');

// Additional test: Many small repairs (simulating real streaming)
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║           STREAMING SIMULATION: 1000 incremental chunks            ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const baseJson = generateIncompleteJson(100);
const chunks = [];
for (let i = 100; i <= baseJson.length; i += Math.floor(baseJson.length / 1000)) {
    chunks.push(baseJson.slice(0, i));
}

console.log(`Simulating ${chunks.length} incremental chunks (streaming)...\n`);

const oursStart = performance.now();
for (const chunk of chunks) {
    repairJson(chunk);
}
const oursTotal = performance.now() - oursStart;

const theirsStart = performance.now();
for (const chunk of chunks) {
    jsonrepair(chunk);
}
const theirsTotal = performance.now() - theirsStart;

console.log(`repair-json-stream: ${oursTotal.toFixed(2)} ms total (${(oursTotal / chunks.length).toFixed(3)} ms/chunk)`);
console.log(`jsonrepair:         ${theirsTotal.toFixed(2)} ms total (${(theirsTotal / chunks.length).toFixed(3)} ms/chunk)`);
console.log(`\n🚀 Speedup: ${(theirsTotal / oursTotal).toFixed(1)}x faster for streaming use case`);
