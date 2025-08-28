import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Effect, pipe, Schema } from 'effect';

// Error types for better error handling
export class ConfigError extends Error {
  readonly _tag = 'ConfigError';
}

export class FileError extends Error {
  readonly _tag = 'FileError';
}

export class ParseError extends Error {
  readonly _tag = 'ParseError';
}

export class ValidationError extends Error {
  readonly _tag = 'ValidationError';
}

const ConfigSchema = Schema.Struct({
  jiraUrl: Schema.String.pipe(Schema.pattern(/^https?:\/\/.+/)), // URL validation
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)), // Email validation
  apiToken: Schema.String.pipe(Schema.minLength(1)),
  analysisPrompt: Schema.optional(Schema.String), // Path to analysis prompt file
  analysisCommand: Schema.optional(Schema.String), // Command for analysis tool (e.g., "claude -p")
  defaultProject: Schema.optional(Schema.String), // Default project key (e.g., "PROJ")
});

export type Config = Schema.Schema.Type<typeof ConfigSchema>;

// Settings Schema with validation
const SettingsSchema = Schema.Struct({
  askModel: Schema.optional(Schema.String),
  embeddingModel: Schema.optional(Schema.String), // Model for generating embeddings for hybrid search
  analysisModel: Schema.optional(Schema.String), // Smaller, faster model for source selection and query generation
  meilisearchIndexPrefix: Schema.optional(Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]+$/))), // Alphanumeric + hyphen/underscore
});

