import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { showSprint } from './sprint.js';
import { server } from '../../test/setup-msw.js';
import { createValidIssue } from '../../test/msw-schema-validation.js';

describe('Sprint Command with MSW (needs Effect migration)', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_REAL_API_CALLS = 'false';

    // Mock console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Mock ConfigManager
    mock.module('../../lib/config.js', () => ({
      ConfigManager: class MockConfigManager {
        async getConfig() {
          return {
            jiraUrl: 'https://test.atlassian.net',
            email: 'test@example.com',
            apiToken: 'test-token',
            defaultProject: 'TEST',
          };
        }
        close() {}
      },
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Sprint Issues Fetching', () => {
    test('should fetch and display sprint issues from active sprints', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          type: 'scrum',
          location: { projectKey: 'TEST', projectName: 'Test Project' },
        },
      ];

      const mockActiveSprints = [
        {
          id: 100,
          name: 'Sprint 1',
          state: 'active',
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-14T23:59:59.000Z',
        },
      ];

      const mockSprintIssues = [
        createValidIssue({
          key: 'TEST-123',
          fields: {
            summary: 'Sprint issue 1',
            status: { name: 'In Progress' },
            priority: { name: 'High' },
            assignee: { displayName: 'John Doe', accountId: 'john' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
        createValidIssue({
          key: 'TEST-124',
          fields: {
            summary: 'Sprint issue 2',
            status: { name: 'To Do' },
            priority: { name: 'Medium' },
            assignee: null,
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', (info) => {
          const url = new URL(info.request.url);
          expect(url.searchParams.get('state')).toBe('active');
          return HttpResponse.json({ values: mockActiveSprints });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', () => {
          return HttpResponse.json({ issues: mockSprintIssues });
        }),
      );

      await showSprint();

      // Verify sprint issues are displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 issue'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('TEST Board - Sprint 1'));
    });

    test('should filter by project correctly', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
        {
          id: 2,
          name: 'OTHER Board',
          location: { projectKey: 'OTHER' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: [] });
        }),
      );

      await showSprint('TEST');

      // Should only call sprint API for TEST board (id=1)
      expect(consoleLogSpy).toHaveBeenCalledWith('No issues in active sprints');
    });

    test('should filter unassigned issues when requested', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
      ];

      const mockSprints = [
        {
          id: 100,
          name: 'Sprint 1',
          state: 'active',
        },
      ];

      const mockIssues = [
        createValidIssue({
          key: 'TEST-123',
          fields: {
            summary: 'Assigned issue',
            status: { name: 'To Do' },
            assignee: { displayName: 'John Doe', accountId: 'john' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
        createValidIssue({
          key: 'TEST-124',
          fields: {
            summary: 'Unassigned issue',
            status: { name: 'To Do' },
            assignee: null,
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: mockSprints });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', () => {
          return HttpResponse.json({ issues: mockIssues });
        }),
      );

      await showSprint(undefined, { unassigned: true });

      // Should only show unassigned issues
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 unassigned issue'));
    });
  });

  describe('Output Formatting', () => {
    test('should generate XML output when requested', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
      ];

      const mockSprints = [
        {
          id: 100,
          name: 'Sprint 1',
          state: 'active',
        },
      ];

      const mockIssues = [
        createValidIssue({
          key: 'TEST-123',
          fields: {
            summary: 'Test issue with <special> & "characters"',
            status: { name: 'In Progress' },
            priority: { name: 'High' },
            assignee: { displayName: 'John & Jane', accountId: 'john' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: mockSprints });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', () => {
          return HttpResponse.json({ issues: mockIssues });
        }),
      );

      await showSprint(undefined, { xml: true });

      // Verify XML structure
      expect(consoleLogSpy).toHaveBeenCalledWith('<sprint_issues>');
      expect(consoleLogSpy).toHaveBeenCalledWith('  <filter_type>all</filter_type>');
      expect(consoleLogSpy).toHaveBeenCalledWith('  <count>1</count>');
      expect(consoleLogSpy).toHaveBeenCalledWith('</sprint_issues>');

      // Verify XML escaping
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '          <title>Test issue with &lt;special&gt; &amp; &quot;characters&quot;</title>',
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('          <assignee>John &amp; Jane</assignee>');
    });

    test('should handle empty sprint results', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: [] });
        }),
      );

      await showSprint();

      expect(consoleLogSpy).toHaveBeenCalledWith('No issues in active sprints');
    });
  });

  describe('Error Handling (needs Effect migration)', () => {
    test('should handle configuration errors', async () => {
      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            return null; // No config found
          }
          close() {}
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showSprint()).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith('No configuration found. Please run "ji setup" first.');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should handle API errors gracefully', async () => {
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ message: 'API Error' }, { status: 500 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showSprint()).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching sprint data'));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should continue with other boards if one fails', async () => {
      const mockBoards = [
        { id: 1, name: 'Working Board', location: { projectKey: 'TEST' } },
        { id: 2, name: 'Failing Board', location: { projectKey: 'TEST' } },
      ];

      const mockSprints = [{ id: 100, name: 'Sprint 1' }];
      const mockIssues = [
        createValidIssue({
          key: 'TEST-123',
          fields: {
            summary: 'Working issue',
            status: { name: 'To Do' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: mockSprints });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', () => {
          return HttpResponse.json({ issues: mockIssues });
        }),
        // Board 2 fails
        http.get('*/rest/agile/1.0/board/2/sprint', () => {
          return HttpResponse.error();
        }),
      );

      await showSprint();

      // Should show error for failing board but continue
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get sprint data for board Failing Board'),
      );

      // Should still show results from working board
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 issue'));
    });
  });

  describe('MSW Integration', () => {
    test('should intercept all sprint-related API calls', async () => {
      let boardsIntercepted = false;
      let sprintsIntercepted = false;
      let issuesIntercepted = false;

      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', (info) => {
          boardsIntercepted = true;
          expect(info.request.url).toContain('rest/agile/1.0/board');
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', (info) => {
          sprintsIntercepted = true;
          expect(info.request.url).toContain('board/1/sprint');
          return HttpResponse.json({ values: [{ id: 100, name: 'Sprint 1' }] });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', (info) => {
          issuesIntercepted = true;
          expect(info.request.url).toContain('sprint/100/issue');
          return HttpResponse.json({ issues: [] });
        }),
      );

      await showSprint();

      // Verify all requests were intercepted by MSW
      expect(boardsIntercepted).toBe(true);
      expect(sprintsIntercepted).toBe(true);
      expect(issuesIntercepted).toBe(true);
    });

    test('should not make real HTTP requests to Jira', async () => {
      // This test ensures we're not accidentally making real requests
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          location: { projectKey: 'TEST' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', (info) => {
          // Ensure we're not hitting real Atlassian
          expect(info.request.url).not.toContain('atlassian.com');
          expect(info.request.url).toContain('test.atlassian.net');
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: [] });
        }),
      );

      await showSprint();

      expect(consoleLogSpy).toHaveBeenCalledWith('No issues in active sprints');
    });
  });

  describe('Data Grouping and Display', () => {
    test('should group issues by sprint and board', async () => {
      const mockBoards = [
        { id: 1, name: 'Board A', location: { projectKey: 'TEST' } },
        { id: 2, name: 'Board B', location: { projectKey: 'TEST' } },
      ];

      const mockSprintsA = [{ id: 100, name: 'Sprint 1' }];
      const mockSprintsB = [{ id: 200, name: 'Sprint 2' }];

      const mockIssuesA = [
        createValidIssue({
          key: 'TEST-123',
          fields: {
            summary: 'Issue from Board A',
            status: { name: 'To Do' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      const mockIssuesB = [
        createValidIssue({
          key: 'TEST-124',
          fields: {
            summary: 'Issue from Board B',
            status: { name: 'To Do' },
            reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
        http.get('*/rest/agile/1.0/board/1/sprint', () => {
          return HttpResponse.json({ values: mockSprintsA });
        }),
        http.get('*/rest/agile/1.0/board/2/sprint', () => {
          return HttpResponse.json({ values: mockSprintsB });
        }),
        http.get('*/rest/agile/1.0/sprint/100/issue', () => {
          return HttpResponse.json({ issues: mockIssuesA });
        }),
        http.get('*/rest/agile/1.0/sprint/200/issue', () => {
          return HttpResponse.json({ issues: mockIssuesB });
        }),
      );

      await showSprint();

      // Should show both sprint groups
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Board A - Sprint 1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Board B - Sprint 2'));
    });
  });
});
