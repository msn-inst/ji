# Development Guide

This guide covers everything you need to know to contribute to ji.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Publishing](#publishing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Bun** (v1.0.0 or higher) - JavaScript runtime and package manager
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Git** - Version control
- **Jira Account** - For testing against real Atlassian APIs
- **AI Tool** (optional) - Claude, Gemini, or Ollama for analyze command

## Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/aaronshaf/ji.git
cd ji

# Install dependencies
bun install

# Link for local development
bun link
```

### 2. Configure Authentication

```bash
# Set up Jira credentials
ji setup

# Or manually create ~/.ji/config.json
{
  "jiraUrl": "https://your-domain.atlassian.net",
  "username": "your-email@example.com",
  "apiToken": "your-api-token"
}
```

### 3. Development Commands

```bash
# Run in watch mode (auto-reload on changes)
bun run dev

# Run specific command for testing
bun run src/cli.ts mine
bun run src/cli.ts issue view PROJ-123

# Run with debug output
DEBUG=* bun run src/cli.ts mine
```

## Project Architecture

### Directory Structure

```
ji/
├── src/
│   ├── cli.ts                 # Main CLI entry point
│   ├── cli/
│   │   ├── index.ts           # Command router
│   │   ├── commands/          # Individual command implementations
│   │   │   ├── analyze.ts     # AI analysis command (Effect-based)
│   │   │   ├── auth.ts        # Authentication setup
│   │   │   ├── board.ts       # Board and sprint management
│   │   │   ├── comment.ts     # Add comments (Effect-based)
│   │   │   ├── issue.ts       # Issue viewing (Effect-based)
│   │   │   ├── mine.ts        # Personal issues with filtering
│   │   │   ├── open.ts        # Open issues in browser
│   │   │   ├── sprint.ts      # Sprint overview
│   │   │   ├── take.ts        # Assign issues to self
│   │   │   └── test.ts        # Testing framework (Effect-based)
│   │   ├── formatters/        # Output formatting utilities
│   │   │   ├── issue.ts       # Issue display formatting
│   │   │   ├── progress.ts    # Progress bars
│   │   │   └── time.ts        # Time formatting
│   │   └── utils/             # CLI utilities
│   │       └── time-parser.ts # Human time to JQL conversion
│   └── lib/
│       ├── config.ts          # Configuration management
│       ├── jira-client.ts     # Jira API client
│       ├── jira-client/       # Modular Jira client components
│       │   ├── jira-client-base.ts
│       │   ├── jira-client-boards.ts
│       │   ├── jira-client-comments.ts
│       │   ├── jira-client-issues.ts
│       │   ├── jira-client-sprints.ts
│       │   ├── jira-client-types.ts
│       │   └── jira-client-users.ts
│       ├── confluence-client.ts      # Confluence API client
│       ├── confluence-converter.ts   # Storage format converter
│       └── effects/           # Effect-based utilities
│           ├── errors.ts      # Custom error types
│           ├── layers.ts      # Effect layers
│           ├── jira/          # Jira-specific Effect code
│           └── test-layers.ts # Testing utilities
├── scripts/                   # Build and maintenance scripts
├── docs/                      # Documentation
└── test/                      # Test files
```

### Key Design Patterns

#### 1. Effect-Based Architecture

We use Effect for type-safe, composable operations with proper error handling:

```typescript
import { Effect, pipe } from 'effect';
import { Schema } from '@effect/schema';

// Define schemas
const IssueSchema = Schema.Struct({
  key: Schema.String,
  fields: Schema.Struct({
    summary: Schema.String,
    status: Schema.optional(Schema.Struct({
      name: Schema.String
    }))
  })
});

// Create effects
const fetchIssue = (key: string) =>
  Effect.tryPromise({
    try: () => jiraClient.getIssue(key),
    catch: (error) => new JiraApiError(`Failed to fetch ${key}: ${error}`)
  });

// Compose with pipe
const processIssue = (key: string) =>
  pipe(
    fetchIssue(key),
    Effect.flatMap(Schema.decodeUnknown(IssueSchema)),
    Effect.map(formatIssue),
    Effect.catchAll(handleError)
  );
```

#### 2. Command Structure

Each command follows this pattern:

```typescript
// commands/example.ts
export async function command(args: string[]): Promise<void> {
  // 1. Parse arguments
  const options = parseArgs(args);
  
  // 2. Create Effect pipeline
  const effect = pipe(
    validateOptions(options),
    Effect.flatMap(fetchData),
    Effect.flatMap(processData),
    Effect.flatMap(displayResults)
  );
  
  // 3. Run Effect
  await Effect.runPromise(
    effect.pipe(
      Effect.catchAll(error => 
        Console.error(`Error: ${error.message}`)
      )
    )
  );
}
```

#### 3. API Client Pattern

```typescript
class JiraClient {
  constructor(private config: Config) {}
  
  async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const url = `${this.config.jiraUrl}/rest/api/3/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${this.getAuthHeader()}`,
        'Content-Type': 'application/json',
        ...options?.headers
      },
      ...options
    });
    
    if (!response.ok) {
      throw new JiraApiError(response);
    }
    
    return response.json();
  }
}
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Always branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow these guidelines:
- Use Effect for new features requiring error handling
- Add types using Effect Schema instead of Zod
- Keep files under 500 lines (split large files)
- Write tests for new functionality
- Update documentation as needed

