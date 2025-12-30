import { describe, it, expect } from 'vitest';
import { IncrementalJsonRepair, createIncrementalRepair } from './incremental.js';

describe('Incremental JSON Repair', () => {
    it('should repair JSON across multiple chunks', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('{"name": "Jo');
        output += repairer.push('hn", "age": ');
        output += repairer.push('30');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
        const parsed = JSON.parse(output);
        expect(parsed.name).toBe('John');
        expect(parsed.age).toBe(30);
    });

    it('should handle incomplete literals', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('{"active": tru');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
        expect(JSON.parse(output).active).toBe(true);
    });

    it('should handle incomplete strings', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('{"message": "Hello');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
        expect(JSON.parse(output).message).toBe('Hello');
    });

    it('should close nested structures', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('{"data": {"items": [1, 2, 3');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
        const parsed = JSON.parse(output);
        expect(parsed.data.items).toEqual([1, 2, 3]);
    });

    it('should track repair actions', () => {
        const actions: string[] = [];
        const repairer = new IncrementalJsonRepair({
            onRepair: (action) => actions.push(action)
        });

        repairer.push('{"a": tru');
        repairer.end();

        expect(actions).toContain('fixed_literal');
        expect(actions).toContain('closed_object');
    });

    it('should support reset for reuse', () => {
        const repairer = new IncrementalJsonRepair();

        let output1 = repairer.push('{"a": 1') + repairer.end();
        expect(() => JSON.parse(output1)).not.toThrow();

        repairer.reset();

        let output2 = repairer.push('{"b": 2') + repairer.end();
        expect(() => JSON.parse(output2)).not.toThrow();
        expect(JSON.parse(output2).b).toBe(2);
    });

    it('should handle empty chunks', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('{"a":');
        output += repairer.push('');
        output += repairer.push(' 1');
        output += repairer.push('');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should use factory function', () => {
        const repairer = createIncrementalRepair();

        const output = repairer.push('{"x": 1') + repairer.end();
        expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should handle arrays', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push('[1, 2, ');
        output += repairer.push('3, 4');
        output += repairer.end();

        expect(() => JSON.parse(output)).not.toThrow();
        expect(JSON.parse(output)).toEqual([1, 2, 3, 4]);
    });

    it('should handle single quotes', () => {
        const repairer = new IncrementalJsonRepair();

        let output = '';
        output += repairer.push("{'key': 'val");
        output += repairer.push("ue'}");

        expect(() => JSON.parse(output)).not.toThrow();
        expect(JSON.parse(output).key).toBe('value');
    });
});
