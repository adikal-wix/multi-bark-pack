#!/usr/bin/env node
/**
 * Phase 1: Server Integration Tests
 *
 * Tests server.js agent lifecycle and commands
 * Run: node test/phase1-server.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Test results tracking
const results = { passed: 0, failed: 0, errors: [] };

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        results.passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${e.message}`);
        results.failed++;
        results.errors.push({ name, error: e.message });
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        results.passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${e.message}`);
        results.failed++;
        results.errors.push({ name, error: e.message });
    }
}

// ============================================
// Setup: Load server module without starting
// ============================================

console.log('\n📦 Loading server module...\n');

// Initialize backends first (required by server)
const backends = require('../backends');

(async () => {
    // Initialize backends before loading server
    await backends.initialize({
        enabledBackends: ['claude-code'],
        defaultBackend: 'claude-code',
    });

    // Now load server (won't call main() because require.main !== module)
    const server = require('../server');

    // ============================================
    // Test Suite 1: Server Module Structure
    // ============================================

    console.log('📦 Server Module Structure Tests\n');

    test('server exports agents map', () => {
        assert(server.agents instanceof Map, 'agents should be a Map');
    });

    test('server exports deletedAgents map', () => {
        assert(server.deletedAgents instanceof Map, 'deletedAgents should be a Map');
    });

    test('server exports msgToAgent map', () => {
        assert(server.msgToAgent instanceof Map, 'msgToAgent should be a Map');
    });

    test('server exports agent lifecycle functions', () => {
        assert(typeof server.spawnAgent === 'function', 'should export spawnAgent');
        assert(typeof server.sendToAgent === 'function', 'should export sendToAgent');
        assert(typeof server.findAgentByName === 'function', 'should export findAgentByName');
        assert(typeof server.softDeleteAgent === 'function', 'should export softDeleteAgent');
        assert(typeof server.hardDeleteAgent === 'function', 'should export hardDeleteAgent');
    });

    test('server exports command functions', () => {
        assert(typeof server.stopAgents === 'function', 'should export stopAgents');
        assert(typeof server.clearAgents === 'function', 'should export clearAgents');
        assert(typeof server.deleteAgents === 'function', 'should export deleteAgents');
        assert(typeof server.rebornAgent === 'function', 'should export rebornAgent');
        assert(typeof server.resetAgents === 'function', 'should export resetAgents');
    });

    test('server exports utility functions', () => {
        assert(typeof server.genId === 'function', 'should export genId');
        assert(typeof server.nextPupName === 'function', 'should export nextPupName');
        assert(typeof server.saveState === 'function', 'should export saveState');
        assert(typeof server.loadState === 'function', 'should export loadState');
    });

    // ============================================
    // Test Suite 2: ID Generation
    // ============================================

    console.log('\n📦 ID Generation Tests\n');

    test('genId returns 6-char hex string', () => {
        const id = server.genId();
        assert(typeof id === 'string', 'should be string');
        assert.strictEqual(id.length, 6, 'should be 6 chars');
        assert(/^[0-9a-f]{6}$/.test(id), 'should be hex');
    });

    test('genId returns unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(server.genId());
        }
        assert.strictEqual(ids.size, 100, 'should generate 100 unique IDs');
    });

    // ============================================
    // Test Suite 3: Pup Naming
    // ============================================

    console.log('\n📦 Pup Naming Tests\n');

    test('nextPupName returns a name', () => {
        const name = server.nextPupName();
        assert(typeof name === 'string', 'should be string');
        assert(name.length > 0, 'should not be empty');
    });

    test('nextPupName returns different names', () => {
        // Clear agents for this test
        server.agents.clear();
        server.deletedAgents.clear();

        const names = new Set();
        for (let i = 0; i < 5; i++) {
            const name = server.nextPupName();
            // Simulate using the name
            server.agents.set(`test-${i}`, { name, id: `test-${i}` });
            names.add(name);
        }
        assert.strictEqual(names.size, 5, 'should return 5 different names');

        // Clean up
        server.agents.clear();
    });

    // ============================================
    // Test Suite 4: Agent Commands
    // ============================================

    console.log('\n📦 Agent Command Tests\n');

    // Create a mock agent for testing
    const mockAgent = {
        id: 'test-001',
        name: 'TestPup',
        sessionId: 'test-session',
        tmuxSession: 'bark-TestPup',
        backend: 'claude-code',
        model: 'sonnet',
        status: 'active',
        hasRun: false,
        createdAt: new Date().toISOString(),
        source: 'test',
    };

    test('clearAgents clears a specific agent', () => {
        // Setup
        server.agents.clear();
        server.deletedAgents.clear();
        server.agents.set(mockAgent.id, { ...mockAgent });

        // Test
        const result = server.clearAgents(['TestPup']);

        assert.deepStrictEqual(result.cleared, ['TestPup'], 'should clear TestPup');
        assert.deepStrictEqual(result.notFound, [], 'should have no not-found');
        assert(!server.agents.has(mockAgent.id), 'should remove from agents');
        assert(server.deletedAgents.has(mockAgent.id), 'should add to deletedAgents');
    });

    test('rebornAgent brings back a cleared agent', () => {
        // Agent was cleared in previous test, should be in deletedAgents
        const result = server.rebornAgent('TestPup');

        assert(result.success, 'should succeed');
        assert(result.agent, 'should return agent');
        assert.strictEqual(result.agent.name, 'TestPup');
        assert(server.agents.has(mockAgent.id), 'should be back in agents');
        assert(!server.deletedAgents.has(mockAgent.id), 'should be removed from deletedAgents');
    });

    test('rebornAgent fails for active agent', () => {
        // Agent is now active from previous test
        const result = server.rebornAgent('TestPup');

        assert(!result.success, 'should fail');
        assert(result.error.includes('already alive'), 'should mention already alive');
    });

    test('resetAgents resets an agent', () => {
        const oldSessionId = server.agents.get(mockAgent.id).sessionId;

        const result = server.resetAgents(['TestPup']);

        assert.deepStrictEqual(result.reset, ['TestPup'], 'should reset TestPup');
        assert(!server.agents.get(mockAgent.id).hasRun, 'hasRun should be false');
        assert.notStrictEqual(
            server.agents.get(mockAgent.id).sessionId,
            oldSessionId,
            'sessionId should change'
        );
    });

    test('deleteAgents permanently removes an agent', () => {
        const result = server.deleteAgents(['TestPup']);

        assert.deepStrictEqual(result.deleted, ['TestPup'], 'should delete TestPup');
        assert(!server.agents.has(mockAgent.id), 'should not be in agents');
        assert(!server.deletedAgents.has(mockAgent.id), 'should not be in deletedAgents');
    });

    test('findAgentByName returns null for deleted agent', () => {
        const result = server.findAgentByName('TestPup');
        assert.strictEqual(result, null, 'should return null');
    });

    test('clearAgents handles "pack" keyword', () => {
        // Setup multiple agents
        server.agents.clear();
        server.deletedAgents.clear();
        server.agents.set('a1', { id: 'a1', name: 'Pup1', status: 'active' });
        server.agents.set('a2', { id: 'a2', name: 'Pup2', status: 'active' });
        server.agents.set('a3', { id: 'a3', name: 'Pup3', status: 'active' });

        const result = server.clearAgents(['pack']);

        assert.strictEqual(result.cleared.length, 3, 'should clear all 3');
        assert.strictEqual(server.agents.size, 0, 'agents should be empty');
        assert.strictEqual(server.deletedAgents.size, 3, 'all should be in deletedAgents');

        // Clean up
        server.agents.clear();
        server.deletedAgents.clear();
    });

    // ============================================
    // Test Suite 5: Status Building
    // ============================================

    console.log('\n📦 Status Building Tests\n');

    test('buildStatusText returns string', () => {
        const status = server.buildStatusText();
        assert(typeof status === 'string', 'should return string');
    });

    test('buildStatusText shows "No pups" when empty', () => {
        server.agents.clear();
        const status = server.buildStatusText();
        assert(status.includes('No pups'), 'should indicate no pups');
    });

    test('classifyAgents returns array', () => {
        const classified = server.classifyAgents();
        assert(Array.isArray(classified), 'should return array');
    });

    // ============================================
    // Summary
    // ============================================

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Results: ${results.passed} passed, ${results.failed} failed\n`);

    if (results.failed > 0) {
        console.log('❌ Failures:');
        for (const { name, error } of results.errors) {
            console.log(`   - ${name}: ${error}`);
        }
        process.exit(1);
    } else {
        console.log('✅ All tests passed!\n');
        process.exit(0);
    }
})();
