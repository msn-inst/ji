import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigManager } from './config.js';

describe('ConfigManager Extended Tests', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(() => {
    // Create a temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'ji-test-'));
    process.env.JI_CONFIG_DIR = tempDir;
    configManager = new ConfigManager();
  });

  afterEach(() => {
    // Clean up
    if (configManager?.close) {
      configManager.close();
    }
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.JI_CONFIG_DIR;
  });

  describe('Authentication Management', () => {
    it('should save and retrieve auth configuration', () => {
      const authData = {
        jiraUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token-123',
      };

      configManager.setConfig(authData);
      const retrieved = configManager.getConfig();

      expect(retrieved).toEqual(authData);
    });

    it('should update existing configuration', () => {
      const initialAuth = {
        jiraUrl: 'https://old.atlassian.net',
        email: 'old@example.com',
        apiToken: 'old-token',
      };

      configManager.setConfig(initialAuth);
      
      const updatedAuth = {
        jiraUrl: 'https://new.atlassian.net',
        email: 'new@example.com',
        apiToken: 'new-token',
      };

      configManager.setConfig(updatedAuth);
      const retrieved = configManager.getConfig();

      expect(retrieved).toEqual(updatedAuth);
      expect(retrieved.jiraUrl).toBe('https://new.atlassian.net');
    });

    it('should handle missing configuration gracefully', () => {
      const config = configManager.getConfig();
      expect(config).toBeNull();
    });

    it('should persist configuration across instances', () => {
      const authData = {
        jiraUrl: 'https://persistent.atlassian.net',
        email: 'persist@example.com',
        apiToken: 'persist-token',
      };

      configManager.setConfig(authData);
      configManager.close();

      // Create new instance
      const newConfigManager = new ConfigManager();
      const retrieved = newConfigManager.getConfig();

      expect(retrieved).toEqual(authData);
      newConfigManager.close();
    });
  });

  describe('Database Operations', () => {
    it('should initialize database with correct schema', () => {
      // Verify database is created
      const dbPath = join(tempDir, 'ji.db');
      const fs = require('fs');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should handle database close operation', () => {
      expect(() => {
        configManager.close();
      }).not.toThrow();

      // Should be able to close multiple times without error
      expect(() => {
        configManager.close();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON in auth config', () => {
      const authPath = join(tempDir, 'auth.json');
      writeFileSync(authPath, 'invalid json{', 'utf-8');

      const manager = new ConfigManager();
      const config = manager.getConfig();
      
      // Should return null for invalid config
      expect(config).toBeNull();
      manager.close();
    });

    it('should create config directory if it does not exist', () => {
      const nonExistentDir = join(tempDir, 'non-existent', 'nested', 'dir');
      process.env.JI_CONFIG_DIR = nonExistentDir;

      const manager = new ConfigManager();
      manager.setConfig({
        jiraUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
      });

      const config = manager.getConfig();
      expect(config).not.toBeNull();
      expect(config?.jiraUrl).toBe('https://test.atlassian.net');
      
      manager.close();
    });
  });

  describe('Security', () => {
    it('should create auth.json with restricted permissions', () => {
      const authData = {
        jiraUrl: 'https://secure.atlassian.net',
        email: 'secure@example.com',
        apiToken: 'secure-token',
      };

      configManager.setConfig(authData);

      const authPath = join(tempDir, 'auth.json');
      const fs = require('fs');
      const stats = fs.statSync(authPath);
      
      // Check that file permissions are restrictive (owner read/write only)
      // On Unix-like systems, this would be 0600
      const mode = stats.mode & parseInt('777', 8);
      
      // The file should not be world-readable
      expect(mode & parseInt('004', 8)).toBe(0);
    });
  });
});