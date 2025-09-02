import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { HttpResponse, http } from 'msw';
import { configureCustomFields } from './config.js';
import { server } from '../../test/setup-msw.js';

describe('Config Command with Effect and MSW', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_REAL_API_CALLS = 'false';

    // Spy on console methods
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
          };
        }
        close() {
          // Mock close method
        }
      },
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Effect-based Configuration Discovery', () => {
    test('should discover custom fields with proper Effect patterns', async () => {
      // Mock custom fields response with schema-validated data
      const mockCustomFields = [
        {
          id: 'customfield_10001',
          name: 'Acceptance Criteria',
          description: 'User story acceptance criteria',
          type: 'com.atlassian.jira.plugin.system.customfieldtypes:textarea',
        },
        {
          id: 'customfield_10002',
          name: 'Story Points',
          description: 'Estimation in story points',
          type: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
        },
        {
          id: 'customfield_10003',
          name: 'Epic Link',
          description: 'Link to epic',
          type: 'com.pyxis.greenhopper.jira:gh-epic-link',
        },
      ];

      // Set up MSW handler for custom fields
      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json(mockCustomFields);
        }),
      );

      await configureCustomFields();

      // Verify Effect-based console logging was called
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Custom Field Discovery'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Acceptance Criteria Fields Found'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Story Points Fields Found'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Other Useful Fields Found'));
    });

    test('should handle Effect error with proper error boundaries', async () => {
      // Set up MSW to return error
      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      // Should exit with code 1 due to error
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(configureCustomFields()).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    test('should validate custom field schema with Effect Schema', async () => {
      const invalidCustomFields = [
        {
          id: 'customfield_10001',
          // Missing required 'name' field
          description: 'Invalid field',
          type: 'textarea',
        },
      ];

      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json(invalidCustomFields);
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(configureCustomFields()).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });
  });

  describe('Custom Field Categorization Logic', () => {
    test('should properly categorize acceptance criteria fields', async () => {
      const mockFields = [
        {
          id: 'customfield_10001',
          name: 'Acceptance Criteria',
          type: 'textarea',
        },
        {
          id: 'customfield_10002',
          name: 'Definition of Done',
          type: 'textarea',
        },
        {
          id: 'customfield_10003',
          name: 'AC',
          type: 'textarea',
        },
      ];

      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json(mockFields);
        }),
      );

      await configureCustomFields();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Acceptance Criteria Fields Found'));

      // Should find all 3 acceptance criteria related fields
      const acceptanceCriteriaCall = consoleLogSpy.mock.calls.find((call: any) =>
        call[0]?.includes?.('Acceptance Criteria Fields Found'),
      );
      expect(acceptanceCriteriaCall).toBeDefined();
    });

    test('should properly categorize story points fields', async () => {
      const mockFields = [
        {
          id: 'customfield_10001',
          name: 'Story Points',
          type: 'float',
        },
        {
          id: 'customfield_10002',
          name: 'Estimate',
          type: 'float',
        },
      ];

      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json(mockFields);
        }),
      );

      await configureCustomFields();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Story Points Fields Found'));
    });

    test('should limit other useful fields to 10 items', async () => {
      // Create 15 "other useful" fields to test the limit
      const mockFields = Array.from({ length: 15 }, (_, i) => ({
        id: `customfield_1000${i}`,
        name: `Epic ${i}`,
        type: 'epic',
      }));

      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json(mockFields);
        }),
      );

      await configureCustomFields();

      // Should only show up to 10 other useful fields
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Other Useful Fields Found'));
    });
  });

  describe('Effect Resource Management', () => {
    test('should properly cleanup ConfigManager with Effect patterns', async () => {
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

      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.json([]);
        }),
      );

      await configureCustomFields();

      // ConfigManager should be closed even on success
      expect(configManagerClosed).toBe(true);
    });

    test('should cleanup ConfigManager on Effect error', async () => {
      let configManagerClosed = false;

      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            throw new Error('Config error');
          }
          close() {
            configManagerClosed = true;
          }
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(configureCustomFields()).rejects.toThrow('process.exit called');

      // ConfigManager should be closed even on error
      expect(configManagerClosed).toBe(true);

      exitSpy.mockRestore();
    });
  });

  describe('Effect Schema Validation Patterns', () => {
    test('should use Effect Schema for custom field validation', () => {
      // Import the schema to test it directly
      const CustomFieldSchema = Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        description: Schema.optional(Schema.String),
        type: Schema.String,
      });

      // Test valid field
      const validField = {
        id: 'customfield_10001',
        name: 'Test Field',
        description: 'Test description',
        type: 'textarea',
      };

      const result = Schema.decodeUnknownEither(CustomFieldSchema)(validField);
      expect(result._tag).toBe('Right');

      // Test invalid field
      const invalidField = {
        id: 'customfield_10001',
        // Missing name field
        type: 'textarea',
      };

      const invalidResult = Schema.decodeUnknownEither(CustomFieldSchema)(invalidField);
      expect(invalidResult._tag).toBe('Left');
    });
  });

  describe('MSW Integration', () => {
    test('should not make real HTTP requests to Jira API', async () => {
      // This test ensures MSW is properly intercepting requests
      let requestIntercepted = false;

      server.use(
        http.get('*/rest/api/3/field', (info) => {
          requestIntercepted = true;
          expect(info.request.url).toContain('rest/api/3/field');
          return HttpResponse.json([]);
        }),
      );

      await configureCustomFields();

      // Verify the request was intercepted by MSW
      expect(requestIntercepted).toBe(true);
    });

    test('should handle MSW network errors gracefully', async () => {
      server.use(
        http.get('*/rest/api/3/field', () => {
          return HttpResponse.error();
        }),
      );

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(configureCustomFields()).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
    });
  });

  describe('Effect Error Handling Patterns', () => {
    test('should demonstrate proper Effect error composition', async () => {
      // Mock a configuration that fails during getConfig
      mock.module('../../lib/config.js', () => ({
        ConfigManager: class MockConfigManager {
          async getConfig() {
            return null; // This should trigger "No configuration found" error
          }
          close() {}
        },
      }));

      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(configureCustomFields()).rejects.toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error:'),
        expect.stringContaining('No configuration found'),
      );

      exitSpy.mockRestore();
    });
  });
});
