# Actual Budget Skill — Design

## Overview

A Claude Code skill for interacting with a self-hosted Actual Budget instance. Uses the official `@actual-app/api` Node.js package to add transactions, query data, and manage budgets through natural conversation.

## Architecture

- **Single CLI script** (`actual-cli.js`) with subcommands for all operations
- **Pure Node.js** — no REST layer, no MCP. The script inits the API, operates on a local cache, syncs changes back to the server, and shuts down.
- **npx-based** — `package.json` declares `@actual-app/api` as the sole dependency. No persistent install required.
- **SKILL.md** documents commands and guides Claude through categorization workflows.

## Skill Files

```
skills/actual-budget/
├── SKILL.md          # Skill prompt definition
├── actual-cli.js     # CLI script with all operations
└── package.json      # Declares @actual-app/api dependency
```

## Configuration

**Resolution order:**
1. Environment variables: `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_SYNC_ID`
2. Fallback: `~/.config/actual-budget/.env` (dotenv format)

**Additional:**
- `ACTUAL_DATA_DIR` — local cache, defaults to `~/.cache/actual-budget/data`
- `ACTUAL_ENCRYPTION_PASSWORD` — optional, for end-to-end encrypted budgets

## CLI Commands

### Read-only (context)

| Command | Args | Output |
|---------|------|--------|
| `list-accounts` | — | JSON array of accounts with IDs, names, balances |
| `list-categories` | — | JSON array of categories grouped by category group |
| `list-payees` | — | JSON array of payees with IDs and names |
| `get-transactions` | `--account <name|id>` `--from <date>` `--to <date>` | JSON array of transactions |
| `get-budget` | `--month <YYYY-MM>` | JSON budget data for that month |

### Write

| Command | Args | Output |
|---------|------|--------|
| `add-transaction` | `--account <name>` `--date <YYYY-MM-DD>` `--amount <number>` `--payee <name>` `--category <name>` `--notes <text>` | Created transaction ID |
| `import-transactions` | `--account <name>` `--file <path>` | JSON with `{added, updated, errors}` counts |

### Design rules

- All output is JSON to stdout; errors to stderr
- Human-readable names for accounts, payees, categories — script resolves to IDs via `getIDByName()`
- Amounts in normal dollars (e.g., `-45.67`) — script converts to integer cents
- Negative = expense, positive = income
- `import-transactions` expects CSV with columns: `date, amount, payee, notes` (optionally `category`, `imported_id`)
- `import-transactions` uses Actual's reconciliation for duplicate detection via `imported_id`

## Categorization Workflow

When user provides transactions (freeform text or file):

1. **Fetch context** — Claude runs `list-categories` and `list-payees`
2. **Auto-categorize** — match payees to existing payees/categories, infer from transaction descriptions
3. **Batch review** — present table with suggested categories and confidence levels
4. **User confirms/corrects** — user adjusts uncertain ones
5. **Import** — Claude runs `add-transaction` or `import-transactions`

No persistent learning in v1. Relies on Actual's own rules engine and payee defaults.

## Input Formats

- **Freeform text**: "I spent $45 at Costco yesterday on groceries" — Claude parses into structured fields
- **Structured files**: CSV, JSON — Claude reads file and maps columns to Actual fields
- Claude auto-detects which format it's receiving

## SKILL.md Structure

1. YAML frontmatter (name, description — triggers on budget/transaction/expense mentions)
2. Overview (what the skill does, init→operate→sync→shutdown lifecycle)
3. Setup (env vars, config file, first-time guidance)
4. CLI Reference (commands table)
5. Categorization Workflow (batch-review instructions for Claude)
6. Input Formats (freeform vs structured)
7. Common Recipes (example invocations)
8. Output Guidance (markdown tables, budget summaries)
9. Important Notes (amounts in dollars, sync after writes, negative = expense)
