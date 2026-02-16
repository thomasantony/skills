---
name: vikunja
description: Use when user asks about tasks, todos, projects, or mentions Vikunja - provides read-only access to query a Vikunja instance
---

# Vikunja Query Skill

Read-only skill for querying a Vikunja task manager instance. Uses `curl` + `jq` to fetch projects, tasks, labels, and comments.

## Setup

Required environment variables:

| Variable | Description |
|----------|-------------|
| `VIKUNJA_URL` | Base URL (e.g. `https://vikunja.example.com`), no trailing slash |
| `VIKUNJA_API_TOKEN` | API token (Settings > API Tokens in Vikunja UI) |
| `VIKUNJA_TOKEN_FILE` | Alternative: path to file containing the token |

Prerequisites: `curl` and `jq` must be installed.

Token resolution (check env var first, then file):
```bash
TOKEN="${VIKUNJA_API_TOKEN:-$(cat "$VIKUNJA_TOKEN_FILE" 2>/dev/null)}"
[ -z "$TOKEN" ] && echo "Error: Set VIKUNJA_API_TOKEN or VIKUNJA_TOKEN_FILE" && exit 1
```

## curl Template

```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/<endpoint>" | jq '<filter>'
```

## API Quick Reference

| Action | Method | Endpoint | Key Params |
|--------|--------|----------|------------|
| List projects | GET | `/api/v1/projects` | -- |
| Get project | GET | `/api/v1/projects/{id}` | -- |
| List all tasks | GET | `/api/v1/tasks/all` | `s`, `filter`, `sort_by`, `order_by`, `per_page`, `page` |
| Get task detail | GET | `/api/v1/tasks/{id}` | -- |
| List labels | GET | `/api/v1/labels` | -- |
| Get task labels | GET | `/api/v1/tasks/{task}/labels` | -- |
| Get task comments | GET | `/api/v1/tasks/{taskID}/comments` | -- |

## Pagination

Default `per_page=50` (instance max). Use `page=N` to paginate. Check total with:
```bash
curl -sI -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all" | grep -i x-pagination-total-count
```

## Filter Syntax

Use the `filter` query param on `/api/v1/tasks/all`.

- **Fields:** `done`, `priority`, `dueDate`, `startDate`, `endDate`, `doneAt`, `assignees`, `labels`, `project`, `percentDone`, `created`, `updated`
- **Operators:** `=`, `!=`, `>`, `>=`, `<`, `<=`, `like`, `in`, `not in`
- **Logic:** `&&`, `||`, parentheses for grouping
- **Date math:** `now`, `+Nd`, `-Nd`, `/d` (round to day start). Units: `s`, `m`, `h`, `d`, `w`, `M`, `y`
- Strings with spaces must be quoted. Labels use numeric IDs, not names.
- URL-encode the filter value in query strings.

## Sort Params

`sort_by`: `id`, `title`, `description`, `done`, `done_at`, `due_date`, `created`, `updated`, `priority`, `position`
`order_by`: `asc` or `desc`

## Common Recipes

**List projects as tree:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/projects" | jq '.[] | {id, title, parent_project_id}'
```

**List all labels (to get IDs for filtering):**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/labels" | jq '.[] | {id, title}'
```

**Search tasks by title:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?s=search+term" | jq '.[].title'
```

**All incomplete tasks:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=done%20%3D%20false" | jq '.[] | {id, title, priority, due_date}'
```

**Overdue tasks:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=done%20%3D%20false%20%26%26%20dueDate%20%3C%20now" | jq '.[] | {id, title, due_date, priority}'
```

**Tasks due in next 7 days:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=done%20%3D%20false%20%26%26%20dueDate%20%3E%20now%20%26%26%20dueDate%20%3C%20now%2B7d" | jq '.[] | {id, title, due_date}'
```

**Tasks in a specific project:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=project%20%3D%206" | jq '.[] | {id, title, done}'
```

**Tasks by label ID:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=labels%20in%201" | jq '.[] | {id, title, labels}'
```

**High priority tasks:**
```bash
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/all?filter=priority%20%3E%3D%203%20%26%26%20done%20%3D%20false&sort_by=priority&order_by=desc" | jq '.[] | {id, title, priority, project_id}'
```

**Full task detail with comments:**
```bash
TASK_ID=42
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/$TASK_ID" | jq '{id, title, description, priority, due_date, done, labels: [.labels[]?.title], project_id}'
curl -sS -H "Authorization: Bearer $TOKEN" "$VIKUNJA_URL/api/v1/tasks/$TASK_ID/comments" | jq '.[] | {author: .author.name, comment: .comment, created}'
```

## Output Guidance

- Present results as **markdown tables** or **bulleted lists**, never raw JSON.
- **Task lists:** show id, title, project, priority, due_date, done status.
- **Project lists:** show as indented tree grouped by parent_project_id.
- **Task detail:** show title, description (strip HTML tags), labels, priority, dates, comments.
- Summarize large result sets (e.g. "Found 47 tasks, showing top 10 by priority").
- Use `jq` to extract only needed fields before presenting.

## Important Notes

- **READ-ONLY.** Never use PUT, POST, or DELETE endpoints.
- Vikunja uses PUT for creates and POST for updates (unusual convention) -- this skill uses neither.
- Task descriptions may contain HTML. Strip tags when presenting to user.
- Date fields with value `0001-01-01T00:00:00Z` mean "not set" -- treat as null.
