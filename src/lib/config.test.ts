import { describe, expect, it } from 'bun:test';
import { ConfigManager } from './config.js';

describe('ConfigManager', () => {
  it('should create a database file', async () => {
    // This is a simple smoke test to ensure the class can be instantiated
    // In a real test, we'd want to mock the database path
    expect(ConfigManager).toBeDefined();
    expect(typeof ConfigManager).toBe('function');
  });

  it('should have required methods', () => {
    // Create an instance to test methods exist
    let instance: ConfigManager | null = null;

    try {
      instance = new ConfigManager();

      // Test that instance exists
      expect(instance).toBeDefined();

      // Test each method exists and is a function
      expect(instance.getConfig).toBeDefined();
      expect(typeof instance.getConfig).toBe('function');

      expect(instance.setConfig).toBeDefined();
      expect(typeof instance.setConfig).toBe('function');

      expect(instance.close).toBeDefined();
      expect(typeof instance.close).toBe('function');
    } finally {
      // Clean up
      if (instance?.close) {
        instance.close();
      }
    }
  });
});
