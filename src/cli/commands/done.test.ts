import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Effect, Either, Schema } from 'effect';
import { HttpResponse, http } from 'msw';
import { markIssueDone } from './done.js';
import { server } from '../../test/setup-msw.js';
import { createValidIssue, validateAndReturn } from '../../test/msw-schema-validation.js';

describe('Done Command with Effect and MSW', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let mockOraInstance: any;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_REAL_API_CALLS = 'false';

    // Mock console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Mock ora spinner
    mockOraInstance = {
      start: mock(() => mockOraInstance),
      succeed: mock(() => mockOraInstance),
      fail: mock(() => mockOraInstance),
      text: '',
    };

    mock.module('ora', () => ({
      default: mock(() => mockOraInstance),
    }));

    // Mock ConfigManager
    mock.module('../../lib/config.js', () => ({
      ConfigManager: class MockConfigManager {
        async getConfig() {
          return {
            jiraUrl: 'https://test.atlassian.net',
            email: 'test@example.com',
            apiToken: 'test-token',
          };
        }
        close() {}
      },
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Effect Schema Validation', () => {
    test('should validate issue key format with Effect Schema', async () => {
      const validKeys = ['PROJ-123', 'ABC-1', 'EXAMPLE-999'];
      const invalidKeys = ['proj-123', 'PROJ123', '123-PROJ', 'invalid'];

      // Test valid keys (should not throw)
      for (const key of validKeys) {
        const IssueKeySchema = Schema.String.pipe(Schema.pattern(/^[A-Z]+-\d+$/));

        const result = Schema.decodeUnknownEither(IssueKeySchema)(key);
        expect(Either.isRight(result)).toBe(true);
      }

      // Test invalid keys (should throw process.exit)
      for (const key of invalidKeys) {
        const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        await expect(markIssueDone(key)).rejects.toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
      }
    });

    test('should handle Effect schema validation errors properly', async () => {
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(markIssueDone('invalid-key')).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Effect Composition and Error Handling', () => {
    test('should successfully mark issue as done with proper Effect chain', async () => {
      const mockIssue = createValidIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Test Issue',
          status: { name: 'In Progress' },
          reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      });

      const mockTransitions = [
        { id: '21', name: 'Done' },
        { id: '31', name: 'To Do' },
      ];

      // Set up MSW handlers
      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.json(mockIssue);
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ transitions: mockTransitions });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      await markIssueDone('PROJ-123');

      // Verify Effect-based spinner interactions
      expect(mockOraInstance.start).toHaveBeenCalledWith(expect.stringContaining('Getting issue details'));
      expect(mockOraInstance.succeed).toHaveBeenCalledWith(expect.stringContaining('Found issue'));
      expect(mockOraInstance.succeed).toHaveBeenCalledWith(expect.stringContaining('Successfully moved'));
    });

    test('should handle Effect error chains with proper resource cleanup', async () => {
      let configManagerClosed = false;

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            return {
              jiraUrl: 'https://test.atlassian.net',
              email: 'test@example.com',
              apiToken: 'test-token',
            };
          }
          close() {
            configManagerClosed = true;
          }
        },
      }));

      // Mock API failure
      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.json({ message: 'Issue not found' }, { status: 404 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(markIssueDone('PROJ-123')).rejects.toThrow('process.exit called');

      // Verify resource cleanup
      expect(configManagerClosed).toBe(true);
      expect(mockOraInstance.fail).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should demonstrate Effect flatMap and tap operations', async () => {
      const mockIssue = createValidIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Test Issue for Effect Demo',
          status: { name: 'To Do' },
          reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      });

      const mockTransitions = [
        { id: '21', name: 'Done' },
        { id: '11', name: 'In Progress' },
      ];

      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.json(mockIssue);
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ transitions: mockTransitions });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      await markIssueDone('PROJ-123');

      // Verify console outputs from Effect.tap operations
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PROJ-123: Test Issue for Effect Demo'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Current Status: To Do'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG: About to start transition process'));
    });
  });

  describe('MSW Request Interception', () => {
    test('should intercept all Jira API calls without real network requests', async () => {
      let getIssueIntercepted = false;
      let getTransitionsIntercepted = false;
      let postTransitionIntercepted = false;

      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', (info) => {
          getIssueIntercepted = true;
          expect(info.request.url).toContain('rest/api/3/issue/PROJ-123');
          return HttpResponse.json(createValidIssue({ key: 'PROJ-123' }));
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', (info) => {
          getTransitionsIntercepted = true;
          expect(info.request.url).toContain('transitions');
          return HttpResponse.json({ transitions: [{ id: '21', name: 'Done' }] });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', (info) => {
          postTransitionIntercepted = true;
          expect(info.request.url).toContain('transitions');
          return HttpResponse.json({ success: true });
        }),
      );

      await markIssueDone('PROJ-123');

      // Verify all requests were intercepted by MSW
      expect(getIssueIntercepted).toBe(true);
      expect(getTransitionsIntercepted).toBe(true);
      expect(postTransitionIntercepted).toBe(true);
    });

    test('should handle MSW network errors with proper Effect error handling', async () => {
      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.error();
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(markIssueDone('PROJ-123')).rejects.toThrow('process.exit called');
      expect(mockOraInstance.fail).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Issue Transition Logic', () => {
    test('should handle multiple transition steps with debug logging', async () => {
      const mockIssue = createValidIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Multi-step transition issue',
          status: { name: 'In Review' },
          reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      });

      const mockTransitions = [
        { id: '21', name: 'Done' },
        { id: '31', name: 'In Progress' },
        { id: '41', name: 'Rejected' },
      ];

      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.json(mockIssue);
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ transitions: mockTransitions });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      await markIssueDone('PROJ-123');

      // Verify debug logging for transitions
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Found 3 transitions'),
        expect.arrayContaining([
          expect.stringContaining('Done (21)'),
          expect.stringContaining('In Progress (31)'),
          expect.stringContaining('Rejected (41)'),
        ]),
      );
    });

    test('should handle transition failures with detailed error logging', async () => {
      const mockIssue = createValidIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Test Issue',
          status: { name: 'To Do' },
          reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      });

      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          return HttpResponse.json(mockIssue);
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ transitions: [{ id: '21', name: 'Done' }] });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', () => {
          return HttpResponse.json({ message: 'Transition not allowed' }, { status: 400 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(markIssueDone('PROJ-123')).rejects.toThrow('process.exit called');

      // Verify detailed error logging
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG: Error during transition'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG: Main error handler caught'));

      exitSpy.mockRestore();
    });
  });

  describe('Effect Resource Management Patterns', () => {
    test('should demonstrate proper Effect.tryPromise usage', async () => {
      // This test verifies that we're using Effect.tryPromise correctly
      // by testing the error conversion patterns

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            throw new Error('Database connection failed');
          }
          close() {}
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(markIssueDone('PROJ-123')).rejects.toThrow('process.exit called');

      // Should have proper error message transformation
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error:'),
        expect.stringContaining('Failed to get configuration'),
      );

      exitSpy.mockRestore();
    });

    test('should handle Effect pipeline with multiple flatMap operations', async () => {
      const mockIssue = createValidIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Test Issue',
          status: { name: 'To Do' },
          reporter: { displayName: 'Test Reporter', accountId: 'reporter' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      });
      let flatMapCount = 0;

      // Track each API call to verify Effect chain execution
      server.use(
        http.get('*/rest/api/3/issue/PROJ-123', () => {
          flatMapCount++;
          return HttpResponse.json(mockIssue);
        }),
        http.get('*/rest/api/3/issue/PROJ-123/transitions', () => {
          flatMapCount++;
          return HttpResponse.json({ transitions: [{ id: '21', name: 'Done' }] });
        }),
        http.post('*/rest/api/3/issue/PROJ-123/transitions', () => {
          flatMapCount++;
          return HttpResponse.json({ success: true });
        }),
      );

      await markIssueDone('PROJ-123');

      // Verify all Effect flatMap operations were executed
      expect(flatMapCount).toBe(3);
    });
  });
});
