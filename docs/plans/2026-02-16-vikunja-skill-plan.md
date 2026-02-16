# Vikunja Query Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Claude Code skill plugin that enables read-only querying of a Vikunja task manager instance via curl.

**Architecture:** Single SKILL.md prompt skill with embedded API reference. Claude constructs curl commands at runtime. Distributed as a skill marketplace plugin with plugin.json.

**Tech Stack:** Markdown (SKILL.md), JSON (plugin.json), curl + jq at runtime.

---

### Task 1: Create plugin.json

**Files:**
- Create: `plugin.json`

**Step 1: Write plugin.json**

```json
{
  "name": "vikunja",
  "description": "Read-only query skill for Vikunja task manager - list projects, search tasks, filter by labels and due dates",
  "version": "0.1.0",
  "author": {
    "name": "Thomas Antony"
  },
  "license": "MIT",
  "keywords": ["vikunja", "tasks", "todo", "project-management"]
}
```

**Step 2: Commit**

```bash
git add plugin.json
git commit -m "feat: add plugin.json for vikunja skill marketplace plugin"
```

---

### Task 2: Create SKILL.md

**Files:**
- Create: `skills/vikunja/SKILL.md`

**Step 1: Write the skill file**

The SKILL.md must contain these sections in order. Here is the complete content:

**Frontmatter:**
```yaml
---
name: vikunja
description: Use when user asks about tasks, todos, projects, or mentions Vikunja - provides read-only access to query a Vikunja instance
---
```

**Body sections (all inline in the same file):**

1. **Overview** (2 sentences) — What: read-only querying of Vikunja. How: curl + jq.

2. **Setup** — Required env vars:
   - `VIKUNJA_URL` — Base URL of the Vikunja instance (e.g. `https://vikunja.example.com`), no trailing slash
   - `VIKUNJA_API_TOKEN` — API token (create under Settings > API Tokens in Vikunja UI)
   - `VIKUNJA_TOKEN_FILE` — Alternative: path to file containing the token
   - Resolution order: check `$VIKUNJA_API_TOKEN` first, then `cat $VIKUNJA_TOKEN_FILE`, error if neither set

3. **curl template** — The base pattern all queries use:
   ```
   curl -s -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/<endpoint>" | jq '<filter>'
   ```

4. **API Quick Reference** — Table with these read-only endpoints:

   | Action | Method | Endpoint | Key Params |
   |--------|--------|----------|------------|
   | List projects | GET | `/api/v1/projects` | — |
   | Get project | GET | `/api/v1/projects/{id}` | — |
   | List all tasks | GET | `/api/v1/tasks/all` | `s`, `filter`, `sort_by`, `order_by`, `per_page`, `page` |
   | Get task detail | GET | `/api/v1/tasks/{id}` | — |
   | List labels | GET | `/api/v1/labels` | — |
   | Get task labels | GET | `/api/v1/tasks/{task}/labels` | — |
   | Get task comments | GET | `/api/v1/tasks/{taskID}/comments` | — |

5. **Pagination** — Default `per_page=50` (instance max). Use `page=N` to paginate. Total count in `x-pagination-total-count` response header (use `curl -sI` to check).

6. **Filter Syntax** — Compact reference:
   - Fields: `done`, `priority`, `dueDate`, `startDate`, `endDate`, `doneAt`, `assignees`, `labels`, `project`, `percentDone`, `created`, `updated`
   - Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `like`, `in`, `not in`
   - Logic: `&&`, `||`, parentheses
   - Date math: `now`, `+Nd`, `-Nd`, `/d` (round to day start). Units: `s`, `m`, `h`, `d`, `w`, `M`, `y`
   - Strings with spaces must be quoted
   - Labels use numeric IDs, not names
   - URL-encode the filter value in the query string

7. **Sort params** — `sort_by` accepts: `id`, `title`, `description`, `done`, `done_at`, `due_date`, `created`, `updated`, `priority`, `position`. `order_by`: `asc` or `desc`.

8. **Common Recipes** — curl one-liners for:
   - List projects as tree (jq to show id, title, parent_project_id)
   - Search tasks by title (`?s=query`)
   - All incomplete tasks (`?filter=done = false`)
   - Overdue tasks (`?filter=done = false && dueDate < now`)
   - Tasks due in next 7 days (`?filter=done = false && dueDate > now && dueDate < now+7d`)
   - Tasks in a specific project (`?filter=project = 6`)
   - Tasks by label ID (`?filter=labels in 1`)
   - High priority tasks (`?filter=priority >= 3 && done = false`)
   - Get full task detail with description, labels, and comments (3 separate calls or single task endpoint which includes labels inline)

9. **Output Guidance** — Instructions for Claude:
   - Present results as markdown tables or bulleted lists, never raw JSON
   - For task lists: show id, title, project, priority, due_date, done status
   - For project lists: show as indented tree by parent_project_id
   - For task detail: show title, description (strip HTML tags), labels, priority, dates, comments
   - Summarize large result sets (e.g. "Found 47 tasks, showing top 10 by priority")
   - Use jq to extract only needed fields before presenting

10. **Important Notes:**
    - This skill is READ-ONLY. Never use PUT, POST, or DELETE endpoints.
    - The Vikunja API uses PUT for creates and POST for updates (unusual convention), but this skill does not use either.
    - Task descriptions may contain HTML. Strip tags when presenting to user.
    - Date fields with value `0001-01-01T00:00:00Z` mean "not set" — treat as null.

**Step 2: Commit**

```bash
git add skills/vikunja/SKILL.md
git commit -m "feat: add vikunja query skill with API reference and recipes"
```

---

### Task 3: Test the skill

**Step 1: Verify plugin structure**

```bash
ls -la plugin.json skills/vikunja/SKILL.md
```

Expected: both files exist.

**Step 2: Verify SKILL.md frontmatter**

Read `skills/vikunja/SKILL.md` and confirm:
- Has valid YAML frontmatter with `name: vikunja` and `description` starting with "Use when"
- Description is under 500 characters
- Total frontmatter under 1024 characters

**Step 3: Test a curl recipe from the skill**

Pick the "list projects as tree" recipe and run it against the real instance to verify it works:

```bash
curl -s -H "Authorization: Bearer $VIKUNJA_API_TOKEN" "$VIKUNJA_URL/api/v1/projects" | jq '.[] | {id, title, parent_project_id}'
```

Expected: JSON objects with project info.

**Step 4: Test a filter recipe**

Run the "incomplete tasks" recipe:

```bash
curl -s -H "Authorization: Bearer $VIKUNJA_API_TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=done%20%3D%20false&per_page=5" | jq '.[] | {id, title, done, project_id}'
```

Expected: tasks with `done: false`.

**Step 5: Commit any fixes**

If any recipes needed adjustment, commit the fixes.

---

### Task 4: Add .gitignore and finalize

**Files:**
- Create: `.gitignore`

**Step 1: Create .gitignore**

```
token.env
*.env
```

**Step 2: Final commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore to exclude token files"
```
