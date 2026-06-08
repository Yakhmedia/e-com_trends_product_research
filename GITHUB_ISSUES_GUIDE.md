# GITHUB_ISSUES_GUIDE.md

## Purpose

- Provide a **consistent, objective** reference for AI dev agents (and humans) to create, update, and close GitHub issues that track work on the `e-com_trends_product_research` project.
- Ensure every change, feature, bug, or research task is reflected in an issue, linked to a milestone, and labeled appropriately.

## Issue Lifecycle

1. **Draft** – Agent creates a *draft* issue with a clear title and description before any code change.
2. **Start Work** – When work begins, the issue moves to the `In Progress` column (or gets the `in-progress` label).
3. **Update** – Throughout development, the issue is updated with:
   - Progress notes
   - Links to commits (`git commit` messages should include `#<issue‑number>`)
   - Screenshots or design artifacts (if applicable)
4. **Review** – Once a pull request is opened, add the `needs‑review` label and link the PR in the issue body.
5. **Done** – After PR merge, change the issue status to `Done` (or `closed`) and add the `completed` label.

## Naming Conventions

- **Feature**: `feat: <short description>`
- **Bug**: `bug: <short description>`
- **Research/Spike**: `spike: <short description>`
- **Chore/Task**: `chore: <short description>`

*Example*: `feat: add product trend analysis endpoint`

## Labels

| Label | Meaning |
|-------|----------|
| `enhancement` | New feature or improvement |
| `bug` | Defect to be fixed |
| `research` | Investigation, data collection |
| `in-progress` | Work has started |
| `needs-review` | Pull request awaiting review |
| `blocked` | Waiting on external factor |
| `completed` | Issue finished and closed |

> **Tip**: Keep the label set minimal; add new labels only when a distinct workflow step is required.

## Milestones

- Create a **milestone** per sprint or major release (e.g., `Sprint 1 – 2026‑07‑01`).
- When drafting an issue, assign the appropriate milestone.
- At sprint end, review the milestone to ensure all issues are either `completed` or moved to the next milestone.

## Issue Templates (optional but recommended)

Create `.github/ISSUE_TEMPLATE/` files for the following types:

1. **Feature**
   ```md
   **Goal**
   <!-- What is the intended outcome? -->

   **Scope**
   <!-- High‑level description of work -->

   **Acceptance Criteria**
   - [ ] Criterion 1
   - [ ] Criterion 2
   ```
2. **Bug**
   ```md
   **Description**
   <!-- Steps to reproduce -->

   **Expected Behaviour**
   <!-- What should happen? -->

   **Actual Behaviour**
   <!-- What actually happens? -->
   ```
3. **Research/Spike**
   ```md
   **Question**
   <!-- What are we investigating? -->

   **Approach**
   <!-- Proposed method -->

   **Outcome**
   <!-- Findings, data, or decision -->
   ```

## Best Practices for AI Dev Agents

- **Always** create an issue *before* executing a command that modifies code.
- Include the issue number in the commit message, e.g., `git commit -m "#123 feat: add trend endpoint"`.
- When a PR is opened, automatically add a comment linking the PR to the issue using the MCP `add_comment_to_pending_review` tool (or similar).
- If an issue is blocked, add the `blocked` label and a note with a link to the blocker.
- Keep issue bodies concise but include **links** to design mocks, data files, or relevant documentation.
- At the end of each session, run a quick audit: are there any `in‑progress` issues without recent updates? If so, add a status note.

## Example Workflow

1. **Agent**: `create_issue` → Title: `feat: add trend analysis API` → Body includes description, acceptance criteria, milestone `Sprint 1` → Labels `enhancement`, `in-progress`.
2. **Agent**: `git checkout -b feat/trend-analysis`
3. **Agent**: Write code, commit with `#<issue‑number>`.
4. **Agent**: Open PR, add `needs-review` label to issue, comment with PR link.
5. **Agent**: After merge, add `completed` label & close issue.

---

*Keep this file version‑controlled in the project root so every AI dev agent can read it at the start of a chat.*
