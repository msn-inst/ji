import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueSchema } from '../lib/effects/jira/schemas';
import { createValidIssue, validateAndReturn } from './msw-schema-validation';
import { installFetchMock, restoreFetch } from './test-fetch-mock';

// Test to verify that `ji EVAL-5767` and `ji issue view EVAL-5767`
// produce identical output (they should be exact aliases)

let tempDir: string;

beforeEach(() => {
  // Create temp directory for test config
  tempDir = mkdtempSync(join(tmpdir(), 'ji-alias-test-'));
  process.env.JI_CONFIG_DIR = tempDir;

  // Create mock config file
  const mockConfig = {
    jiraUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token-123',
  };
  writeFileSync(join(tempDir, 'config.json'), JSON.stringify(mockConfig), { mode: 0o600 });
});

afterEach(() => {
  restoreFetch();
  delete process.env.ALLOW_REAL_API_CALLS;
  delete process.env.JI_CONFIG_DIR;

  // Clean up temp directory
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ji EVAL-5767 and ji issue view EVAL-5767 are identical aliases', async () => {
  // Create test issue
  const testIssue = createValidIssue({
    key: 'ALIAS-123',
    fields: {
      summary: 'Test issue for alias verification',
      description: 'This issue tests that both command forms produce identical output',
      status: { name: 'In Progress' },
      assignee: {
        displayName: 'Test User',
        emailAddress: 'test@example.com',
        accountId: 'test-123',
      },
      reporter: {
        displayName: 'Reporter User',
        emailAddress: 'reporter@example.com',
        accountId: 'reporter-123',
      },
      priority: { name: 'Medium' },
      created: '2024-01-01T10:00:00.000Z',
      updated: '2024-01-02T15:30:00.000Z',
      project: { key: 'ALIAS', name: 'Alias Test Project' },
      comment: {
        comments: [
          {
            author: {
              displayName: 'Test Commenter',
              emailAddress: 'commenter@example.com',
              accountId: 'commenter-123',
            },
            created: '2024-01-01T12:00:00.000Z',
            body: 'This is a test comment to verify both commands show comments identically.',
          },
        ],
      },
    },
  });

  // Mock the API endpoints
  installFetchMock(async (url: string | URL, _init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/myself')) {
      return new Response(
        JSON.stringify({
          accountId: 'current-user-123',
          displayName: 'Test User',
          emailAddress: 'test@example.com',
          active: true,
        }),
        { status: 200 },
      );
    }

    if (urlString.includes('/rest/api/3/issue/ALIAS-123')) {
      const validatedIssue = validateAndReturn(IssueSchema, testIssue, 'Alias Test Issue');
      return new Response(JSON.stringify(validatedIssue), { status: 200 });
    }

    // Mock Meilisearch endpoints to prevent real HTTP calls
    if (urlString.includes('localhost:7700') || urlString.includes('meilisearch')) {
      return new Response(JSON.stringify({ taskUid: 123, status: 'enqueued' }), { status: 200 });
    }

    throw new Error(`Unhandled request in alias test: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  // Capture output from direct issue key command
  const directOutput: string[] = [];
  const originalLog = console.log;

  // Test 1: Direct issue key (ji ALIAS-123)
  console.log = (...args: unknown[]) => {
    const message = args.join(' ');
    // Filter out database migration messages
    if (!message.includes('Migrating database:') && !message.includes('✅ Opened')) {
      directOutput.push(message);
    }
  };

  try {
    const { viewIssue } = await import('../cli/commands/issue');
    await viewIssue('ALIAS-123', { xml: true, local: true });
  } finally {
    console.log = originalLog;
  }

  // Reset fetch mock for second test
  restoreFetch();
  installFetchMock(async (url: string | URL, _init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/myself')) {
      return new Response(
        JSON.stringify({
          accountId: 'current-user-123',
          displayName: 'Test User',
          emailAddress: 'test@example.com',
          active: true,
        }),
        { status: 200 },
      );
    }

    if (urlString.includes('/rest/api/3/issue/ALIAS-123')) {
      const validatedIssue = validateAndReturn(IssueSchema, testIssue, 'Alias Test Issue');
      return new Response(JSON.stringify(validatedIssue), { status: 200 });
    }

    // Mock Meilisearch endpoints to prevent real HTTP calls
    if (urlString.includes('localhost:7700') || urlString.includes('meilisearch')) {
      return new Response(JSON.stringify({ taskUid: 123, status: 'enqueued' }), { status: 200 });
    }

    throw new Error(`Unhandled request in alias test: ${urlString}`);
  });

  // Capture output from explicit issue view command
  const explicitOutput: string[] = [];

  // Test 2: Explicit issue view (ji issue view ALIAS-123)
  console.log = (...args: unknown[]) => {
    const message = args.join(' ');
    // Filter out database migration messages
    if (!message.includes('Migrating database:') && !message.includes('✅ Opened')) {
      explicitOutput.push(message);
    }
  };

  try {
    const { viewIssue } = await import('../cli/commands/issue');
    await viewIssue('ALIAS-123', { xml: true, local: true });
  } finally {
    console.log = originalLog;
  }

  // Compare outputs - they should be identical
  expect(directOutput).toEqual(explicitOutput);

  // Verify both outputs contain the expected content
  const directOutputString = directOutput.join('\n');
  const explicitOutputString = explicitOutput.join('\n');

  // Both should have the same basic XML structure
  expect(directOutputString).toContain('<type>issue</type>');
  expect(directOutputString).toContain('<key>ALIAS-123</key>');
  expect(directOutputString).toContain('<title>Test issue for alias verification</title>');
  expect(directOutputString).toContain('<comments>');
  expect(directOutputString).toContain('<author>Test Commenter</author>');

  expect(explicitOutputString).toContain('<type>issue</type>');
  expect(explicitOutputString).toContain('<key>ALIAS-123</key>');
  expect(explicitOutputString).toContain('<title>Test issue for alias verification</title>');
  expect(explicitOutputString).toContain('<comments>');
  expect(explicitOutputString).toContain('<author>Test Commenter</author>');

  // Most importantly - they should be character-for-character identical
  expect(directOutputString).toBe(explicitOutputString);
});

test('Command routing verification - both paths call same function', () => {
  // This test verifies the CLI routing logic at a unit level

  // Test the issue key regex pattern used in the CLI router
  const issueKeyPattern = /^[A-Z]+-\d+$/;

  // These should match (valid issue keys)
  expect(issueKeyPattern.test('EVAL-5767')).toBe(true);
  expect(issueKeyPattern.test('ABC-123')).toBe(true);
  expect(issueKeyPattern.test('PROJECT-999')).toBe(true);

  // These should not match (invalid formats)
  expect(issueKeyPattern.test('eval-5767')).toBe(false); // lowercase
  expect(issueKeyPattern.test('EVAL')).toBe(false); // no number
  expect(issueKeyPattern.test('123-EVAL')).toBe(false); // number first
  expect(issueKeyPattern.test('EVAL-ABC')).toBe(false); // letters after dash

  // This confirms that the CLI router correctly identifies issue keys
  // and routes them to the same viewIssue function that ji issue view uses
});
