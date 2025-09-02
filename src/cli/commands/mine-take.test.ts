import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { takeIssue } from './mine-take.js';
import { server } from '../../test/setup-msw.js';
import { createValidUser, validateAndReturn } from '../../test/msw-schema-validation.js';
import { UserSchema } from '../../lib/effects/jira/schemas.js';

describe('Mine-Take Command with MSW (needs Effect migration)', () => {
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
          };
        }
        close() {}
      },
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Issue Assignment Flow', () => {
    test('should successfully assign issue to current user', async () => {
      const mockUser = createValidUser({
        accountId: 'test-account-123',
        displayName: 'Test User',
        emailAddress: 'test@example.com',
      });

      server.use(
        // Mock current user endpoint
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(validateAndReturn(UserSchema, mockUser, 'Current User'));
        }),
        // Mock issue assignment endpoint
        http.put('*/rest/api/3/issue/TEST-123/assignee', async (info) => {
          const requestBody = (await info.request.json()) as any;
          expect(requestBody.accountId).toBe('test-account-123');
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('TEST-123');

      // Verify user assignment flow
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Assigning TEST-123 to Test User'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Assigned TEST-123 to you'));
    });

    test('should validate issue key format (needs Effect migration)', async () => {
      const invalidKeys = ['invalid-key', 'test123', '123-TEST', 'lowercase-123'];

      for (const invalidKey of invalidKeys) {
        const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        // The current implementation doesn't validate issue key format
        // This test shows the need for Effect Schema validation
        server.use(
          http.get('*/rest/api/3/myself', () => {
            return HttpResponse.json(
              createValidUser({
                accountId: 'test-account',
                displayName: 'Test User',
              }),
            );
          }),
          http.put(`*/rest/api/3/issue/${invalidKey}/assignee`, () => {
            return HttpResponse.json({ message: 'Issue not found' }, { status: 404 });
          }),
        );

        await expect(takeIssue(invalidKey)).rejects.toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalledWith(1);

        exitSpy.mockRestore();
      }
    });
  });

  describe('Error Handling (needs Effect migration)', () => {
    test('should handle missing configuration', async () => {
      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            return null; // No configuration found
          }
          close() {}
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(takeIssue('TEST-123')).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No configuration found'));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should handle current user API failure', async () => {
      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(takeIssue('TEST-123')).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should handle issue assignment failure', async () => {
      const mockUser = createValidUser({
        accountId: 'test-account',
        displayName: 'Test User',
      });

      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/TEST-123/assignee', () => {
          return HttpResponse.json({ message: 'Issue not found or no permission' }, { status: 404 });
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(takeIssue('TEST-123')).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Resource Management (needs Effect migration)', () => {
    test('should properly cleanup ConfigManager', async () => {
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

      const mockUser = createValidUser({
        accountId: 'test-account',
        displayName: 'Test User',
      });

      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/TEST-123/assignee', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('TEST-123');

      // ConfigManager should be closed in finally block
      expect(configManagerClosed).toBe(true);
    });

    test('should cleanup ConfigManager even on error', async () => {
      let configManagerClosed = false;

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            throw new Error('Config read error');
          }
          close() {
            configManagerClosed = true;
          }
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(takeIssue('TEST-123')).rejects.toThrow('process.exit called');

      // ConfigManager should still be closed on error
      expect(configManagerClosed).toBe(true);

      exitSpy.mockRestore();
    });
  });

  describe('MSW Integration', () => {
    test('should intercept all take-related API calls', async () => {
      let getCurrentUserIntercepted = false;
      let assignIssueIntercepted = false;

      const mockUser = createValidUser({
        accountId: 'test-account',
        displayName: 'Test User',
      });

      server.use(
        http.get('*/rest/api/3/myself', (info) => {
          getCurrentUserIntercepted = true;
          expect(info.request.url).toContain('rest/api/3/myself');
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/TEST-123/assignee', (info) => {
          assignIssueIntercepted = true;
          expect(info.request.url).toContain('issue/TEST-123/assignee');
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('TEST-123');

      // Verify both API calls were intercepted by MSW
      expect(getCurrentUserIntercepted).toBe(true);
      expect(assignIssueIntercepted).toBe(true);
    });

    test('should not make real HTTP requests to Jira', async () => {
      const mockUser = createValidUser({
        accountId: 'test-account',
        displayName: 'Test User',
      });

      server.use(
        http.get('*/rest/api/3/myself', (info) => {
          // Ensure we're not hitting real Atlassian
          expect(info.request.url).not.toContain('atlassian.com');
          expect(info.request.url).toContain('test.atlassian.net');
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/TEST-123/assignee', (info) => {
          expect(info.request.url).not.toContain('atlassian.com');
          expect(info.request.url).toContain('test.atlassian.net');
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('TEST-123');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Assigned TEST-123 to you'));
    });

    test('should handle MSW network errors gracefully', async () => {
      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.error();
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(takeIssue('TEST-123')).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('User Display and Assignment', () => {
    test('should display correct user information during assignment', async () => {
      const mockUser = createValidUser({
        accountId: 'user-123',
        displayName: 'John Doe',
        emailAddress: 'john.doe@company.com',
      });

      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/PROJ-456/assignee', async (info) => {
          const requestBody = (await info.request.json()) as any;
          expect(requestBody.accountId).toBe('user-123');
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('PROJ-456');

      // Verify correct user display
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Assigning PROJ-456 to John Doe'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Assigned PROJ-456 to you'));
    });

    test('should handle users with special characters in display names', async () => {
      const mockUser = createValidUser({
        accountId: 'user-special',
        displayName: "Jean-Luc O'Connor & Associates",
        emailAddress: 'jean@company.com',
      });

      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/TEST-789/assignee', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      await takeIssue('TEST-789');

      // Should handle special characters in display name
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Jean-Luc O'Connor & Associates"));
    });
  });

  describe('Needs Effect Migration', () => {
    test('demonstrates current limitations that Effect would solve', async () => {
      // Current implementation lacks:
      // 1. Issue key validation with Effect Schema
      // 2. Proper error composition with Effect.catchAll
      // 3. Resource management with Effect.scoped
      // 4. Type-safe operations with Effect.tryPromise

      const mockUser = createValidUser({
        accountId: 'test-account',
        displayName: 'Test User',
      });

      server.use(
        http.get('*/rest/api/3/myself', () => {
          return HttpResponse.json(mockUser);
        }),
        http.put('*/rest/api/3/issue/invalid-format/assignee', () => {
          return HttpResponse.json({ success: true });
        }),
      );

      // Current implementation doesn't validate issue key format
      await takeIssue('invalid-format');

      // With Effect, this should fail at validation step
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Assigned invalid-format to you'));
    });
  });
});
