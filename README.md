# Claude Code Skills

A skill marketplace for [Claude Code](https://claude.com/claude-code) with plugins for self-hosted services.

## Available Skills

| Skill | Description |
|-------|-------------|
| **vikunja** | Read-only querying of a [Vikunja](https://vikunja.io/) task manager instance — list projects, search tasks, filter by labels and due dates |
| **actual-budget** | Manage transactions and query budget data in a self-hosted [Actual Budget](https://actualbudget.org/) instance |

## Installation

### 1. Add this marketplace

In Claude Code, run:

```
/plugin marketplace add thomasantony/skills
```

### 2. Install a skill

```
/plugin install vikunja@thomasantony-skills
```

```
/plugin install actual-budget@thomasantony-skills
```

### 3. Configure

Set the required environment variables for the skill you installed. For Vikunja:

```bash
export VIKUNJA_URL="https://your-vikunja-instance.example.com"
export VIKUNJA_API_TOKEN="your-api-token-here"
```

You can generate an API token in Vikunja under **Settings > API Tokens**.

Alternatively, store the token in a file and point to it:

```bash
export VIKUNJA_URL="https://your-vikunja-instance.example.com"
export VIKUNJA_TOKEN_FILE="$HOME/.config/vikunja/token"
```

For Actual Budget:

```bash
export ACTUAL_SERVER_URL="http://your-server:5006"
export ACTUAL_PASSWORD="your-password"
export ACTUAL_SYNC_ID="your-sync-id-from-settings"
```

Or store in `~/.config/actual-budget/.env`.

**Note:** The skill requires Node.js. Dependencies are installed automatically on first use.

## License

MIT
