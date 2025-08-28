# Test Environment Setup for ji CLI

## Overview

The ji CLI test suite requires proper configuration mocking to run successfully in CI/CD and local test environments. Since the application expects a configuration file at `~/.ji/config.json` with sensitive credentials, tests need to mock this configuration.

## Configuration Strategy

### 1. Environment Variable Override

Tests use the `JI_CONFIG_DIR` environment variable to override the default config directory:

```typescript
// In test setup
process.env.JI_CONFIG_DIR = tempDir;
```

### 2. Temporary Directory Pattern

Each test that requires configuration should:

1. Create a temporary directory
2. Set `JI_CONFIG_DIR` to that directory
3. Create a mock `config.json` file
4. Clean up after the test

Example pattern:

```typescript
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(() => {
  // Create temp directory
  tempDir = mkdtempSync(join(tmpdir(), 'ji-test-'));
  process.env.JI_CONFIG_DIR = tempDir;
  
  // Create mock config
  const mockConfig = {
    jiraUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token-123'
  };
  writeFileSync(
    join(tempDir, 'config.json'), 
    JSON.stringify(mockConfig), 
    { mode: 0o600 }
  );
});

afterEach(() => {
  // Clean up
  delete process.env.JI_CONFIG_DIR;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
```

### 3. Test Helpers

The `test-helpers.ts` file provides utilities for environment isolation:

```typescript
import { EnvironmentSaver } from '../test/test-helpers';

const envSaver = new EnvironmentSaver();

beforeEach(() => {
  envSaver.save('JI_CONFIG_DIR');
  // ... set up test environment
});

afterEach(() => {
  envSaver.restore();
});
```

## CI/CD Configuration

For GitHub Actions or other CI/CD systems, no special configuration is needed. Tests will:

1. Create their own temporary directories
2. Mock all necessary configuration
3. Clean up after themselves

## Mock API Responses

Tests should mock API responses instead of making real calls:

```typescript
import { installFetchMock } from './test-fetch-mock';

installFetchMock(async (url, init) => {
  const urlString = url.toString();
  
  if (urlString.includes('/rest/api/3/myself')) {
    return new Response(JSON.stringify({
      accountId: 'test-user',
      displayName: 'Test User',
      emailAddress: 'test@example.com'
    }), { status: 200 });
  }
  
  // Add other mock responses as needed
});
```

## Best Practices

1. **Never use real credentials in tests** - Always use mock/fake credentials
2. **Clean up after tests** - Remove temporary directories and restore environment
3. **Mock external services** - Use fetch mocks for Jira API, Confluence API, etc.
4. **Use `ALLOW_REAL_API_CALLS` sparingly** - Only when testing actual integration
5. **Isolate test environments** - Each test should have its own config directory

## Running Tests

### Local Development
```bash
bun test                    # Run all tests
bun test:coverage          # Run with coverage
bun test <file>            # Run specific test file
```

### CI/CD
Tests run automatically on push/PR with:
```bash
bun test:coverage:check    # Enforces coverage thresholds
```

## Troubleshooting

### "No configuration found" Error
- Ensure test properly mocks config directory and file
- Check that `JI_CONFIG_DIR` is set before importing commands

### Permission Errors
- Mock config files should be created with mode `0o600`
- Some CI environments may have different permission handling

### Cleanup Issues
- Always use try/finally or afterEach hooks for cleanup
- Use `{ force: true }` when removing directories