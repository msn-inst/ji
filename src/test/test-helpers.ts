// Mock configuration for tests
export const mockConfig = {
  jiraUrl: 'https://example.atlassian.net',
  email: 'test@example.com',
  apiToken: 'mock-token',
  userId: 'test-user-id',
};

// Helper to capture console output
export function captureConsoleOutput() {
  let output = '';
  let errorOutput = '';

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    output += `${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' ')}\n`;
  };

  console.error = (...args: unknown[]) => {
    errorOutput += `${args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' ')}\n`;
  };

  return {
    getOutput: () => output,
    getErrorOutput: () => errorOutput,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

// Helper to run CLI command in test environment
export async function runCLICommand(commandFn: () => Promise<void>) {
  const capture = captureConsoleOutput();

  try {
    await commandFn();
    return {
      output: capture.getOutput(),
      errorOutput: capture.getErrorOutput(),
      exitCode: 0,
    };
  } catch (error) {
    return {
      output: capture.getOutput(),
      errorOutput: capture.getErrorOutput(),
      error,
      exitCode: 1,
    };
  } finally {
    capture.restore();
  }
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Helper to isolate test environment for ConfigManager tests
 * Creates a temporary directory and sets JI_CONFIG_DIR to it
 * Returns a cleanup function that must be called in afterEach or finally
 */
export function isolateTestEnvironment(): {
  tempDir: string;
  cleanup: () => void;
} {
  const originalConfigDir = process.env.JI_CONFIG_DIR;
  const tempDir = mkdtempSync(join(tmpdir(), 'ji-test-'));

  process.env.JI_CONFIG_DIR = tempDir;

  const cleanup = () => {
    // Restore original environment
    if (originalConfigDir === undefined) {
      delete process.env.JI_CONFIG_DIR;
    } else {
      process.env.JI_CONFIG_DIR = originalConfigDir;
    }

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { tempDir, cleanup };
}

/**
 * Helper to save and restore environment variables
 */
export class EnvironmentSaver {
  private saved: Map<string, string | undefined> = new Map();

  save(key: string): void {
    this.saved.set(key, process.env[key]);
  }

  restore(): void {
    for (const [key, value] of this.saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.saved.clear();
  }
}
