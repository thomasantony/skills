# Vikunja Query Skill Design

## Summary

A Claude Code skill that enables read-only querying of a self-hosted Vikunja task manager instance via its REST API. Distributed as a skill marketplace plugin.

## Approach

Pure prompt skill (SKILL.md only) — no shell scripts or MCP servers. Claude constructs `curl` commands from a compact API reference embedded in the skill. Uses `jq` for JSON formatting.

## Structure

```
skills/
  vikunja/
    SKILL.md
  plugin.json
```

## Authentication

The skill instructs Claude to resolve credentials in order:
1. `$VIKUNJA_API_TOKEN` env var
2. Contents of file at `$VIKUNJA_TOKEN_FILE`
3. Error with setup instructions

Base URL from `$VIKUNJA_URL` (required, no default).

## Scope

Read-only. The skill covers:

| Query | API Endpoint |
|-------|-------------|
| List projects (with hierarchy) | `GET /api/v1/projects` |
| Get single project | `GET /api/v1/projects/{id}` |
| List all tasks | `GET /api/v1/tasks/all` |
| List tasks in a project view | `GET /api/v1/projects/{id}/views/{view}/tasks` |
| Get single task (full detail) | `GET /api/v1/tasks/{id}` |
| List labels | `GET /api/v1/labels` |
| Get task labels | `GET /api/v1/tasks/{task}/labels` |
| Get task comments | `GET /api/v1/tasks/{taskID}/comments` |
| Search/filter tasks | `GET /api/v1/tasks/all?s=<query>` + filter params |

## SKILL.md Contents

1. **Frontmatter** — name: `vikunja`, description triggers on Vikunja/task queries
2. **When to use** — user asks about tasks, projects, todos, or mentions Vikunja
3. **Auth setup** — env var resolution order, curl header pattern
4. **API quick reference** — table of endpoints with method, path, key params
5. **curl patterns** — base curl template, pagination, filtering, sorting
6. **Common recipes** — overdue tasks, tasks by project, tasks by label, upcoming due dates, search
7. **Output guidance** — summarize results in tables/lists, don't dump raw JSON

## Key Design Decisions

- **No write operations** — read-only to keep the skill safe and simple
- **No shell script** — curl + jq is sufficient; keeps zero dependencies beyond standard tools
- **Compact API reference** — only the ~10 read endpoints that matter, not the full 120+
- **Filter syntax included** — Vikunja uses a custom filter syntax (e.g. `done = false`, `due_date < now`) that Claude needs to know
- **jq for formatting** — pipe curl output through jq to extract relevant fields rather than dumping full API responses

## plugin.json

Standard marketplace metadata: name, description, version, author, keywords.
