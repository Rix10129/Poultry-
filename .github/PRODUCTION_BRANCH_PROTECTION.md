# Production branch protection

In **Settings → Rules → Rulesets**, create a branch ruleset targeting `Production` and enable:

- Require a pull request before merging.
- Require status checks to pass and require branches to be up to date.
- Select `Formatting, linting and types`, `Unit tests`, `Integration tests`, and `Production build` from the `Quality` workflow.
- Block force pushes and deletions, and do not allow bypassing the ruleset.

GitHub stores branch protection in repository settings rather than in the Git tree. An administrator must enable this ruleset after the workflow has run once so its check names are selectable.
