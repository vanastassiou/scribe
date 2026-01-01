# Testing guide

This guide explains how to run and write tests for Scribe.

## Prerequisites

Install dependencies:

```sh
npm install
```

## Running tests

### Run all tests once

```sh
npm test
```

### Run tests in watch mode

Automatically re-runs tests when files change:

```sh
npm run test:watch
```

### Run a specific test file

```sh
npx vitest run tests/schemas.test.js
```

### Run tests matching a pattern

```sh
npx vitest run -t "validates"
```

This runs only tests whose names contain "validates".

## Test structure

Tests live in the `tests/` directory. Each test file corresponds to a source file:

```
js/schemas.js          →  tests/schemas.test.js
js/db.js               →  tests/db.test.js
js/tags.js             →  tests/tags.test.js
js/sync.js             →  tests/sync.test.js
js/oauth.js            →  tests/oauth.test.js
js/ntfy.js             →  tests/ntfy.test.js
js/attachment-sync.js  →  tests/attachment-sync.test.js
```

## Writing a test

### Basic test structure

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../js/myModule.js';

describe('myModule', () => {
  describe('myFunction', () => {
    it('does something specific', () => {
      const result = myFunction('input');
      expect(result).toBe('expected output');
    });
  });
});
```

### Anatomy of a test

```javascript
it('creates a media idea with the provided title', () => {
  // 1. ARRANGE - set up the test data
  const data = { title: 'Dune' };

  // 2. ACT - call the function being tested
  const result = createMedia(data);

  // 3. ASSERT - verify the result
  expect(result.title).toBe('Dune');
  expect(result.type).toBe('media');
});
```

### Common assertions

```javascript
// Equality
expect(value).toBe(5);              // Strict equality (===)
expect(obj).toEqual({ a: 1 });      // Deep equality for objects

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeDefined();
expect(value).toBeUndefined();

// Numbers
expect(num).toBeGreaterThan(3);
expect(num).toBeLessThanOrEqual(10);

// Strings
expect(str).toMatch(/pattern/);
expect(str).toContain('substring');

// Arrays
expect(arr).toContain('item');
expect(arr).toHaveLength(3);

// Errors
expect(() => badFunction()).toThrow();
expect(() => badFunction()).toThrow('error message');

// Async
await expect(asyncFunction()).resolves.toBe('value');
await expect(asyncFunction()).rejects.toThrow('error');
```

## Testing async code

Most database and sync operations are async. Use `async/await`:

```javascript
it('saves and retrieves an idea', async () => {
  const idea = createMedia({ title: 'Test' });

  await saveIdea(idea);
  const retrieved = await getIdea(idea.id);

  expect(retrieved.title).toBe('Test');
});
```

## Setup and teardown

### Run code before/after each test

```javascript
import { beforeEach, afterEach } from 'vitest';

describe('database tests', () => {
  beforeEach(async () => {
    // Runs before each test - reset database
    await resetDatabase();
  });

  afterEach(() => {
    // Runs after each test - cleanup
    closeConnections();
  });

  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
});
```

### Run code once for all tests in a block

```javascript
import { beforeAll, afterAll } from 'vitest';

describe('integration tests', () => {
  beforeAll(async () => {
    // Runs once before all tests
    await setupTestServer();
  });

  afterAll(() => {
    // Runs once after all tests
    stopTestServer();
  });
});
```

## Mocking

### Mock a function

```javascript
import { vi } from 'vitest';

it('calls the callback', () => {
  const callback = vi.fn();

  doSomething(callback);

  expect(callback).toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
  expect(callback).toHaveBeenCalledTimes(1);
});
```

### Mock a module

```javascript
import { vi } from 'vitest';

// Mock the entire module
vi.mock('../js/db.js', () => ({
  getAllIdeas: vi.fn(() => Promise.resolve([])),
  saveIdea: vi.fn(() => Promise.resolve())
}));
```

### Mock return values

```javascript
const mockFn = vi.fn();

// Return a value once
mockFn.mockReturnValueOnce('first call');
mockFn.mockReturnValueOnce('second call');

// Always return this value
mockFn.mockReturnValue('default');

