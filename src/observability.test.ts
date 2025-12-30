import { describe, it, expect } from 'vitest';
import { repairJson, RepairAction } from './repair-json.js';

describe('Observability', () => {
    it('should trigger callback for missing closing brackets', () => {
        const actions: RepairAction[] = [];
        repairJson('{"a": [1, 2', (action) => actions.push(action));
        expect(actions).toContain('closed_array');
        expect(actions).toContain('closed_object');
    });

    it('should trigger callback for unquoted keys', () => {
        const actions: RepairAction[] = [];
        repairJson('{name: "John"}', (action) => actions.push(action));
        expect(actions).toContain('inserted_quote');
    });

    it('should trigger callback for missing quotes', () => {
        const actions: RepairAction[] = [];
        repairJson('{"a": 1, "b": 2', (action) => actions.push(action));
        expect(actions).toContain('closed_object');
    });

    it('should trigger callback for fixed literals', () => {
        const actions: RepairAction[] = [];
        repairJson('{"a": Tru}', (action) => actions.push(action));
        expect(actions).toContain('fixed_literal');
    });

    it('should trigger callback for missing comma in NDJSON', () => {
        const actions: RepairAction[] = [];
        repairJson('{"a":1}\n{"b":2}', (action) => actions.push(action));
        expect(actions).toContain('missing_comma');
    });

    it('should trigger callback for synthetic keys in nested objects', () => {
        const actions: RepairAction[] = [];
        // This input {"a": { "b": 1 should result in valid JSON, but let's test a case where synthetic key is needed or deep nesting implies it
        // Actually the synthetic key case is for { { "a": 1 } } -> { "_": { "a": 1 } }
        repairJson('{{ "a": 1 }}', (action) => actions.push(action));
        expect(actions).toContain('synthetic_key');
    });

    it('should provide correct context messages', () => {
        let lastContext = '';
        repairJson('{name: "John"}', (action, index, context) => {
            if (action === 'inserted_quote') {
                lastContext = context;
            }
        });
        expect(lastContext).toContain('Wrapped unquoted key "name"');
    });
});
