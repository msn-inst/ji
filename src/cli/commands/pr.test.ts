import { afterEach, beforeEach, expect, test } from 'bun:test';
import { installFetchMock, restoreFetch } from '../../test/test-fetch-mock';

let consoleOutput: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  delete process.env.ALLOW_REAL_API_CALLS;
  consoleOutput = [];
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
});

afterEach(() => {
  restoreFetch();
  delete process.env.ALLOW_REAL_API_CALLS;
  console.log = originalLog;
});

test('shows PR URLs one per line by default', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-123')) {
      return new Response(
        JSON.stringify({
          id: '12345',
          key: 'TEST-123',
          self: 'https://test.atlassian.net/rest/api/3/issue/12345',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(
        JSON.stringify({
          detail: [
            {
              pullRequests: [
                { url: 'https://github.com/owner/repo/pull/123', status: 'OPEN' },
                { url: 'https://github.com/owner/repo/pull/456', status: 'MERGED' },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-123');

  expect(consoleOutput.length).toBe(1);
  const output = consoleOutput[0];
  expect(output).toContain('https://github.com/owner/repo/pull/123');
  expect(output).toContain('https://github.com/owner/repo/pull/456');
  expect(output.split('\n').length).toBe(2);
});

test('outputs JSON with --json flag', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-456')) {
      return new Response(
        JSON.stringify({
          id: '67890',
          key: 'TEST-456',
          self: 'https://test.atlassian.net/rest/api/3/issue/67890',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(
        JSON.stringify({
          detail: [
            {
              pullRequests: [{ url: 'https://github.com/org/repo/pull/789', status: 'OPEN' }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-456', { json: true, platform: 'github' });

  expect(consoleOutput.length).toBe(1);
  const output = consoleOutput[0];
  const parsed = JSON.parse(output);

  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed.length).toBe(1);
  expect(parsed[0].url).toBe('https://github.com/org/repo/pull/789');
  expect(parsed[0].status).toBe('OPEN');
  expect(parsed[0].number).toBe(789);
  expect(parsed[0].repo).toBe('org/repo');
});

test('shows yellow message when no PRs found', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-999')) {
      return new Response(
        JSON.stringify({
          id: '55555',
          key: 'TEST-999',
          self: 'https://test.atlassian.net/rest/api/3/issue/55555',
          fields: { summary: 'Test issue without PRs' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(JSON.stringify({ detail: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-999');

  expect(consoleOutput.length).toBe(1);
  expect(consoleOutput[0]).toContain('No pull requests found for TEST-999');
});

test('parses PR metadata correctly', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-111')) {
      return new Response(
        JSON.stringify({
          id: '11111',
          key: 'TEST-111',
          self: 'https://test.atlassian.net/rest/api/3/issue/11111',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(
        JSON.stringify({
          detail: [
            {
              pullRequests: [
                { url: 'https://github.com/user-name/repo-name/pull/100', status: 'OPEN' },
                { url: 'https://github.com/Org_123/Repo_456/pull/200', status: 'DECLINED' },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-111', { json: true, platform: 'github' });

  const parsed = JSON.parse(consoleOutput[0]);

  expect(parsed[0].repo).toBe('user-name/repo-name');
  expect(parsed[0].number).toBe(100);
  expect(parsed[0].status).toBe('OPEN');

  expect(parsed[1].repo).toBe('Org_123/Repo_456');
  expect(parsed[1].number).toBe(200);
  expect(parsed[1].status).toBe('DECLINED');
});

test('rejects invalid issue key format', async () => {
  const errorOutput: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errorOutput.push(args.map(String).join(' '));
  };

  let exitCode = 0;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code || 0;
    throw new Error(`process.exit(${code})`);
  }) as never;

  process.env.ALLOW_REAL_API_CALLS = 'true';
  const { showPullRequests } = await import('./pr');

  try {
    await showPullRequests('invalid-key');
  } catch (_error) {
    // Expected
  }

  process.exit = originalExit;
  console.error = originalError;

  expect(exitCode).toBe(1);
  expect(errorOutput.join(' ')).toContain('Invalid issue key');
});

test('normalizes unknown PR status to UNKNOWN', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-222')) {
      return new Response(
        JSON.stringify({
          id: '22222',
          key: 'TEST-222',
          self: 'https://test.atlassian.net/rest/api/3/issue/22222',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(
        JSON.stringify({
          detail: [
            {
              pullRequests: [
                { url: 'https://github.com/owner/repo/pull/123', status: 'WEIRD_STATUS' },
                { url: 'https://github.com/owner/repo/pull/456', status: 'MERGED' },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-222', { json: true, platform: 'github' });

  const parsed = JSON.parse(consoleOutput[0]);

  expect(parsed[0].status).toBe('UNKNOWN');
  expect(parsed[1].status).toBe('MERGED');
});

test('returns all platform PR URLs but extracts metadata only from GitHub URLs', async () => {
  installFetchMock(async (url: string | URL) => {
    const urlString = typeof url === 'string' ? url : url.toString();

    if (urlString.includes('/rest/api/3/issue/TEST-333')) {
      return new Response(
        JSON.stringify({
          id: '33333',
          key: 'TEST-333',
          self: 'https://test.atlassian.net/rest/api/3/issue/33333',
          fields: { summary: 'Test issue' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (urlString.includes('/rest/dev-status/1.0/issue/detail')) {
      return new Response(
        JSON.stringify({
          detail: [
            {
              pullRequests: [
                { url: 'https://github.com/owner/repo/pull/123', status: 'OPEN' },
                { url: 'https://gitlab.com/owner/repo/-/merge_requests/456', status: 'OPEN' },
                { url: 'https://bitbucket.org/owner/repo/pull-requests/789', status: 'OPEN' },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    throw new Error(`Unhandled request: ${urlString}`);
  });

  process.env.ALLOW_REAL_API_CALLS = 'true';

  const { showPullRequests } = await import('./pr');
  await showPullRequests('TEST-333', { json: true, platform: 'github' });

  const parsed = JSON.parse(consoleOutput[0]);

  expect(parsed.length).toBe(3);
  expect(parsed[0].url).toBe('https://github.com/owner/repo/pull/123');
  expect(parsed[0].repo).toBe('owner/repo');
  expect(parsed[0].number).toBe(123);
  expect(parsed[1].url).toBe('https://gitlab.com/owner/repo/-/merge_requests/456');
  expect(parsed[1].repo).toBeUndefined();
  expect(parsed[1].number).toBeUndefined();
  expect(parsed[2].url).toBe('https://bitbucket.org/owner/repo/pull-requests/789');
});
