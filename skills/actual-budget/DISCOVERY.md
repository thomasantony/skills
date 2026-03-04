# Why actual-budget Skill Wasn't Discovered

## The Problem

The actual-budget skill exists at `/Users/thomas/code/projects-2026-02/skills/skills/actual-budget/` but was not in Claude Code's available skills list despite being installed locally.

## Root Cause Analysis

### 1. Skill Registration Issue
- **The skill is custom/local** in a non-standard location (`~/code/projects-2026-02/skills/`)
- **Claude Code loads skills from:**
  - `/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/skills/` (system skills)
  - `~/.claude/skills/` (user-installed skills, per-environment)
  - Registered plugins from settings

- **This skill location:** `/Users/thomas/code/projects-2026-02/skills/skills/actual-budget/`
  - Not in standard paths
  - Not symlinked to `~/.claude/skills/`
  - Not registered as a plugin in Claude Code settings

### 2. Search/Discovery Gap
- The skill wasn't available in the skill system namespace
- I tried invoking with `Skill` tool → "Unknown skill: actual-budget"
- Even though SKILL.md exists with proper metadata

### 3. What Would Have Worked
To make the skill discoverable, one of these approaches:

**Option A: Symlink to user skills directory**
```bash
ln -s /Users/thomas/code/projects-2026-02/skills/skills/actual-budget \
      ~/.claude/skills/actual-budget
```

**Option B: Register as plugin**
- Add to Claude Code settings.json plugins configuration
- Would appear in available skills list

**Option C: Move to standard location**
```bash
cp -r /Users/thomas/code/projects-2026-02/skills/skills/actual-budget \
      ~/.claude/skills/
```

## Why I Could Still Execute It

Even though the skill wasn't discoverable via `Skill` tool, I could:
1. Read the SKILL.md directly with `Read` tool
2. Run the CLI directly with `Bash` tool
3. Parse and execute commands manually

This is why "It is a plugin that is installed" + "you can also find it at ~/code/projects-2026-02/skills" worked—the user knew the location and could guide me to it.

## The Fix

Created a symlink in the discoverable location:
```bash
ln -s /Users/thomas/code/projects-2026-02/skills/skills/actual-budget ~/.claude/skills/actual-budget
```

Now the skill appears in Claude Code's available skills list and can be invoked via the `Skill` tool.

## Lesson Learned

**Skills need to be in a discoverable location to be listed by Claude Code:**
- `~/.claude/skills/` for user-local skills (best for personal/test skills)
- System paths for globally shared skills
- Plugin registry for formal integration

The skill code works perfectly; it just needed proper installation/registration for discoverability.
