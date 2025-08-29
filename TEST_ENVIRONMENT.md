# Test Environment Setup for ji CLI

## Overview

The ji CLI test suite uses multiple testing strategies to ensure reliability without requiring real Jira credentials:

1. **MSW (Mock Service Worker)** - Primary strategy for API mocking
2. **Configuration mocking** - For tests that need config access
3. **Effect testing utilities** - For testing Effect-based code
4. **Real API testing** - Optional, controlled via environment variables

## Testing Strategies

### 1. MSW-Based Testing (Primary)

Most tests use Mock Service Worker to intercept and mock HTTP requests:

```typescript
import { server } from '../test/setup-msw';
import { http, HttpResponse } from 'msw';

// MSW automatically intercepts network requests
// Defined in src/test/mocks/handlers.ts
```

### 2. Configuration Mocking

For tests that need configuration access:

```typescript
import { mockConfig } from '../test/test-helpers';

// Use predefined mock configuration
const config = mockConfig; // Contains safe test values
```

### 3. Effect Testing

For testing Effect-based operations:

```typescript
import { Effect } from 'effect';
import { TestContext } from '@effect/platform';

test('Effect pipeline', async () => {
  const result = await Effect.runPromise(
    myEffect.pipe(
      Effect.provide(TestLayer)
    )
  );
  expect(result).toBe(expectedValue);
});
```

### 4. Real API Testing (Optional)

For integration tests against real Jira instances:

```typescript
// Only runs when explicitly enabled
if (process.env.ALLOW_REAL_API_CALLS === 'true') {
  test('real API integration', async () => {
    // Test against real Jira instance
    // Requires actual credentials in ~/.ji/config.json
  });
}
```

## Test File Organization

Tests are organized in `src/test/` directory:

```
src/test/
├── *.test.ts              # Individual test files
├── mocks/                 # MSW mock definitions
│   ├── handlers.ts        # Request handlers
│   └── server.ts          # Server setup
├── setup-msw.ts           # MSW configuration
├── test-helpers.ts        # Testing utilities
└── msw-schema-validation.ts # Schema validation for mocks
```

## MSW Handler Configuration

API mocks are defined in `src/test/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Jira user endpoint
  http.get('*/rest/api/3/myself', () => {
    return HttpResponse.json({
      accountId: 'test-account-id',
      displayName: 'Test User',
      emailAddress: 'test@example.com'
    });
  }),
  
  // Jira search endpoint
  http.get('*/rest/api/3/search', () => {
    return HttpResponse.json({
      issues: [],
      startAt: 0,
      maxResults: 50,
      total: 0
    });
  })
];
```

## Schema Validation in Tests

Mock responses are validated against Effect schemas to ensure type safety:

```typescript
import { validateAndReturn } from '../msw-schema-validation';
import { UserSchema } from '../../lib/effects/jira/schemas';

// Mock handler with schema validation
http.get('*/rest/api/3/myself', () => {
  const user = createValidUser({
    accountId: 'test-account-id',
    displayName: 'Test User',
    emailAddress: 'test@example.com'
  });
  
  return HttpResponse.json(
    validateAndReturn(UserSchema, user, 'Current User')
  );
});
```

## Running Tests

### Local Development
```bash
# Run all tests with MSW mocking (default)
NODE_ENV=test bun test

# Run with coverage
bun run test:coverage

# Run specific test file
bun test src/test/mine-command-simple.test.ts

# Run tests with real API calls (use sparingly)
ALLOW_REAL_API_CALLS=true NODE_ENV=test bun test

# Run with coverage thresholds
bun run test:coverage:check
```

### CI/CD
GitHub Actions automatically run:
```bash
NODE_ENV=test bun run test:coverage:check
```

No special CI configuration needed - MSW handles all mocking automatically.

## Best Practices

1. **Use MSW for HTTP mocking** - Primary testing strategy
2. **Validate mock responses** - Use Effect schemas to ensure type safety
3. **Avoid real API calls** - Only use `ALLOW_REAL_API_CALLS` when necessary
4. **Test Effect pipelines** - Use Effect testing utilities for proper error handling
5. **Isolate tests** - Each test should be independent
6. **Use schema validation** - Ensure mocks match real API responses

## Troubleshooting

### MSW Not Intercepting Requests
- Ensure `setup-msw.ts` is imported in test files
- Check that handlers match the request URL pattern
- Verify MSW is configured with `onUnhandledRequest: 'error'`

### Schema Validation Failures
- Check that mock data matches the Effect schema definitions
- Use `validateAndReturn` helper for consistent validation
- Review schema definitions in `src/lib/effects/jira/schemas.ts`

### Real API Test Issues
- Ensure `~/.ji/config.json` exists with valid credentials
- Set `ALLOW_REAL_API_CALLS=true` environment variable
- Use sparingly to avoid rate limiting and test instability

### Effect Testing Issues
- Provide proper test layers using `Effect.provide(TestLayer)`
- Use `Effect.runPromise` for async Effect operations
- Handle errors with appropriate Effect error handling patterns

## Examples

### Basic MSW Test
```typescript
import { test, expect } from 'bun:test';
import { server } from './setup-msw';
import { http, HttpResponse } from 'msw';

test('should handle API response', async () => {
  // Override default handler for this test
  server.use(
    http.get('*/rest/api/3/search', () => {
      return HttpResponse.json({
        issues: [{ key: 'TEST-123', fields: { summary: 'Test Issue' } }],
        total: 1
      });
    })
  );

  // Test your command that makes API calls
  const result = await runCommand();
  expect(result).toContain('TEST-123');
});
```

### Effect Testing Example
```typescript
import { test, expect } from 'bun:test';
import { Effect } from 'effect';
import { fetchIssue } from '../cli/commands/issue';

test('should handle Effect pipeline', async () => {
  const result = await Effect.runPromise(
    fetchIssue('TEST-123').pipe(
      Effect.provide(MockJiraLayer)
    )
  );
  
  expect(result.key).toBe('TEST-123');
});
```