---
name: brain2-capture
description: Use when the user asks to save insights from the current conversation as a note, or says things like "save this to brain2", "make a note of this", "capture this", or "write this up"
---

# brain2 Note Capture

Distill insights from the current Claude conversation into a note for the user's digital garden (Zola-based zettelkasten at `/Users/thomas/code/brain2/`).

## When to Use

- User says "save this", "capture this", "write this up", "make a note", "add to brain2", etc.
- User asks you to turn part of the conversation into a note
- At the end of a meaty technical discussion where real insights emerged

## Writing Style Guide

The notes must sound like Thomas wrote them, not like an AI summary. Study these patterns:

**Voice:** Direct, explanatory, first-person-adjacent. Writes as if explaining to a smart friend (or future self). Not academic, not blog-post-chatty. Just clear.

**Opening:** Jump straight into what the thing IS. No preamble, no "In this note we will explore...". Just state it.
- GOOD: "A Schmitt trigger is a Comparator with hysteresis."
- GOOD: "Git worktrees allow you to check out multiple branches simultaneously without re-cloning."
- GOOD: "Hamming code is an error correction system that can correct a single error in a message."
- BAD: "In this note, I'll explain what a Schmitt trigger is and why it matters."
- BAD: "Let's dive into how Hamming codes work!"

**Structure:**
- Short paragraphs (2-4 sentences typical)
- Headers (`##`) only when there are genuinely distinct sections
- Code blocks with language tags when showing code/commands
- LaTeX via `{% mathjax() %}` blocks when math is needed (set `latex = true` in frontmatter)
- ASCII diagrams in code blocks when visual layout helps
- Inline links to Wikipedia or docs for prerequisite concepts: `[Comparator](https://en.wikipedia.org/wiki/Comparator)`
- Cross-links to other brain2 notes use Zola format: `[Parity Check](@/notes/202108162030_parity-check.md)`

**Tone markers:**
- Uses "basically" and "effectively" when simplifying
- Uses "This is because..." to explain non-obvious consequences
- Occasionally parenthetical asides: "(put a NOT in front of it)"
- References where ideas came from naturally: "I came across this watching..."
- Practical "one simple application of this is..." when relevant

**What to AVOID:**
- Bullet-point-heavy AI summaries
- "Key takeaways" or "Summary" sections
- Hedging language ("It's worth noting that...", "Interestingly...")
- Emojis
- Marketing language ("powerful", "elegant", "game-changing")
- Headers for every paragraph — only use them for genuinely separate sections

**References:** Always include a `## References` section at the end with sources. Use footnote style `[^1]` for inline citations when the note references specific claims. Use bare URLs or markdown links for general references.

**Length:** Match the complexity. The Schmitt trigger note is 3 sentences. The Hamming codes note is several paragraphs with diagrams. Don't pad. Don't truncate. Write what the idea needs.

## Process

1. **Ask what to capture** if not obvious. The user might want the whole discussion distilled, or just one specific insight.

2. **Identify the core idea.** What's the one thing future-Thomas needs to understand? Frame the note around that.

3. **Draft the note** including full frontmatter. Present it to the user in a code block for review.

   Frontmatter format (TOML with `+++` delimiters):
   ```
   +++
   title = "Title Goes Here"
   date = "2025-01-15T12:00:00.000Z"
   draft = false

   [taxonomies]
   notes =["Category"]
   [extra]
   latex = true
   +++
   ```

   - `title`: Descriptive, often a question ("How Do Hamming Codes Work?") or noun phrase ("Volume Rendering")
   - `date`: Current UTC time in ISO format
   - `draft`: Default `false`. Use `true` if the note feels incomplete.
   - `[taxonomies]` `notes`: Pick from existing categories. Check what exists by looking at other notes. Known categories include: "Aerospace Engineering", "AI/ML", "Aviation", "Computer Graphics", "Computer Science", "Computer Vision", "Differential Geometry", "Electronics and Embedded Systems", "Information Security", "Mathematics", "Physics", "Productivity", "Recipes", "Software Development"
   - `[extra]` `latex = true`: Only include if the note uses LaTeX math

4. **Get user approval.** They may want to tweak wording, add context, or change the framing. This is their voice, not yours.

5. **Write the file.** Use the timestamp naming convention: `YYYYMMDDHHMI_slugified-title.md` where the timestamp is local time. Write to `/Users/thomas/code/brain2/`.

6. **Mention the filename** so the user knows where it landed.

## Multiple Notes

If the conversation covered several distinct topics, suggest splitting into separate atomic notes (the zettelkasten way). Each note should stand alone. Cross-link them using the `@/notes/filename.md` syntax.

## Quick Capture Mode

If the user just wants to dump a half-formed thought, don't over-polish it. Write it as-is with `draft = true`. A messy note that exists is better than a perfect note that doesn't.
