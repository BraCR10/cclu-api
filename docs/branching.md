# Branching

Two long-lived branches, one short-lived branch per unit of work.

| Branch                          | Role                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `main`                          | **Releases only.** Receives merges from `develop` when a version ships |
| `develop`                       | **Integration.** Every pull request targets this branch                |
| `<type>/CCLU-<n>-<description>` | One unit of work. Branches from `develop`, returns to `develop`        |

Nothing is pushed directly to `main` or `develop`. Both are protected and
require the continuous integration check to pass before a merge.

## Naming a branch

```
feat/CCLU-11-agremiado-registration
fix/CCLU-58-atlas-connection
docs/CCLU-52-testing-conventions
```

The prefix uses **the same types as commit messages**, listed in
[conventions.md](conventions.md): `feat`, `fix`, `docs`, `refactor`, `test`,
`chore`. One vocabulary for both, not two to remember.

The description is written in English, like commit messages. Domain terms keep
their Spanish form: a branch about agremiados says `agremiado`.

The ticket key belongs in the name so Jira links the work automatically, and so
anyone reading `git branch` knows what a branch is for without asking.

## The cycle

```bash
git switch develop
git pull
git switch -c feat/CCLU-11-registro-de-agremiados

# work, committing in units

git push -u origin feat/CCLU-11-registro-de-agremiados
```

Then open a pull request against `develop`. The checks run on the pull request
itself; a red check blocks the merge.

Once merged, delete the branch. A branch that outlives its pull request only
makes `git branch` harder to read.

## Pull request and issue templates

GitHub fills every pull request from `.github/pull_request_template.md` and every
issue from `.github/issue_template.md`. Keep the sections the change needs and
delete the rest.

Two rules keep them short.

**The description addresses the reviewer; Jira holds the record.** A decision
belongs in the pull request when it changes how the diff should be read, and in
the ticket when someone will need it in six months.

**Never restate what a check already proves.** The QA workflow reports lint,
formatting and unit tests on the pull request itself.

## Why `main` stays behind

`main` answers one question: what is released. If it also received day-to-day
work, that question would have no answer, and the difference between "merged"
and "released" would stop existing.

This matters at the end of the project. The delivered version is whatever `main`
points at, and it should not be whatever happened to merge last.

## Releasing

Merge `develop` into `main` when a version ships. `main` never merges back into
a feature branch; feature branches always start from `develop`.
