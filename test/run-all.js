#!/usr/bin/env node
/**
 * Run all Phase 1 tests
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
    'phase1.js',
    'phase1-server.js',
];

console.log('🧪 Running Phase 1 Tests\n');
console.log('='.repeat(50) + '\n');

let allPassed = true;

for (const test of tests) {
    console.log(`\n🔬 Running ${test}...\n`);

    try {
        execSync(`node ${path.join(__dirname, test)}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..'),
        });
    } catch (e) {
        allPassed = false;
    }
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('\n🎉 All test suites passed!\n');
    process.exit(0);
} else {
    console.log('\n💥 Some tests failed!\n');
    process.exit(1);
}
