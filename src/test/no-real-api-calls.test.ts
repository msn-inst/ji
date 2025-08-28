import { expect, test } from 'bun:test';
import { JiraClient } from '../lib/jira-client';

const mockConfig = {
  jiraUrl: 'https://example.atlassian.net',
  email: 'test@example.com',
  apiToken: 'mock-token',
  userId: 'test-user-id',
};

test('JiraClient blocks real API calls in test environment', () => {
  expect(() => {
    new JiraClient(mockConfig);
  }).toThrow('Real API calls detected in test environment!');
});

test('Environment protection can be bypassed with ALLOW_REAL_API_CALLS=true', () => {
  // Temporarily allow real API calls
  process.env.ALLOW_REAL_API_CALLS = 'true';

  try {
    // This should not throw
    const jiraClient = new JiraClient(mockConfig);

    expect(jiraClient).toBeDefined();
  } finally {
    // Clean up
    delete process.env.ALLOW_REAL_API_CALLS;
  }
});