// Return a promise
mockFn.mockResolvedValue('async result');
mockFn.mockRejectedValue(new Error('async error'));
```

## Testing browser APIs

The test environment uses jsdom to simulate a browser. Some APIs need mocking.

### IndexedDB

Already configured in `tests/setup.js` using `fake-indexeddb`.

```javascript
// Tests can use IndexedDB normally
await saveIdea(idea);
const result = await getIdea(idea.id);
```

### localStorage / sessionStorage

Already configured in `tests/setup.js`.

```javascript
localStorage.setItem('key', 'value');
expect(localStorage.getItem('key')).toBe('value');
```

### navigator.onLine

```javascript
// Set online status for a test
Object.defineProperty(navigator, 'onLine', {
  value: false,
  writable: true
});

expect(shouldSync()).toBe(false);
```

## Example: Adding a new test

Suppose you add a new function `getIdeasByTag` in `js/db.js`:

```javascript
// js/db.js
export async function getIdeasByTag(tag) {
  const ideas = await getAllIdeas();
  return ideas.filter(i => i.tags?.includes(tag));
}
```

Add tests in `tests/db.test.js`:

```javascript
describe('getIdeasByTag', () => {
  beforeEach(async () => {
    // Create test data
    await saveIdea(createMedia({
      title: 'Dune',
      tags: ['sci-fi', 'classic']
    }));
    await saveIdea(createMedia({
      title: 'Foundation',
      tags: ['sci-fi']
    }));
    await saveIdea(createNote({
      content: 'Random note',
      tags: ['personal']
    }));
  });

  it('returns ideas with the specified tag', async () => {
    const results = await getIdeasByTag('sci-fi');

    expect(results).toHaveLength(2);
    expect(results.map(r => r.title)).toContain('Dune');
    expect(results.map(r => r.title)).toContain('Foundation');
  });

  it('returns empty array when no ideas have the tag', async () => {
    const results = await getIdeasByTag('nonexistent');

    expect(results).toHaveLength(0);
  });

  it('is case-sensitive', async () => {
    const results = await getIdeasByTag('SCI-FI');

    expect(results).toHaveLength(0);
  });
});
```

## Test file template

Use this template when creating a new test file:

```javascript
/**
 * Tests for [module name]
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../js/module.js';

describe('moduleName', () => {
  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    // Cleanup code
  });

  describe('functionToTest', () => {
    it('describes expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('handles edge case', () => {
      expect(functionToTest('')).toBe('default');
    });

    it('throws on invalid input', () => {
      expect(() => functionToTest(null)).toThrow('Invalid input');
    });
  });
});
```

## Debugging tests

### Print values during tests

```javascript
it('debugging example', () => {
  const result = complexFunction();
  console.log('Result:', result);  // Prints to terminal
  expect(result).toBeDefined();
});
```

### Run a single test

Add `.only` to run just one test:

```javascript
it.only('this test runs alone', () => {
  // Only this test runs
});
```

### Skip a test

Add `.skip` to temporarily disable a test:

```javascript
it.skip('this test is skipped', () => {
  // This test won't run
});
```

### Run with verbose output

```sh
npx vitest run --reporter=verbose
```

## Troubleshooting

### "Cannot find module" error

Check that the import path is correct. Paths are relative to the test file:

```javascript
// From tests/db.test.js, import js/db.js
import { saveIdea } from '../js/db.js';  // Correct
import { saveIdea } from './js/db.js';   // Wrong
```

### Test passes alone but fails with others

Tests may be sharing state. Ensure `beforeEach` resets all state:

```javascript
beforeEach(async () => {
  resetDB();
  await initDB();
});
```

### Async test times out

Increase timeout for slow operations:

```javascript
it('slow operation', async () => {
  // ...
}, 10000);  // 10 second timeout
```

### Mock not working

Ensure mocks are defined before imports:

```javascript
// This order matters
vi.mock('../js/db.js');  // Mock first

import { sync } from '../js/sync.js';  // Import after
```

## Resources

- [Vitest documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/) (for UI testing)
- [Vitest expect API](https://vitest.dev/api/expect.html)