### 3. Run Quality Checks

```bash
# Type checking
bun run typecheck

# Linting and formatting
bun run lint
bun run lint:fix

# Run tests
bun test

# Check file sizes
bun run check-file-sizes

# All checks (runs on pre-commit)
bun run pre-commit
```

### 4. Commit Changes

We use conventional commits:

```bash
# Types: feat, fix, docs, style, refactor, test, chore
git commit -m "feat: add sprint filtering to mine command"
git commit -m "fix: handle missing assignee in issue view"
git commit -m "docs: update development setup instructions"
```

### 5. Push and Create PR

```bash
# Push your branch
git push -u origin feature/your-feature-name

# Create PR using GitHub CLI
gh pr create --title "feat: your feature" --body "Description..."
```

## Testing

### Unit Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/test/mine-command.test.ts

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Integration Tests

Built-in testing for environment-specific commands:

```bash
# Configure tests for your environment
ji test --setup

# Run all configured tests
ji test
```

Features:
- Environment-specific test cases (real issue keys, projects)
- Comprehensive coverage of all commands
- Pass/fail reporting with statistics

### Writing Tests

```typescript
import { test, expect, mock } from 'bun:test';
import { Effect } from 'effect';

test('should fetch and format issue', async () => {
  // Mock API response
  const mockFetch = mock(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        key: 'TEST-123',
        fields: { summary: 'Test Issue' }
      })
    })
  );
  
  global.fetch = mockFetch;
  
  // Run the effect
  const result = await Effect.runPromise(
    fetchAndFormatIssue('TEST-123')
  );
  
  // Assert
  expect(result).toContain('TEST-123');
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('/rest/api/3/issue/TEST-123')
  );
});
```

## Code Style

### TypeScript Guidelines

- Use `const` by default, `let` when reassignment is needed
- Prefer arrow functions for callbacks
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Avoid `any` type - use `unknown` or proper types

### Effect Guidelines

- Use Effect for operations that can fail
- Define custom error types with `_tag` discriminator
- Use `Effect.gen` for sequential operations
- Use `Effect.all` for parallel operations
- Always handle errors explicitly

### File Organization

- Keep related functionality together
- Use barrel exports (index.ts) for clean imports
- Split large files (>500 lines) into smaller modules
- Group by feature, not by file type

## Publishing

### NPM Package

The package is published as `@aaronshaf/ji`:

```bash
# Ensure you're on main with latest changes
git checkout main
git pull origin main

# Bump version
npm version patch  # or minor/major

# Publish to npm (requires npm access)
npm publish

# Push tags
git push --tags origin main
```

### Package Configuration

Key files for npm publishing:

- **package.json**: Defines package metadata and entry points
- **.npmignore**: Excludes unnecessary files from package
- **PUBLISHING.md**: Detailed publishing instructions

### Pre-publish Checklist

- [ ] All tests pass (`bun test`)
- [ ] TypeScript compiles (`bun run typecheck`)
- [ ] Linting passes (`bun run lint`)
- [ ] README is up to date
- [ ] Version bumped appropriately
- [ ] CHANGELOG updated (if applicable)

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

```bash
# Check credentials
cat ~/.ji/config.json

# Re-run setup
ji setup
```

#### 2. TypeScript Errors

```bash
# Clean and reinstall
rm -rf node_modules bun.lockb
bun install

# Check TypeScript version
bun run tsc --version
```

#### 3. Test Failures

```bash
# Run with verbose output
DEBUG=* bun test

# Check for environment issues
echo $NODE_ENV  # Should not be 'production' for tests
```

#### 4. Bun-specific Issues

```bash
# Update Bun
bun upgrade

# Clear Bun cache
rm -rf ~/.bun/install/cache

# Check Bun version (should be 1.2.0+)
bun --version

# Reinstall dependencies
rm -rf node_modules bun.lockb
bun install
```

### Debug Mode

Enable debug output for troubleshooting:

```bash
# Debug specific module
DEBUG=ji:* bun run src/cli.ts mine

# Debug everything
DEBUG=* bun run src/cli.ts mine

# Debug Effect operations
EFFECT_LOG_LEVEL=Debug bun run src/cli.ts mine
```

## Contributing

1. Read this guide thoroughly
2. Check existing issues and PRs
3. Follow the code style and patterns
4. Write tests for new features
5. Update documentation as needed
6. Submit PR with clear description

## Resources

- [Effect Documentation](https://effect.website/)
- [Bun Documentation](https://bun.sh/docs)
- [Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Agent Instructions](./AGENTS.md)
- [Test Environment Setup](./TEST_ENVIRONMENT.md)
- [Command Specifications](./specs/)

## License

MIT - See LICENSE file for details