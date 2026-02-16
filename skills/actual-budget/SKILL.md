---
name: actual-budget
description: Use when user mentions budget, transactions, expenses, spending, income, or Actual Budget - manages transactions and queries budget data in a self-hosted Actual Budget instance
---

# Actual Budget Skill

Manage transactions and query budget data in a self-hosted Actual Budget instance. Uses the official `@actual-app/api` Node.js package via a CLI helper script.

## Setup

Required configuration (env vars checked first, then `~/.config/actual-budget/.env`):

| Variable | Description |
|----------|-------------|
| `ACTUAL_SERVER_URL` | Server URL (e.g., `http://192.168.1.100:5006`) |
| `ACTUAL_PASSWORD` | Server password |
| `ACTUAL_SYNC_ID` | Budget sync ID (Settings → Advanced → Sync ID in Actual) |
| `ACTUAL_DATA_DIR` | Optional: local cache dir (default: `~/.cache/actual-budget/data`) |
| `ACTUAL_ENCRYPTION_PASSWORD` | Optional: only if budget uses end-to-end encryption |

Example `~/.config/actual-budget/.env`:
```
ACTUAL_SERVER_URL=http://192.168.1.100:5006
ACTUAL_PASSWORD=mypassword
ACTUAL_SYNC_ID=1cfdbb80-6274-49bf-b0c2-737235a4c81f
```

### First-time dependency install

Run once (fast no-op on subsequent calls):
```bash
npm install --prefix <SKILL_DIR>/skills/actual-budget --silent
```

Where `<SKILL_DIR>` is the directory containing this skill.

## Running Commands

```bash
node <SKILL_DIR>/skills/actual-budget/actual-cli.js <command> [--arg value ...]
```

All commands output JSON to stdout. Errors go to stderr as JSON.

## Command Reference

### Read-only commands

| Command | Args | Description |
|---------|------|-------------|
| `list-accounts` | — | All open accounts with balances |
| `list-categories` | — | All categories grouped by category group |
| `list-payees` | — | All payees (excluding transfer payees) |
| `get-transactions` | `--account <name>` `--from <YYYY-MM-DD>` `--to <YYYY-MM-DD>` | Transactions in date range |
| `get-budget` | `--month <YYYY-MM>` | Budget summary with per-category breakdown |

### Write commands

| Command | Args | Description |
|---------|------|-------------|
| `add-transaction` | `--account <name>` `--date <YYYY-MM-DD>` `--amount <number>` `--payee <name>` `--category <name>` `--notes <text>` | Add a single transaction |
| `import-transactions` | `--account <name>` `--file <path>` | Import transactions from CSV |

**Amount convention:** negative = expense, positive = income. Use normal dollar amounts (e.g., `-45.67`), not cents.

**Name resolution:** Use human-readable names for `--account`, `--payee`, `--category`. The script resolves them to IDs internally.

**CSV format** for `import-transactions`:
```csv
date,amount,payee,category,notes,imported_id
2026-02-15,-25.00,Costco,Groceries,weekly shopping,bank-ref-123
```
Columns `category`, `notes`, and `imported_id` are optional. The `imported_id` field enables duplicate detection on re-import.

## Categorization Workflow

When the user provides transactions to enter (freeform text or file):

1. **Fetch context first.** Run `list-categories` and `list-payees` to know available categories and existing payee-to-category mappings.
2. **Auto-categorize** transactions where possible:
   - Match payee names against existing payees (which may have default categories)
   - Infer from common merchant names (e.g., "Shell" → Transportation, "Whole Foods" → Groceries)
3. **Present a batch review table** for user confirmation:
   ```
   | # | Date       | Payee        | Amount  | Category (suggested) | Confidence |
   |---|------------|--------------|---------|---------------------|------------|
   | 1 | 2026-02-14 | Costco       | -$85.20 | Groceries           | high       |
   | 2 | 2026-02-15 | AMZN*MK3P2  | -$23.99 | ???                 | low        |
   ```
4. **Ask user to confirm or correct** uncertain categorizations before importing.
5. **Import** using `add-transaction` (single) or write a temp CSV and use `import-transactions` (batch).

## Input Formats

**Freeform text:** Parse from natural language.
- "I spent $45 at Costco yesterday on groceries" → date: yesterday, amount: -45, payee: Costco, category: Groceries
- "Paycheck $3200 deposited to Checking on Feb 14" → date: 2026-02-14, amount: 3200, payee: Employer, category: Income

**Structured files:** Read CSV or JSON files directly and map fields.

## Output Guidance

- Present query results as **markdown tables**, not raw JSON.
- For `list-accounts`: show name, type, and balance formatted as currency.
- For `get-transactions`: show date, payee, amount (formatted as currency), category, notes.
- For `get-budget`: show a summary table with group totals and per-category breakdown. Highlight overspent categories.
- Summarize large result sets (e.g., "Found 142 transactions, showing the 20 most recent").

## Important Notes

- Amounts: use normal dollars (e.g., `-45.67`). The script handles cent conversion internally.
- Negative amounts = expenses. Positive = income.
- `import-transactions` uses Actual's reconciliation engine for duplicate detection via `imported_id`.
- `add-transaction` does NOT deduplicate. Use `import-transactions` with `imported_id` when re-importing.
- The script syncs changes to the server automatically after writes.
- If a payee name doesn't match an existing payee, it's stored as `imported_payee` (Actual will create or match it via rules).
