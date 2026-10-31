export interface AssertFunction {
  (condition: unknown, message?: string): asserts condition;
  ok(condition: unknown, message?: string): asserts condition;
  equal<T>(actual: T, expected: T, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
}

function assertCondition(
  condition: unknown,
  message?: string,
): asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed: expected truthy value");
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ||
        `Assertion failed: expected ${String(expected)}, but received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  const act = JSON.stringify(actual);
  const exp = JSON.stringify(expected);
  if (act !== exp) {
    throw new Error(
      message ||
        `Assertion failed: expected deep equality:\nExpected: ${exp}\nActual:   ${act}`,
    );
  }
}

export const assert: AssertFunction = Object.assign(assertCondition, {
  ok: assertCondition,
  equal: assertEqual,
  deepEqual: assertDeepEqual,
});
