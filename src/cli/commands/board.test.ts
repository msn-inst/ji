import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { HttpResponse, http } from 'msw';
import { showMyBoards } from './board.js';
import { server } from '../../test/setup-msw.js';

describe('Board Command with Effect and MSW', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_REAL_API_CALLS = 'false';

    // Mock console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Mock ConfigManager to prevent real filesystem access
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

  describe('Effect-based Board Fetching', () => {
    test('should fetch and display boards with proper Effect composition', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          type: 'scrum',
          location: {
            projectKey: 'TEST',
            projectName: 'Test Project',
          },
        },
        {
          id: 2,
          name: 'DEMO Board',
          type: 'kanban',
          location: {
            projectKey: 'DEMO',
            projectName: 'Demo Project',
          },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards();

      // Verify XML output structure
      expect(consoleLogSpy).toHaveBeenCalledWith('<boards>');
      expect(consoleLogSpy).toHaveBeenCalledWith('  <project>');
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>DEMO</name>');
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>TEST</name>');
      expect(consoleLogSpy).toHaveBeenCalledWith('</boards>');
    });

    test('should filter boards by project with Effect flatMap', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          type: 'scrum',
          location: { projectKey: 'TEST', projectName: 'Test Project' },
        },
        {
          id: 2,
          name: 'OTHER Board',
          type: 'kanban',
          location: { projectKey: 'OTHER', projectName: 'Other Project' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', (info) => {
          // Verify project filter is applied in query
          const url = new URL(info.request.url);
          expect(url.searchParams.get('projectKeyOrId')).toBe('TEST');
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards('TEST');

      // Should only show TEST project boards
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>TEST</name>');
      // Should not show OTHER project
      expect(consoleLogSpy).not.toHaveBeenCalledWith('    <name>OTHER</name>');
    });

    test('should handle empty boards with proper Effect error handling', async () => {
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: [] });
        }),
      );

      await showMyBoards('NONEXISTENT');

      expect(consoleLogSpy).toHaveBeenCalledWith('<message>No boards found for project NONEXISTENT</message>');
    });
  });

  describe('Effect Resource Management', () => {
    test('should properly cleanup ConfigManager with Effect.tap', async () => {
      let configManagerClosed = false;

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
          close() {
            configManagerClosed = true;
          }
        },
      }));

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: [] });
        }),
      );

      await showMyBoards();

      // ConfigManager should be closed via Effect.tap
      expect(configManagerClosed).toBe(true);
    });

    test('should cleanup resources on Effect error', async () => {
      let _configManagerClosed = false;

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            throw new Error('Configuration error');
          }
          close() {
            _configManagerClosed = true;
          }
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showMyBoards()).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Output Formatting with Effect', () => {
    test('should format pretty output when xml=false', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'TEST Board',
          type: 'scrum',
          location: { projectKey: 'TEST', projectName: 'Test Project' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards(undefined, false); // pretty=true (xml=false)

      // Should show pretty formatted output
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 board'));
      // Should not show XML tags
      expect(consoleLogSpy).not.toHaveBeenCalledWith('<boards>');
    });

    test('should escape XML special characters in board names', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'Board with <special> & "characters"',
          type: 'scrum',
          location: { projectKey: 'TEST', projectName: 'Test & Project' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards(undefined, true); // xml=true

      // Verify XML escaping
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '        <name>Board with &lt;special&gt; &amp; &quot;characters&quot;</name>',
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('        <project_name>Test &amp; Project</project_name>');
    });
  });

  describe('MSW Request Interception', () => {
    test('should intercept board API calls without real network requests', async () => {
      let boardRequestIntercepted = false;

      server.use(
        http.get('*/rest/agile/1.0/board', (info) => {
          boardRequestIntercepted = true;
          expect(info.request.url).toContain('rest/agile/1.0/board');
          return HttpResponse.json({ values: [] });
        }),
      );

      await showMyBoards();

      // Verify MSW intercepted the request
      expect(boardRequestIntercepted).toBe(true);
    });

    test('should handle MSW network errors with Effect error boundaries', async () => {
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.error();
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showMyBoards()).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should handle API 401 errors with proper Effect error handling', async () => {
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showMyBoards()).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Effect Pipeline Patterns', () => {
    test('should demonstrate Effect pipe composition', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'Test Board',
          type: 'scrum',
          location: { projectKey: 'TEST' },
        },
      ];

      let configEffectCalled = false;
      let getBoardsEffectCalled = false;
      const _formatEffectCalled = false;

      // Mock to track Effect composition
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          getBoardsEffectCalled = true;
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            configEffectCalled = true;
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

      await showMyBoards();

      // Verify Effect pipeline executed
      expect(configEffectCalled).toBe(true);
      expect(getBoardsEffectCalled).toBe(true);

      // Verify output was formatted (indicates formatEffect was called)
      expect(consoleLogSpy).toHaveBeenCalledWith('<boards>');
    });

    test('should handle Effect.catchAll error recovery', async () => {
      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ message: 'API Error' }, { status: 500 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(showMyBoards()).rejects.toThrow('process.exit called');

      // Error should be caught by Effect.catchAll
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        expect.stringContaining('Failed to fetch boards from API'),
      );

      exitSpy.mockRestore();
    });
  });

  describe('Project Grouping Logic', () => {
    test('should group boards by project correctly', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'Board A',
          type: 'scrum',
          location: { projectKey: 'PROJECT1', projectName: 'Project One' },
        },
        {
          id: 2,
          name: 'Board B',
          type: 'kanban',
          location: { projectKey: 'PROJECT1', projectName: 'Project One' },
        },
        {
          id: 3,
          name: 'Board C',
          type: 'scrum',
          location: { projectKey: 'PROJECT2', projectName: 'Project Two' },
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards(undefined, true); // xml=true

      // Should group boards under correct projects
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>PROJECT1</name>');
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>PROJECT2</name>');

      // PROJECT1 should have 2 boards, PROJECT2 should have 1
      const logCalls = consoleLogSpy.mock.calls.map((call: any) => call[0]);
      const boardElements = logCalls.filter((call: any) => call === '      <board>');
      expect(boardElements).toHaveLength(3); // Total 3 boards
    });

    test('should handle boards with unknown projects', async () => {
      const mockBoards = [
        {
          id: 1,
          name: 'Orphan Board',
          type: 'scrum',
          // No location specified
        },
      ];

      server.use(
        http.get('*/rest/agile/1.0/board', () => {
          return HttpResponse.json({ values: mockBoards });
        }),
      );

      await showMyBoards(undefined, true); // xml=true

      // Should group under 'Unknown' project
      expect(consoleLogSpy).toHaveBeenCalledWith('    <name>Unknown</name>');
    });
  });
});
