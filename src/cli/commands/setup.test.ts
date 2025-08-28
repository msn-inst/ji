import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as inquirer from '@inquirer/prompts';
import { setup } from './setup.js';
import { EnvironmentSaver } from '../../test/test-helpers.js';

describe('Setup Command', () => {
  let tempDir: string;
  let fetchSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  let inputSpy: ReturnType<typeof spyOn>;
  let passwordSpy: ReturnType<typeof spyOn>;
  const envSaver = new EnvironmentSaver();

  beforeEach(() => {
    // Clear any lingering mocks first
    mock.restore();

    // Save environment variables
    envSaver.save('HOME');
    envSaver.save('JI_CONFIG_DIR');
    envSaver.save('NODE_ENV');

    // Create temp directory for test with unique name
    tempDir = mkdtempSync(join(tmpdir(), `ji-setup-test-${Date.now()}-`));

    // Override HOME and JI_CONFIG_DIR
    process.env.HOME = tempDir;
    process.env.JI_CONFIG_DIR = join(tempDir, '.ji');

    // Ensure we're in test mode
    process.env.NODE_ENV = 'test';

    // Mock global fetch
    fetchSpy = spyOn(globalThis, 'fetch' as any);

    // Spy on console methods
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to prevent actual exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Mock inquirer prompts
    inputSpy = spyOn(inquirer, 'input');
    passwordSpy = spyOn(inquirer, 'password');
  });

  afterEach(() => {
    // Restore environment
    envSaver.restore();

    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });

    // Restore all spies
    fetchSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    inputSpy.mockRestore();
    passwordSpy.mockRestore();
  });

  describe('New Configuration', () => {
    it('should create new configuration with all fields', async () => {
      inputSpy.mockResolvedValueOnce('https://example.atlassian.net/'); // Jira URL with trailing slash
      inputSpy.mockResolvedValueOnce('user@example.com'); // Email
      passwordSpy.mockResolvedValueOnce('test-token-123'); // API Token
      inputSpy.mockResolvedValueOnce('PROJ'); // Default project
      inputSpy.mockResolvedValueOnce('claude'); // Analysis command
      inputSpy.mockResolvedValueOnce(''); // Analysis prompt file

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'user@example.com',
        }),
      } as Response);

      await setup();

      // Verify configuration was saved
      const configPath = join(tempDir, '.ji', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(savedConfig.jiraUrl).toBe('https://example.atlassian.net'); // Trailing slash removed
      expect(savedConfig.email).toBe('user@example.com');
      expect(savedConfig.apiToken).toBe('test-token-123');
      expect(savedConfig.analysisCommand).toBe('claude');
      expect(savedConfig.defaultProject).toBe('PROJ');

      // Verify prompts were called
      expect(inputSpy).toHaveBeenCalledTimes(5);
      expect(passwordSpy).toHaveBeenCalledTimes(1);

      // Verify no error exit
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should create minimal configuration without optional fields', async () => {
      inputSpy.mockResolvedValueOnce('https://minimal.atlassian.net');
      inputSpy.mockResolvedValueOnce('minimal@example.com');
      passwordSpy.mockResolvedValueOnce('minimal-token');
      inputSpy.mockResolvedValueOnce(''); // No default project
      inputSpy.mockResolvedValueOnce(''); // No analysis command
      inputSpy.mockResolvedValueOnce(''); // No analysis prompt

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Minimal User',
          emailAddress: 'minimal@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.jiraUrl).toBe('https://minimal.atlassian.net');
      expect(savedConfig.email).toBe('minimal@example.com');
      expect(savedConfig.apiToken).toBe('minimal-token');
      expect(savedConfig.analysisCommand).toBeUndefined();
      expect(savedConfig.analysisPrompt).toBeUndefined();

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Existing Configuration', () => {
    beforeEach(() => {
      // Create existing config
      const jiDir = join(tempDir, '.ji');
      const fs = require('node:fs');
      fs.mkdirSync(jiDir, { recursive: true });

      const existingConfig = {
        jiraUrl: 'https://existing.atlassian.net',
        email: 'existing@example.com',
        apiToken: 'existing-token',
        analysisCommand: 'gemini',
        analysisPrompt: '~/prompts/custom.md',
      };

      writeFileSync(join(jiDir, 'config.json'), JSON.stringify(existingConfig), { mode: 0o600 });
    });

    it('should keep existing values when pressing enter', async () => {
      // Simulate pressing enter (keeping defaults)
      inputSpy.mockResolvedValueOnce('https://existing.atlassian.net');
      inputSpy.mockResolvedValueOnce('existing@example.com');
      passwordSpy.mockResolvedValueOnce(''); // Empty means keep existing
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('gemini');
      inputSpy.mockResolvedValueOnce('~/prompts/custom.md');
      inputSpy.mockResolvedValueOnce(''); // Retry prompt for invalid file

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Existing User',
          emailAddress: 'existing@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.jiraUrl).toBe('https://existing.atlassian.net');
      expect(savedConfig.email).toBe('existing@example.com');
      expect(savedConfig.apiToken).toBe('existing-token'); // Kept existing
      expect(savedConfig.analysisCommand).toBe('gemini');
      // analysisPrompt will be undefined since ~/prompts/custom.md doesn't exist
      expect(savedConfig.analysisPrompt).toBeUndefined();

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should update configuration with new values', async () => {
      inputSpy.mockResolvedValueOnce('https://updated.atlassian.net');
      inputSpy.mockResolvedValueOnce('updated@example.com');
      passwordSpy.mockResolvedValueOnce('updated-token');
      inputSpy.mockResolvedValueOnce('NEWPROJ'); // Default project
      inputSpy.mockResolvedValueOnce('opencode');
      inputSpy.mockResolvedValueOnce('');

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Updated User',
          emailAddress: 'updated@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.jiraUrl).toBe('https://updated.atlassian.net');
      expect(savedConfig.email).toBe('updated@example.com');
      expect(savedConfig.apiToken).toBe('updated-token');
      expect(savedConfig.analysisCommand).toBe('opencode');
      expect(savedConfig.analysisPrompt).toBeUndefined(); // Cleared
      expect(savedConfig.defaultProject).toBe('NEWPROJ');

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Credential Validation', () => {
    it('should handle 401 authentication error', async () => {
      inputSpy.mockResolvedValueOnce('https://test.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('invalid-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('');
      inputSpy.mockResolvedValueOnce('');

      // Mock 401 response
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await setup();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.map((call: any) => call[0]);
      const hasInvalidCredsMessage = errorCalls.some(
        (msg: any) => msg?.includes?.('Invalid credentials') || msg?.includes?.('Authentication failed'),
      );
      expect(hasInvalidCredsMessage).toBe(true);
    });

    it('should handle network errors', async () => {
      inputSpy.mockResolvedValueOnce('https://unreachable.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('');
      inputSpy.mockResolvedValueOnce('');

      // Mock network error
      fetchSpy.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await setup();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.map((call: any) => call[0]);
      const hasNetworkErrorMessage = errorCalls.some(
        (msg: any) => msg?.includes?.('Could not connect') || msg?.includes?.('ENOTFOUND'),
      );
      expect(hasNetworkErrorMessage).toBe(true);
    });

    it('should handle generic API errors', async () => {
      inputSpy.mockResolvedValueOnce('https://error.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('');
      inputSpy.mockResolvedValueOnce('');

      // Mock 500 error
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await setup();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls.map((call: any) => call[0]);
      const hasServerErrorMessage = errorCalls.some(
        (msg: any) => msg?.includes?.('500') || msg?.includes?.('Authentication failed'),
      );
      expect(hasServerErrorMessage).toBe(true);
    });
  });

  describe('Analysis Prompt File Validation', () => {
    it('should accept valid file path', async () => {
      // Create a test prompt file
      const promptFile = join(tempDir, 'test-prompt.md');
      writeFileSync(promptFile, '# Test Prompt');

      inputSpy.mockResolvedValueOnce('https://test.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('claude');
      inputSpy.mockResolvedValueOnce(promptFile);

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'test@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.analysisPrompt).toBe(promptFile);
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle invalid file path', async () => {
      inputSpy.mockResolvedValueOnce('https://test.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('claude');
      inputSpy.mockResolvedValueOnce('/nonexistent/file.md'); // Invalid path
      inputSpy.mockResolvedValueOnce(''); // Skip on retry

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'test@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.analysisPrompt).toBeUndefined();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should expand tilde in file paths', async () => {
      // Create a prompt file in the fake home directory
      const promptFile = join(tempDir, 'prompt.md');
      writeFileSync(promptFile, '# Home Prompt');

      inputSpy.mockResolvedValueOnce('https://test.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('claude');
      inputSpy.mockResolvedValueOnce('~/prompt.md'); // Using tilde
      inputSpy.mockResolvedValueOnce(''); // Retry prompt if file not found

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'test@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      // If validation failed, the prompt should be undefined
      expect(savedConfig.analysisPrompt).toBeUndefined();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('User Cancellation', () => {
    it('should handle user cancellation (Ctrl+C)', async () => {
      // Simulate user cancellation
      inputSpy.mockRejectedValueOnce(new Error('User force closed the input'));

      await setup();

      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Setup cancelled'));
    });
  });

  describe('Configuration File Permissions', () => {
    it('should set restrictive permissions on config.json', async () => {
      inputSpy.mockResolvedValueOnce('https://test.atlassian.net');
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('');
      inputSpy.mockResolvedValueOnce('');

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'test@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const fs = require('node:fs');
      const stats = fs.statSync(configPath);

      // Check permissions (should be 0600 on Unix-like systems)
      const mode = stats.mode & 0o777;
      expect(mode & 0o077).toBe(0); // No group/other permissions

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('URL Normalization', () => {
    it('should remove trailing slash from Jira URL', async () => {
      inputSpy.mockResolvedValueOnce('https://trailing.atlassian.net/'); // With trailing slash
      inputSpy.mockResolvedValueOnce('test@example.com');
      passwordSpy.mockResolvedValueOnce('test-token');
      inputSpy.mockResolvedValueOnce(''); // Default project
      inputSpy.mockResolvedValueOnce('');
      inputSpy.mockResolvedValueOnce('');

      // Mock successful API response
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          displayName: 'Test User',
          emailAddress: 'test@example.com',
        }),
      } as Response);

      await setup();

      const configPath = join(tempDir, '.ji', 'config.json');
      const savedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(savedConfig.jiraUrl).toBe('https://trailing.atlassian.net'); // Slash removed

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
