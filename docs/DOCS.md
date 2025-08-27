# ji CLI - Comprehensive Documentation

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Commands Reference](#commands-reference)
- [Memory System](#memory-system)
- [Sync Strategies](#sync-strategies)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)

## Installation

### Prerequisites

- **Bun** (required): JavaScript runtime and package manager
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

- **Ollama** (optional): AI features
  ```bash
  # macOS/Linux
  curl -fsSL https://ollama.ai/install.sh | sh
  
  # Pull a model (recommended)
  ollama pull llama3.2
  ```

### Install ji

```bash
git clone https://github.com/aaronshaf/ji.git
cd ji
bun install
bun link
```

## Configuration

### Authentication

ji stores credentials securely in `~/.ji/auth.json` with 600 permissions.

```bash
# Interactive setup
ji setup
```

### Directory Structure

```
~/.ji/
├── auth.json       # Encrypted credentials (600 permissions)
├── data.db         # SQLite database with cached content
├── settings.json   # User preferences and model configuration
├── test-config.json # Environment-specific test configuration (gitignored)
└── sync.log        # Background sync logs
```

### Settings

Configure AI models and preferences:

```bash
ji models  # Interactive model selection
```

Or edit `~/.ji/settings.json` directly:

```json
{
  "askModel": "llama3.2",
  "embeddingModel": "mxbai-embed-large",
  "analysisModel": "llama3.2"
}
```

## Commands Reference

### Core Commands

#### Authentication & Setup
```bash
ji setup                     # Configure authentication and AI tools
ji models                    # Configure AI models
```

#### Jira Commands
```bash
ji mine                      # Show your assigned issues
ji issue view <KEY>          # View issue details
ji issue sync <PROJECT>      # Sync all issues from a project
ji take <KEY>                # Assign issue to yourself
ji comment <KEY> ["text"]    # Add comment to issue (3 modes)
ji analyze <KEY>             # AI analysis with recommendations
ji board [PROJECT]           # Show boards (all or by project)
ji sprint [PROJECT]          # Show current sprint(s)
ji sprint unassigned [PROJ]  # Show unassigned sprint issues
```


#### Sync & Maintenance
```bash
ji sync                      # Sync all active workspaces
ji index                     # Rebuild search index
```

#### Testing
```bash
ji test --setup              # Configure environment-specific tests
ji test                      # Run all configured tests
```

### Command Options

#### Global Options
- `--help, -h` - Show help
- `--json, -j` - Output as JSON
- `--verbose, -v` - Show additional details

#### Sync Options
- `--sync, -s` - Force sync from API
- `--clean` - Clear local data before sync
- `--background` - Run sync in background


## Adding Comments to Issues

The `ji comment` command allows you to add comments to Jira issues with full wiki markup support.

### Usage Modes

```bash
# Mode 1: Inline comment
ji comment PROJ-123 "This is a quick comment"

# Mode 2: Interactive editor (opens $EDITOR, defaults to vi)
ji comment PROJ-123

# Mode 3: Pipe from other commands
echo "Generated comment" | ji comment PROJ-123
cat release-notes.md | ji comment PROJ-123
```

### Wiki Markup Formatting

Comments support Jira's wiki markup for rich formatting:

#### Text Formatting
```
*bold text*              → **bold text**
_italic text_            → *italic text*
+underlined text+        → underlined text
-strikethrough text-     → ~~strikethrough text~~
{{monospace}}            → `monospace`
^superscript^            → superscript
~subscript~              → subscript
```

#### Headings
```
h1. Biggest heading
h2. Big heading
h3. Medium heading
h4. Small heading
h5. Smaller heading
h6. Smallest heading
```

#### Lists
```
# Numbered list
# Second item
## Nested item
### Deeply nested

* Bullet list
* Second item
** Nested item
*** Deeply nested

# Mixed list
#* Bullet under number
#* Another bullet
# Back to numbers
```

#### Code and Quotes
```
{code:javascript}
function example() {
  console.log("Syntax highlighted");
}
{code}

{code}
Plain code block
{code}

{quote}
This is a quoted block.
Can span multiple lines.
{quote}

{noformat}
Preserves    exact    spacing
and line breaks
{noformat}
```

#### Links and References
```
[Google|https://google.com]     # External link
[PROJ-123]                      # Issue link
[~username]                     # User mention
[^attachment.pdf]               # Attachment reference
mailto:email@example.com        # Email link
```

#### Panels
```
{note}
This is a note panel - light blue background
{note}

{warning}
This is a warning panel - yellow background
{warning}

{info}
This is an info panel - blue background
{info}

{tip}
This is a tip panel - green background
{tip}

{panel:title=Custom Panel|borderStyle=solid|borderColor=#ccc|titleBGColor=#F7D6C1|bgColor=#FFFFCE}
Custom styled panel with title
{panel}
```

#### Tables
```
||Header 1||Header 2||Header 3||
|Cell 1|Cell 2|Cell 3|
|Cell 4|Cell 5|Cell 6|
```

#### Other Formatting
```
----                    # Horizontal rule
{color:red}text{color}  # Colored text
{color:#00ff00}text{color}  # Hex color
bq. Block quote         # Alternative quote syntax
{anchor:myanchor}       # Create anchor
[#myanchor]             # Link to anchor
!image.png!             # Embed image
!image.png|width=300!   # Sized image
```

### Complex Example

```bash
ji comment PROJ-123 "h1. Release Notes v2.0

h2. 🚀 New Features
* *Enhanced Performance* - 50% faster load times
* _New API endpoints_ for better integration
* +Improved UI+ with modern design

h2. 🐛 Bug Fixes
# Fixed authentication issue [BUG-456]
# Resolved memory leak in background process
## Updated dependency versions
## Improved error handling

h2. 💻 Code Changes
{code:javascript}
// New feature implementation
async function enhancedFeature() {
  return await performanceBoost();
}
{code}

{warning}
Breaking changes in this release!
Please review the migration guide before updating.
{warning}

h2. 👥 Contributors
Thanks to [~john.doe] and [~jane.smith] for their contributions!

||Component||Version||Status||
|Frontend|2.0.0|✅ Stable|
|Backend|2.0.0|✅ Stable|
|API|v2|⚠️ Breaking changes|

For more information, see our [documentation|https://docs.example.com]."
```

### Tips

1. **Preview before posting**: Write complex comments in a file first
   ```bash
   vi comment.md
   cat comment.md | ji comment PROJ-123
   ```

2. **Template comments**: Create reusable templates
   ```bash
   cat templates/release-note.md | ji comment PROJ-123
   ```

3. **Generate formatted reports**: Combine with other commands
   ```bash
   ji mine | grep "In Progress" | \
   awk '{print "* [" $1 "] - " $2}' | \
   ji comment SPRINT-REVIEW
   ```

## AI Issue Analysis

The `ji analyze` command uses AI to analyze Jira issues and provide actionable recommendations.

### Basic Usage

```bash
# Analyze an issue and post recommendations as a comment
ji analyze PROJ-123

# Skip confirmation prompt (auto-post)
ji analyze PROJ-123 -y
ji analyze PROJ-123 --yes

# Use a custom prompt file
ji analyze PROJ-123 --prompt ./prompts/security-review.md
```

### How It Works

1. **Fetches issue details** - Retrieves complete issue data in XML format
2. **AI analysis** - Sends issue data to AI tool (Claude, Gemini, or opencode)
3. **Generates recommendations** - AI provides structured recommendations
4. **Preview & confirm** - Shows recommendations and asks for confirmation
5. **Posts as comment** - Adds recommendations to the issue as a comment

### AI Tool Detection

The command automatically detects available AI tools in this order:
1. Claude (via `claude` CLI)
2. Google Gemini (via `gemini` CLI) 
3. opencode (via `opencode` CLI)

You can also configure a preferred tool:
```bash
ji setup  # Follow prompts to set analysis tool preference
```

### Custom Prompts

Create custom analysis prompts for specific use cases:

```markdown
# security-review.md
Analyze this issue for security implications:
- Identify potential security risks
- Suggest security best practices
- Recommend security testing approaches
- Note any compliance considerations
```

Use with: `ji analyze PROJ-123 --prompt security-review.md`

### AI Model Selection

The AI features use different models for different tasks:

- **Ask Model**: Main Q&A responses (default: llama3.2)
- **Embedding Model**: Semantic search (default: mxbai-embed-large)
- **Analysis Model**: Query understanding (default: same as ask model)


## Sync Strategies

### Initial Sync

```bash
# Sync a new project
ji issue sync PROJECT

```

### Incremental Sync

```bash
# Sync only recent changes (default for ji sync)
ji sync
```

### Clean Sync

```bash
# Clear and re-sync everything
ji issue sync PROJECT --clean
```

### Fresh Sync (Future)

The `--fresh` flag (when implemented) will force a full sync without deleting existing data:

```bash
# Force full sync without clearing local data
ji issue sync PROJECT --fresh
```

Key differences:
- `--clean`: Deletes all existing local data before syncing (destructive)
- `--fresh`: Forces a full sync but preserves existing data (non-destructive)
- Default: Incremental sync based on last update timestamp

### Background Sync


### Auto-refresh

ji automatically refreshes data in the background when you access it, ensuring content is always fresh.

## Testing Framework

ji includes a comprehensive testing framework for validating all commands work correctly in your specific environment.

### Test Setup

```bash
# Interactive test configuration
ji test --setup
```

The setup wizard will:
1. Auto-detect your environment (project keys, Confluence spaces)
2. Guide you through configuring tests for each command type
3. Prompt for real issue keys and questions from your environment
4. Save configuration to `~/.ji/test-config.json` (gitignored for security)

### Test Types

#### 1. Pattern Validation Tests
For commands with predictable output structures:
```bash
# Tests that search results include expected YAML fields
# Tests that issue view includes required fields  
ji issue view PROJ-123    # Expected: type: issue, key:, link:, status:
```

#### 2. Environment-Specific Tests
Tests use real data from your environment:
- Real issue keys (e.g., `EVAL-5273`)
- Actual project names
- Environment-specific questions
- Your team's processes and documentation

### Running Tests

```bash
# Run all configured tests
ji test

# Example output:
🧪 Running Tests

Search Tests:
  ✓ Pass: Test Search: search "login bug"  
  ✓ Pass: Test Search: search "deployment process"

Issue View Tests:
  ✓ Pass: Test Issue View with EVAL-5273
  
AI Questions Tests:
  ✓ Pass: Test AI answer for: What's our deployment process?
  
📊 Test Summary:
  Total: 8
  Passed: 8
  Failed: 0
  Errors: 0
  Success Rate: 100%
```

### Test Configuration Structure

The test config uses Effect Schema for validation:

```typescript
interface TestConfig {
  version: string;
  lastUpdated: string;
  environment: {
    jiraUrl: string;
    projectKeys: string[];
    confluenceSpaces: string[];
  };
  tests: Record<string, TestCase[]>;
}

interface TestCase {
  id: string;
  command: string;
  description: string;
  expectedPatterns?: string[];  // For pattern matching
  llmValidation?: boolean;      // For AI validation
  enabled: boolean;
  lastRun?: string;
  lastResult?: 'pass' | 'fail' | 'error';
}
```

### Command Coverage

The framework tests all major commands:

- **Issue View**: `ji issue view KEY` and direct access `ji KEY`
- **Sync Operations**: `ji sync` with success pattern matching
- **Personal Issues**: `ji mine` with assignee validation

### Security & Privacy

- Test configuration stored locally in `~/.ji/test-config.json`
- File is gitignored to prevent committing sensitive environment data
- No API keys or credentials stored in test config
- Uses existing authentication from `~/.ji/auth.json`

### Future: CI Integration

The framework is designed to support CI/CD testing:
- Export sanitized test templates for GitHub Actions
- Seed fake data for reproducible CI tests
- Nix-based environment setup for consistent testing

## Advanced Usage

### Workspace Management

Active workspaces are tracked automatically. View them in the database:

```sql
sqlite3 ~/.ji/data.db "SELECT * FROM workspaces WHERE is_active = 1"
```

### Custom Queries

Access the SQLite database directly:

```bash
sqlite3 ~/.ji/data.db

# Example: Find all critical bugs
SELECT key, summary FROM issues 
WHERE priority = 'Critical' 
AND status != 'Done'
ORDER BY updated DESC;
```

### Search Index Management

```bash
# Rebuild search index
ji index --clean

# Check index stats
curl http://localhost:7700/indexes/ji-content/stats
```

### Batch Operations

```bash
# Sync multiple projects
for proj in PROJ1 PROJ2 PROJ3; do
  ji issue sync $proj
done

```

## Troubleshooting

### Common Issues

#### "No configuration found"
Run `ji setup` to configure authentication.


#### "Ollama is not available"
```bash
# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2
```

#### Sync Issues

1. **Timeout errors**: Reduce batch size or use `--background`
2. **Rate limiting**: Add delays between syncs
3. **Large spaces**: Use incremental sync or background mode

#### Search Not Working

1. Check logs: `~/.ji/sync.log`
2. Try searching with different terms

### Debug Mode

```bash
# Check database
sqlite3 ~/.ji/data.db ".tables"
sqlite3 ~/.ji/data.db "SELECT COUNT(*) FROM searchable_content"

```

### Reset & Clean

```bash
# Reset specific data
rm ~/.ji/data.db          # Clear all cached data
rm ~/.ji/auth.json        # Clear credentials
rm ~/.ji/settings.json    # Clear settings

# Full reset
rm -rf ~/.ji
ji setup
```

## Architecture

### Technology Stack

- **Runtime**: Bun (no Node.js dependencies)
- **Database**: SQLite with FTS5 (full-text search)
- **AI**: Ollama (local LLM, optional)
- **Language**: TypeScript with Effect and Effect Schema validation

### Data Flow

1. **API Fetch** → Jira/Confluence REST APIs
2. **Storage** → SQLite with normalized schema and FTS5 search
3. **AI Processing** → Ollama for embeddings/Q&A
5. **Memory** → Automatic fact extraction

### Database Schema

```sql
-- Main content table
CREATE TABLE searchable_content (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  space_key TEXT,
  project_key TEXT,
  metadata TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  synced_at INTEGER
);

-- Full-text search
CREATE VIRTUAL TABLE searchable_content_fts USING fts5(
  title, content, content=searchable_content
);

-- Workspaces tracking
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  key_or_id TEXT NOT NULL,
  name TEXT,
  last_accessed INTEGER,
  is_active INTEGER DEFAULT 1
);
```

### Performance Optimizations

- Incremental sync with timestamp tracking
- Parallel batch processing
- Background refresh on access
- Aggressive caching with SQLite
- Efficient embedding generation

### Security Considerations

- Credentials stored with 600 permissions
- No credentials in environment variables
- No sensitive data in logs
- API tokens never exposed in git

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT