import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statusCommand } from '../cli/commands/status';
import { installFetchMock, restoreFetch } from './test-fetch-mock';

let tempDir: string;

beforeEach(() => {
  // Create temp directory for test config
  tempDir = mkdtempSync(join(tmpdir(), 'ji-status-test-'));
  process.env.JI_CONFIG_DIR = tempDir;
});

afterEach(() => {
  restoreFetch();
  delete process.env.JI_CONFIG_DIR;

  // Clean up temp directory
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ji status - shows successful connection', async () => {
  // Create mock config file
  const mockConfig = {
    jiraUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token-123',
  };
  writeFileSync(join(tempDir, 'config.json'), JSON.stringify(mockConfig), { mode: 0o600 });

  // Mock API responses
  installFetchMock(async (url: string | URL, _init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/myself')) {
      return new Response(
        JSON.stringify({
          accountId: 'user-123',
          displayName: 'Test User',
          emailAddress: 'test@example.com',
          active: true,
        }),
        { status: 200 },
      );
    }

    if (urlString.includes('/rest/api/3/search')) {
      return new Response(
        JSON.stringify({
          issues: [],
          total: 5,
          startAt: 0,
          maxResults: 0,
        }),
        { status: 200 },
      );
    }

    throw new Error(`Unhandled request in status test: ${urlString}`);
  });

  // Capture console output
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };

  try {
    await statusCommand();

    // Verify success messages
    expect(logs.some((log) => log.includes('Successfully connected to Jira'))).toBe(true);
    expect(logs.some((log) => log.includes('URL:') && log.includes('https://test.atlassian.net'))).toBe(true);
    expect(logs.some((log) => log.includes('Email:') && log.includes('test@example.com'))).toBe(true);
    expect(logs.some((log) => log.includes('Name:') && log.includes('Test User'))).toBe(true);
    expect(logs.some((log) => log.includes('Account ID:') && log.includes('user-123'))).toBe(true);
    expect(logs.some((log) => log.includes('Open issues assigned to you:') && log.includes('5'))).toBe(true);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('ji status - handles missing configuration', async () => {
  // No config file created

  // Capture console output
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode: number | undefined;
  const originalExit = process.exit;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('process.exit called');
  }) as any;

  try {
    await statusCommand();
  } catch (_error) {
    // Expected to throw due to process.exit
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  // Verify error message
  expect(logs.some((log) => log.includes('No configuration found'))).toBe(true);
  expect(logs.some((log) => log.includes('ji setup'))).toBe(true);
  expect(exitCode).toBe(1);
});

test('ji status - handles authentication failure', async () => {
  // Create mock config file
  const mockConfig = {
    jiraUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    apiToken: 'invalid-token',
  };
  writeFileSync(join(tempDir, 'config.json'), JSON.stringify(mockConfig), { mode: 0o600 });

  // Mock API responses
  installFetchMock(async (url: string | URL, _init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/myself')) {
      return new Response(
        JSON.stringify({
          message: 'Unauthorized',
        }),
        { status: 401 },
      );
    }

    throw new Error(`Unhandled request in status test: ${urlString}`);
  });

  // Capture console output
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode: number | undefined;
  const originalExit = process.exit;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('process.exit called');
  }) as any;

  try {
    await statusCommand();
  } catch (_error) {
    // Expected to throw due to process.exit
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  // Verify error messages
  expect(logs.some((log) => log.includes('Failed to connect to Jira'))).toBe(true);
  expect(logs.some((log) => log.includes('Authentication failed'))).toBe(true);
  expect(logs.some((log) => log.includes('https://id.atlassian.com/manage/api-tokens'))).toBe(true);
  expect(exitCode).toBe(1);
});

test('ji status - handles network error', async () => {
  // Create mock config file
  const mockConfig = {
    jiraUrl: 'https://invalid-url-that-does-not-exist.atlassian.net',
    email: 'test@example.com',
    apiToken: 'test-token',
  };
  writeFileSync(join(tempDir, 'config.json'), JSON.stringify(mockConfig), { mode: 0o600 });

  // Mock API responses to simulate network error
  installFetchMock(async (_url: string | URL, _init?: RequestInit) => {
    throw new Error('getaddrinfo ENOTFOUND invalid-url-that-does-not-exist.atlassian.net');
  });

  // Capture console output
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode: number | undefined;
  const originalExit = process.exit;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error('process.exit called');
  }) as any;

  try {
    await statusCommand();
  } catch (_error) {
    // Expected to throw due to process.exit
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  // Verify error messages
  expect(logs.some((log) => log.includes('Failed to connect to Jira'))).toBe(true);
  expect(logs.some((log) => log.includes('Cannot reach Jira server'))).toBe(true);
  expect(logs.some((log) => log.includes('internet connection'))).toBe(true);
  expect(exitCode).toBe(1);
});
