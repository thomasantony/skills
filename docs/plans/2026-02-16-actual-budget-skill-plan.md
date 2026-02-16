# Actual Budget Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code skill that lets an AI agent query and write transactions to a self-hosted Actual Budget instance via the official `@actual-app/api` Node.js package.

**Architecture:** Single CLI script (`actual-cli.js`) with subcommands, invoked by Claude per the SKILL.md prompt. Config resolved from env vars with fallback to `~/.config/actual-budget/.env`. Dependencies managed via a `package.json` alongside the script.

**Tech Stack:** Node.js, `@actual-app/api` (npm), no other runtime dependencies.

**Design doc:** `docs/plans/2026-02-16-actual-budget-skill-design.md`

---

### Task 1: Create package.json

**Files:**
- Create: `skills/actual-budget/package.json`

**Step 1: Create the file**

```json
{
  "name": "actual-budget-skill",
  "version": "0.1.0",
  "private": true,
  "description": "CLI helper for the Actual Budget Claude Code skill",
  "dependencies": {
    "@actual-app/api": "^25.0.0"
  }
}
```

**Step 2: Commit**

```bash
git add skills/actual-budget/package.json
git commit -m "feat(actual-budget): add package.json with @actual-app/api dependency"
```

---

### Task 2: Create actual-cli.js — config resolution and lifecycle

**Files:**
- Create: `skills/actual-budget/actual-cli.js`

**Step 1: Write the script skeleton with config resolution, arg parsing, and budget lifecycle wrapper**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// --- Config resolution ---

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function loadConfig() {
  const envFile = parseEnvFile(
    path.join(process.env.HOME, '.config', 'actual-budget', '.env')
  );
  function get(key, fallback) {
    return process.env[key] || envFile[key] || fallback;
  }
  const serverURL = get('ACTUAL_SERVER_URL');
  const password = get('ACTUAL_PASSWORD');
  const syncId = get('ACTUAL_SYNC_ID');
  const dataDir = get('ACTUAL_DATA_DIR',
    path.join(process.env.HOME, '.cache', 'actual-budget', 'data')
  );
  const encryptionPassword = get('ACTUAL_ENCRYPTION_PASSWORD');

  if (!serverURL || !password || !syncId) {
    console.error(JSON.stringify({
      error: 'Missing config. Set ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_SYNC_ID as env vars or in ~/.config/actual-budget/.env'
    }));
    process.exit(1);
  }
  return { serverURL, password, syncId, dataDir, encryptionPassword };
}

// --- Budget lifecycle ---

async function withBudget(fn) {
  const api = require('@actual-app/api');
  const config = loadConfig();

  fs.mkdirSync(config.dataDir, { recursive: true });

  await api.init({ dataDir: config.dataDir, serverURL: config.serverURL, password: config.password });

  const dlOpts = config.encryptionPassword ? { password: config.encryptionPassword } : undefined;
  await api.downloadBudget(config.syncId, dlOpts);

  try {
    return await fn(api);
  } finally {
    await api.shutdown();
  }
}

// --- Arg parsing ---

function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return args;
}

// --- Commands ---

const commands = {};

// (commands will be added in subsequent tasks)

