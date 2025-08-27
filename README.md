# ji

[![CI](https://github.com/aaronshaf/ji/actions/workflows/ci.yml/badge.svg)](https://github.com/aaronshaf/ji/actions/workflows/ci.yml)
[![Code Quality](https://img.shields.io/badge/warnings-0-brightgreen)](https://github.com/aaronshaf/ji/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@aaronshaf/ji)](https://www.npmjs.com/package/@aaronshaf/ji)

Jira CLI built with Bun. Supports agentic analysis of issues.

## Installation

```bash
# Install Bun runtime
curl -fsSL https://bun.sh/install | bash

# Install ji
bun install -g @aaronshaf/ji
```

## Getting Started

```bash
ji setup
```

This will set up your Atlassian credentials and configure your AI tool (optional).

## Common Commands

### Daily Workflow

```bash
# View your assigned issues
ji mine

# View current sprint
ji sprint

# View project board
ji board PROJ

# View a specific issue (two ways)
ji PROJ-123
ji issue view PROJ-123

# Take ownership of an issue
ji take PROJ-456

# Add comment
ji comment PROJ-456 "Hello, world!"

# Analyze an issue with AI
ji analyze PROJ-789
ji analyze PROJ-789 --comment
```

## Key Features

### AI-Powered Analysis

```bash
ji analyze PROJ-123           # Output analysis to terminal
ji analyze PROJ-123 --comment # Analyze and post as comment
ji analyze PROJ-123 --comment -y  # Auto-post without confirmation
ji analyze PROJ-123 --prompt custom.md  # Use custom prompt file
```

The analyze command:
- Fetches issue details and analyzes with AI (Claude, Gemini, or opencode)
- Generates actionable recommendations
- Outputs clean analysis text by default
- Use `--comment` flag to post as Jira comment
- Auto-detects available AI tools or uses configured preference

## Documentation

- [**Command Reference**](docs/DOCS.md) - Complete list of commands and options
- [**Development Guide**](DEVELOPMENT.md) - Setup, architecture, and contributing
- [**Publishing Guide**](PUBLISHING.md) - NPM package publishing instructions

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup instructions and contribution guidelines.

## License

MIT
