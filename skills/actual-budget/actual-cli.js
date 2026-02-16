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

// --- CSV parsing ---

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
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

// --- Commands ---

const commands = {

  'add-transaction': (args) => {
    if (!args.account) throw new Error('--account <name> is required');
    if (!args.date) throw new Error('--date <YYYY-MM-DD> is required');
    if (!args.amount) throw new Error('--amount <number> is required');
    return withBudget(async (api) => {
      const accountId = await api.getIDByName({ type: 'accounts', name: args.account });
      if (!accountId) throw new Error(`Account not found: ${args.account}`);

      const transaction = {
        date: args.date,
        amount: api.utils.amountToInteger(parseFloat(args.amount)),
      };

      if (args.payee) {
        const payeeId = await api.getIDByName({ type: 'payees', name: args.payee });
        if (payeeId) {
          transaction.payee = payeeId;
        } else {
          transaction.imported_payee = args.payee;
        }
      }

      if (args.category) {
        const categoryId = await api.getIDByName({ type: 'categories', name: args.category });
        if (!categoryId) throw new Error(`Category not found: ${args.category}`);
        transaction.category = categoryId;
      }

      if (args.notes) {
        transaction.notes = args.notes;
      }

      const ids = await api.addTransactions(accountId, [transaction]);
      await api.sync();
      return { created: ids[0] };
    });
  },

  'import-transactions': (args) => {
    if (!args.account) throw new Error('--account <name> is required');
    if (!args.file) throw new Error('--file <path-to-csv> is required');
    const csvContent = fs.readFileSync(args.file, 'utf8');
    const rows = parseCSV(csvContent);
    return withBudget(async (api) => {
      const accountId = await api.getIDByName({ type: 'accounts', name: args.account });
      if (!accountId) throw new Error(`Account not found: ${args.account}`);

      const categories = await api.getCategories();
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      const transactions = rows.map((row, i) => {
        if (!row.date) throw new Error(`Row ${i + 1}: missing required field "date"`);
        if (!row.amount) throw new Error(`Row ${i + 1}: missing required field "amount"`);

        const t = {
          date: row.date,
          amount: api.utils.amountToInteger(parseFloat(row.amount)),
        };

        if (row.payee) t.imported_payee = row.payee;
        if (row.category) {
          const catId = categoryMap.get(row.category.toLowerCase());
          if (!catId) throw new Error(`Row ${i + 1}: category not found: ${row.category}`);
          t.category = catId;
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
  },

  'list-accounts': () => withBudget(async (api) => {
    const accounts = await api.getAccounts();
    const open = accounts.filter(a => !a.closed);
    const results = [];
    for (const acct of open) {
      const bal = await api.getAccountBalance(acct.id);
      results.push({
        id: acct.id,
        name: acct.name,
        offbudget: acct.offbudget,
        balance: api.utils.integerToAmount(bal),
      });
    }
    return results;
  }),

  'list-categories': () => withBudget(async (api) => {
    const categories = await api.getCategories();
    const groups = await api.getCategoryGroups();
    const groupMap = new Map(groups.map(g => [g.id, g.name]));
    const grouped = new Map();
    for (const cat of categories) {
      const groupId = cat.group_id;
      if (!grouped.has(groupId)) {
        grouped.set(groupId, {
          group: groupMap.get(groupId) || groupId,
          id: groupId,
          categories: [],
        });
      }
      grouped.get(groupId).categories.push({
        id: cat.id,
        name: cat.name,
        is_income: cat.is_income,
      });
    }
    return Array.from(grouped.values());
  }),

  'list-payees': () => withBudget(async (api) => {
    const payees = await api.getPayees();
    return payees
      .filter(p => !p.transfer_acct)
      .map(p => ({ id: p.id, name: p.name, category: p.category }));
  }),

  'get-transactions': (args) => {
    if (!args.account) {
      throw new Error('--account <name> is required');
    }
    const from = args.from || '2000-01-01';
    const to = args.to || new Date().toISOString().slice(0, 10);
    return withBudget(async (api) => {
      const accountId = await api.getIDByName({ type: 'accounts', name: args.account });
      if (!accountId) {
        throw new Error(`Account not found: ${args.account}`);
      }
      const [transactions, payees, categories] = await Promise.all([
        api.getTransactions(accountId, from, to),
        api.getPayees(),
        api.getCategories(),
      ]);
      const payeeMap = new Map(payees.map(p => [p.id, p.name]));
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      return transactions.map(t => ({
        id: t.id,
        date: t.date,
        amount: api.utils.integerToAmount(t.amount),
        payee: payeeMap.get(t.payee) || t.payee || null,
        category: categoryMap.get(t.category) || t.category || null,
        notes: t.notes,
        cleared: t.cleared,
        imported_id: t.imported_id,
      }));
    });
  },

  'get-budget': (args) => {
    if (!args.month) {
      throw new Error('--month <YYYY-MM> is required');
    }
    return withBudget(async (api) => {
      const budget = await api.getBudgetMonth(args.month);
      const [categories, groups] = await Promise.all([
        api.getCategories(),
        api.getCategoryGroups(),
      ]);
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
      const groupMap = new Map(groups.map(g => [g.id, g.name]));
      return {
        month: budget.month,
        incomeAvailable: api.utils.integerToAmount(budget.incomeAvailable),
        lastMonthOverspent: api.utils.integerToAmount(budget.lastMonthOverspent),
        forNextMonth: api.utils.integerToAmount(budget.forNextMonth),
        totalBudgeted: api.utils.integerToAmount(budget.totalBudgeted),
        toBudget: api.utils.integerToAmount(budget.toBudget),
        categoryGroups: budget.categoryGroups.map(g => ({
          id: g.id,
          name: groupMap.get(g.id) || g.id,
          budgeted: api.utils.integerToAmount(g.budgeted),
          spent: api.utils.integerToAmount(g.spent),
          balance: api.utils.integerToAmount(g.balance),
          categories: g.categories.map(c => ({
            id: c.id,
            name: categoryMap.get(c.id) || c.id,
            budgeted: api.utils.integerToAmount(c.budgeted),
            spent: api.utils.integerToAmount(c.spent),
            balance: api.utils.integerToAmount(c.balance),
            carryover: c.carryover,
          })),
        })),
      };
    });
  },

};

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
