import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

export { afterEach, beforeEach, describe, it };

export function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepStrictEqual(actual, expected);
    },
    toHaveLength(len: number) {
      assert.strictEqual((actual as unknown as { length: number }).length, len);
    },
    toContain(item: unknown) {
      if (typeof actual === 'string') {
        assert.ok(
          actual.includes(String(item)),
          `Expected "${actual}" to contain "${String(item)}"`,
        );
      } else if (Array.isArray(actual)) {
        assert.ok(
          actual.includes(item),
          `Expected array ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`,
        );
      } else {
        assert.fail(`toContain called on unsupported value: ${String(actual)}`);
      }
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeInstanceOf(ctor: abstract new (...args: any[]) => unknown) {
      assert.ok(
        actual instanceof ctor,
        `Expected ${String(actual)} to be instance of ${ctor.name}`,
      );
    },
    toBeGreaterThan(n: number) {
      assert.ok(
        Number(actual) > n,
        `Expected ${String(actual)} to be > ${String(n)}`,
      );
    },
    toMatch(re: RegExp) {
      assert.match(String(actual), re);
    },
    not: {
      toContain(item: unknown) {
        if (typeof actual === 'string') {
          assert.ok(
            !actual.includes(String(item)),
            `Expected "${actual}" NOT to contain "${String(item)}"`,
          );
        } else if (Array.isArray(actual)) {
          assert.ok(
            !actual.includes(item),
            `Expected array NOT to contain ${JSON.stringify(item)}`,
          );
        }
      },
    },
  };
}
