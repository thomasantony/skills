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

// --- Commands ---

const commands = {

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