export type Settings = Schema.Schema.Type<typeof SettingsSchema>;

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private settingsFile: string;

  constructor() {
    this.configDir = process.env.JI_CONFIG_DIR || join(homedir(), '.ji');
    this.configFile = join(this.configDir, 'config.json');
    this.settingsFile = join(this.configDir, 'settings.json');

    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Effect-based configuration retrieval with detailed error handling
   */
  getConfigEffect(): Effect.Effect<Config, ConfigError | FileError | ParseError | ValidationError> {
    return pipe(
      // Try config file first
      Effect.sync(() => existsSync(this.configFile)),
      Effect.flatMap((fileExists): Effect.Effect<Config, ConfigError | FileError | ParseError | ValidationError> => {
        if (fileExists) {
          return pipe(
            Effect.try(() => readFileSync(this.configFile, 'utf-8')),
            Effect.mapError((error) => new FileError(`Failed to read config file: ${error}`)),
            Effect.flatMap((authData) =>
              Effect.try(() => JSON.parse(authData)).pipe(
                Effect.mapError((error) => new ParseError(`Invalid JSON in config file: ${error}`)),
              ),
            ),
            Effect.flatMap((config) =>
              Schema.decodeUnknown(ConfigSchema)(config).pipe(
                Effect.mapError((error) => new ValidationError(`Invalid config schema: ${error}`)),
              ),
            ),
          ) as Effect.Effect<Config, ConfigError | FileError | ParseError | ValidationError>;
        }

        // No configuration found
        return Effect.fail(new ConfigError('No configuration found. Please run "ji setup" first.'));
      }),
    );
  }

  async getConfig(): Promise<Config | null> {
    // Try to read from config file
    if (existsSync(this.configFile)) {
      try {
        const authData = readFileSync(this.configFile, 'utf-8');
        const config = JSON.parse(authData);
        return Schema.decodeUnknownSync(ConfigSchema)(config);
      } catch (error) {
        console.error('Failed to read config file:', error);
      }
    }

    return null;
  }

  /**
   * Effect-based configuration update
   */
  setConfigEffect(config: Config): Effect.Effect<void, ValidationError | FileError> {
    return pipe(
      Schema.decodeUnknown(ConfigSchema)(config),
      Effect.mapError((error) => new ValidationError(`Invalid config: ${error}`)),
      Effect.flatMap((validated) =>
        Effect.try(() => {
          writeFileSync(this.configFile, JSON.stringify(validated, null, 2), 'utf-8');
          chmodSync(this.configFile, 0o600);
        }).pipe(Effect.mapError((error) => new FileError(`Failed to save config: ${error}`))),
      ),
    );
  }

  async setConfig(config: Config): Promise<void> {
    const validated = Schema.decodeUnknownSync(ConfigSchema)(config);

    // Save to config file with restrictive permissions
    writeFileSync(this.configFile, JSON.stringify(validated, null, 2), 'utf-8');

    // Set file permissions to 600 (read/write for owner only)
    chmodSync(this.configFile, 0o600);
  }

  /**
   * Effect-based settings retrieval
   */
  getSettingsEffect(): Effect.Effect<Settings, FileError | ParseError | ValidationError> {
    return pipe(
      Effect.sync(() => existsSync(this.settingsFile)),
      Effect.flatMap((fileExists) => {
        if (!fileExists) {
          return Effect.succeed({} as Settings);
        }

        return pipe(
          Effect.try(() => readFileSync(this.settingsFile, 'utf-8')),
          Effect.mapError((error) => new FileError(`Failed to read settings file: ${error}`)),
          Effect.flatMap((data) =>
            Effect.try(() => JSON.parse(data)).pipe(
              Effect.mapError((error) => new ParseError(`Invalid JSON in settings file: ${error}`)),
            ),
          ),
          Effect.flatMap((settings) =>
            Schema.decodeUnknown(SettingsSchema)(settings).pipe(
              Effect.mapError((error) => new ValidationError(`Invalid settings schema: ${error}`)),
            ),
          ),
        );
      }),
    );
  }

  // Settings management (stored in JSON file)
  async getSetting(key: string): Promise<string | null> {
    try {
      if (existsSync(this.settingsFile)) {
        const settings = JSON.parse(readFileSync(this.settingsFile, 'utf-8'));
        return settings[key] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Effect-based settings update
   */
  setSettingsEffect(settings: Settings): Effect.Effect<void, FileError | ValidationError> {
    return pipe(
      Schema.decodeUnknown(SettingsSchema)(settings),
      Effect.mapError((error) => new ValidationError(`Invalid settings: ${error}`)),
      Effect.flatMap((validatedSettings) =>
        Effect.try(() => {
          writeFileSync(this.settingsFile, JSON.stringify(validatedSettings, null, 2), 'utf-8');
          chmodSync(this.settingsFile, 0o600);
        }).pipe(Effect.mapError((error) => new FileError(`Failed to save settings: ${error}`))),
      ),
    );
  }

  async setSetting(key: string, value: string): Promise<void> {
    let settings: Record<string, string> = {};
    if (existsSync(this.settingsFile)) {
      try {
        settings = JSON.parse(readFileSync(this.settingsFile, 'utf-8'));
      } catch {}
    }
    settings[key] = value;
    writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    chmodSync(this.settingsFile, 0o600);
  }

  async getSettings(): Promise<Settings> {
    try {
      if (existsSync(this.settingsFile)) {
        const settings = JSON.parse(readFileSync(this.settingsFile, 'utf-8'));
        return {
          askModel: settings.askModel || undefined,
          embeddingModel: settings.embeddingModel || undefined,
          analysisModel: settings.analysisModel || undefined,
          meilisearchIndexPrefix: settings.meilisearchIndexPrefix || undefined,
        };
      }
    } catch {}

    return {};
  }

  /**
   * Effect-based Meilisearch index prefix retrieval
   */
  getMeilisearchIndexPrefixEffect(): Effect.Effect<string, never> {
    return pipe(
      this.getSettingsEffect(),
      Effect.orElseSucceed(() => ({}) as Settings),
      Effect.flatMap((settings) => {
        if (settings.meilisearchIndexPrefix) {
          return Effect.succeed(settings.meilisearchIndexPrefix);
        }

        // Try to get from config email
        return pipe(
          this.getConfigEffect(),
          Effect.map((config) => {
            const emailLocal = config.email.split('@')[0];
            // Sanitize for Meilisearch (alphanumeric + hyphen/underscore only)
            return emailLocal.replace(/[^a-zA-Z0-9_-]/g, '_');
          }),
          Effect.orElseSucceed(() => 'ji'), // Final fallback
        );
      }),
    );
  }

  /**
   * Get the Meilisearch index prefix with default fallback
   * Returns user's email local part (before @) as default to ensure uniqueness
   */
  async getMeilisearchIndexPrefix(): Promise<string> {
    const settings = await this.getSettings();
    if (settings.meilisearchIndexPrefix) {
      return settings.meilisearchIndexPrefix;
    }

    // Use email local part as default prefix for uniqueness
    try {
      const config = await this.getConfig();
      if (config) {
        const emailLocal = config.email.split('@')[0];
        // Sanitize for Meilisearch (alphanumeric + hyphen/underscore only)
        return emailLocal.replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    } catch {
      // Fallback if no config
    }

    return 'ji'; // Final fallback
  }

  close() {
    // No cleanup needed for file-based storage
  }
}