// --- Main ---

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || !commands[command]) {
    console.error(JSON.stringify({
      error: `Unknown command: ${command}`,
      available: Object.keys(commands)
    }));
    process.exit(1);
  }
  const args = parseArgs(rest);
  try {
    const result = await commands[command](args);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
```

**Step 2: Verify it runs (should show "Unknown command" error)**

```bash
cd skills/actual-budget && npm install --silent && node actual-cli.js
```

Expected: JSON error with `"available": []`

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add CLI skeleton with config resolution and lifecycle"
```

---

### Task 3: Add read-only commands — list-accounts, list-categories, list-payees

**Files:**
- Modify: `skills/actual-budget/actual-cli.js`

**Step 1: Add the three list commands**

Insert before the `// --- Main ---` section:

```javascript
commands['list-accounts'] = async () => {
  return withBudget(async (api) => {
    const accounts = await api.getAccounts();
    const result = [];
    for (const acct of accounts) {
      if (acct.closed) continue;
      const balance = await api.getAccountBalance(acct.id);
      result.push({
        id: acct.id,
        name: acct.name,
        type: acct.offbudget ? 'off-budget' : 'on-budget',
        balance: api.utils.integerToAmount(balance),
      });
    }
    return result;
  });
};

commands['list-categories'] = async () => {
  return withBudget(async (api) => {
    const groups = await api.getCategoryGroups();
    const categories = await api.getCategories();
    return groups.map(g => ({
      group: g.name,
      id: g.id,
      categories: categories
        .filter(c => c.group_id === g.id)
        .map(c => ({ id: c.id, name: c.name, is_income: !!c.is_income })),
    }));
  });
};

commands['list-payees'] = async () => {
  return withBudget(async (api) => {
    const payees = await api.getPayees();
    return payees
      .filter(p => !p.transfer_acct)
      .map(p => ({ id: p.id, name: p.name, category: p.category || null }));
  });
};
```

**Step 2: Test against real server (requires config)**

```bash
node skills/actual-budget/actual-cli.js list-accounts
node skills/actual-budget/actual-cli.js list-categories
node skills/actual-budget/actual-cli.js list-payees
```

Expected: JSON arrays with real data from the Actual Budget instance.

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add list-accounts, list-categories, list-payees commands"
```

---

### Task 4: Add get-transactions command

**Files:**
- Modify: `skills/actual-budget/actual-cli.js`

**Step 1: Add the command**

```javascript
commands['get-transactions'] = async (args) => {
  const accountName = args.account;
  const from = args.from;
  const to = args.to;

  if (!accountName) {
    throw new Error('--account is required');
  }

  return withBudget(async (api) => {
    const accountId = await api.getIDByName({ type: 'accounts', name: accountName });
    if (!accountId) throw new Error(`Account not found: ${accountName}`);

    const startDate = from || '2000-01-01';
    const endDate = to || new Date().toISOString().slice(0, 10);

    const transactions = await api.getTransactions(accountId, startDate, endDate);
    const payees = await api.getPayees();
    const categories = await api.getCategories();

    const payeeMap = Object.fromEntries(payees.map(p => [p.id, p.name]));
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    return transactions.map(t => ({
      id: t.id,
      date: t.date,
      amount: api.utils.integerToAmount(t.amount),
      payee: payeeMap[t.payee] || t.imported_payee || null,
      category: catMap[t.category] || null,
      notes: t.notes || null,
      cleared: !!t.cleared,
      imported_id: t.imported_id || null,
    }));
  });
};
```

**Step 2: Test**

```bash
node skills/actual-budget/actual-cli.js get-transactions --account "Checking" --from 2026-01-01
```

Expected: JSON array of transactions with human-readable payee/category names.

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add get-transactions command"
```

---

### Task 5: Add get-budget command

**Files:**
- Modify: `skills/actual-budget/actual-cli.js`

**Step 1: Add the command**

```javascript
commands['get-budget'] = async (args) => {
  const month = args.month;
  if (!month) throw new Error('--month is required (YYYY-MM format)');

  return withBudget(async (api) => {
    const budget = await api.getBudgetMonth(month);
    const categories = await api.getCategories();
    const groups = await api.getCategoryGroups();

    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    const groupMap = Object.fromEntries(groups.map(g => [g.id, g.name]));

    return {
      month: budget.month,
      incomeAvailable: api.utils.integerToAmount(budget.incomeAvailable),
      lastMonthOverspent: api.utils.integerToAmount(budget.lastMonthOverspent),
      forNextMonth: api.utils.integerToAmount(budget.forNextMonth),
      totalBudgeted: api.utils.integerToAmount(budget.totalBudgeted),
      toBudget: api.utils.integerToAmount(budget.toBudget),
      categoryGroups: budget.categoryGroups.map(g => ({
        group: groupMap[g.id] || g.id,
        budgeted: api.utils.integerToAmount(g.budgeted),
        spent: api.utils.integerToAmount(g.spent),
        balance: api.utils.integerToAmount(g.balance),
        categories: g.categories.map(c => ({
          name: catMap[c.id] || c.id,
          budgeted: api.utils.integerToAmount(c.budgeted),
          spent: api.utils.integerToAmount(c.spent),
          balance: api.utils.integerToAmount(c.balance),
          carryover: !!c.carryover,
        })),
      })),
    };
  });
};
```

**Step 2: Test**

```bash
node skills/actual-budget/actual-cli.js get-budget --month 2026-02
```

Expected: JSON with budget summary and per-category breakdown.

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add get-budget command"
```

---

### Task 6: Add add-transaction command

**Files:**
- Modify: `skills/actual-budget/actual-cli.js`

**Step 1: Add the command**

```javascript
commands['add-transaction'] = async (args) => {
  const { account, date, amount, payee, category, notes } = args;
  if (!account) throw new Error('--account is required');
  if (!date) throw new Error('--date is required (YYYY-MM-DD)');
  if (amount === undefined) throw new Error('--amount is required');

  return withBudget(async (api) => {
    const accountId = await api.getIDByName({ type: 'accounts', name: account });
    if (!accountId) throw new Error(`Account not found: ${account}`);

    const transaction = {
      date,
      amount: api.utils.amountToInteger(parseFloat(amount)),
    };

    if (payee) {
      const payeeId = await api.getIDByName({ type: 'payees', name: payee });
      if (payeeId) {
        transaction.payee = payeeId;
      } else {
        transaction.imported_payee = payee;
      }
    }

    if (category) {
      const catId = await api.getIDByName({ type: 'categories', name: category });
      if (!catId) throw new Error(`Category not found: ${category}`);
      transaction.category = catId;
    }

    if (notes) {
      transaction.notes = notes;
    }

    const ids = await api.addTransactions(accountId, [transaction]);
    await api.sync();
    return { created: ids[0] };
  });
};
```

**Step 2: Test (creates real data — use a test account or be prepared to delete)**

```bash
node skills/actual-budget/actual-cli.js add-transaction \
  --account "Checking" \
  --date "2026-02-16" \
  --amount "-12.50" \
  --payee "Test Payee" \
  --category "Groceries" \
  --notes "Test transaction"
```

Expected: `{ "created": "<some-uuid>" }`

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add add-transaction command"
```

---

### Task 7: Add import-transactions command (CSV support)

**Files:**
- Modify: `skills/actual-budget/actual-cli.js`

**Step 1: Add a minimal CSV parser and the import command**

```javascript
// Add this helper near the top, after parseArgs:

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    // Simple CSV parse — handles quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// Add the command:

commands['import-transactions'] = async (args) => {
  const { account, file } = args;
  if (!account) throw new Error('--account is required');
  if (!file) throw new Error('--file is required (path to CSV)');

  const content = fs.readFileSync(file, 'utf8');
  const rows = parseCSV(content);

  return withBudget(async (api) => {
    const accountId = await api.getIDByName({ type: 'accounts', name: account });
    if (!accountId) throw new Error(`Account not found: ${account}`);

    const categories = await api.getCategories();
    const catByName = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c.id]));

    const transactions = rows.map((row, i) => {
      if (!row.date || row.amount === undefined) {
        throw new Error(`Row ${i + 1}: date and amount are required`);
      }
      const t = {
        date: row.date,
        amount: api.utils.amountToInteger(parseFloat(row.amount)),
      };
      if (row.payee) t.imported_payee = row.payee;
      if (row.category) {
        const catId = catByName[row.category.toLowerCase()];
        if (catId) t.category = catId;
      }
      if (row.notes) t.notes = row.notes;
      if (row.imported_id) t.imported_id = row.imported_id;
      return t;
    });

    const result = await api.importTransactions(accountId, transactions);
    await api.sync();
    return {
      added: result.added?.length || 0,
      updated: result.updated?.length || 0,
      errors: result.errors || [],
    };
  });
};
```

**Step 2: Create a test CSV and run**

Create `/tmp/test-transactions.csv`:
```csv
date,amount,payee,category,notes
2026-02-15,-25.00,Test Store,Groceries,test import
2026-02-14,-10.00,Coffee Shop,Dining Out,morning coffee
```

```bash
node skills/actual-budget/actual-cli.js import-transactions --account "Checking" --file /tmp/test-transactions.csv
```

Expected: `{ "added": 2, "updated": 0, "errors": [] }`

**Step 3: Commit**

```bash
git add skills/actual-budget/actual-cli.js
git commit -m "feat(actual-budget): add import-transactions command with CSV parsing"
```

---

### Task 8: Create SKILL.md

**Files:**
- Create: `skills/actual-budget/SKILL.md`

**Step 1: Write the skill definition**

```markdown
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

Where `<SKILL_DIR>` is the directory containing this skill. Check the skill's location if unsure.

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
```

**Step 2: Commit**

```bash
git add skills/actual-budget/SKILL.md
git commit -m "feat(actual-budget): add SKILL.md skill definition"
```

---

### Task 9: Update plugin.json, marketplace.json, and README.md

**Files:**
- Modify: `plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `README.md`

**Step 1: Update plugin.json** — this is the root plugin metadata. Since we now have two skills, it should describe the collection, not a single skill. Update it to:

```json
{
  "name": "thomasantony-skills",
  "description": "Claude Code skills for self-hosted services",
  "version": "0.2.0",
  "author": {
    "name": "Thomas Antony"
  },
  "license": "MIT",
  "keywords": ["vikunja", "tasks", "actual-budget", "finance", "transactions"]
}
```

**Step 2: Update marketplace.json** — add the actual-budget entry to the plugins array:

```json
{
  "name": "thomasantony-skills",
  "description": "Claude Code skills for self-hosted services",
  "owner": {
    "name": "Thomas Antony"
  },
  "plugins": [
    {
      "name": "vikunja",
      "description": "Read-only query skill for Vikunja task manager - list projects, search tasks, filter by labels and due dates",
      "version": "0.1.0",
      "author": { "name": "Thomas Antony" },
      "source": {
        "source": "url",
        "url": "https://github.com/thomasantony/skills.git"
      },
      "category": "skills"
    },
    {
      "name": "actual-budget",
      "description": "Manage transactions and query budget data in a self-hosted Actual Budget instance",
      "version": "0.1.0",
      "author": { "name": "Thomas Antony" },
      "source": {
        "source": "url",
        "url": "https://github.com/thomasantony/skills.git"
      },
      "category": "skills"
    }
  ]
}
```

**Step 3: Update README.md** — add actual-budget to the skills table and add its configuration section.

Add to the Available Skills table:
```markdown
| **actual-budget** | Manage transactions and query budget data in a self-hosted [Actual Budget](https://actualbudget.org/) instance |
```

Add a configuration section for actual-budget after the Vikunja section:
```markdown
For Actual Budget:

```bash
export ACTUAL_SERVER_URL="http://your-server:5006"
export ACTUAL_PASSWORD="your-password"
export ACTUAL_SYNC_ID="your-sync-id-from-settings"
```

Or store in `~/.config/actual-budget/.env`.

**Note:** The skill requires Node.js. Dependencies are installed automatically on first use.
```

**Step 4: Commit**

```bash
git add plugin.json .claude-plugin/marketplace.json README.md
git commit -m "feat(actual-budget): register skill in marketplace and update README"
```

---

### Task 10: Manual integration test

**No files modified — verification only.**

**Step 1: Set up config**

Create `~/.config/actual-budget/.env` with real server credentials (or set env vars).

**Step 2: Install dependencies**

```bash
cd skills/actual-budget && npm install
```

**Step 3: Run each command and verify output**

```bash
# Read commands
node skills/actual-budget/actual-cli.js list-accounts
node skills/actual-budget/actual-cli.js list-categories
node skills/actual-budget/actual-cli.js list-payees
node skills/actual-budget/actual-cli.js get-transactions --account "Checking" --from 2026-02-01
node skills/actual-budget/actual-cli.js get-budget --month 2026-02

# Write commands (test account recommended)
node skills/actual-budget/actual-cli.js add-transaction --account "Checking" --date "2026-02-16" --amount "-5.00" --payee "Test" --notes "integration test"

# CSV import
echo 'date,amount,payee,notes,imported_id
2026-02-16,-3.50,Test CSV,csv test,test-csv-001' > /tmp/test-import.csv
node skills/actual-budget/actual-cli.js import-transactions --account "Checking" --file /tmp/test-import.csv
```

**Step 4: Verify in Actual Budget UI** that the test transactions appear.

**Step 5: Clean up test transactions** in the Actual Budget UI.

**Step 6: Add `node_modules` to gitignore**

Verify that `skills/actual-budget/node_modules` is excluded. Check if the root `.gitignore` covers it, otherwise add:

```
skills/actual-budget/node_modules/
```

**Step 7: Final commit if gitignore was updated**

```bash
git add .gitignore
git commit -m "chore: exclude actual-budget node_modules from git"
```
