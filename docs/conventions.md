# Conventions

Rules that apply to every change in this repository. They are stable: if a rule
here needs to change, change it deliberately and tell the team.

## Language

| Item                          | Language |
| ----------------------------- | -------- |
| Code, identifiers, file names | English  |
| Documentation                 | English  |
| Commit messages               | English  |
| Content shown to end users    | Spanish  |

The source requirement documents (ERS, SAD) are in Spanish, and the interface is
Spanish because the people using it are. Everything else is English, including
the parts that are easy to forget: route paths, model names, field names, and
the values stored in the database.

A stored value is an identifier, not a sentence. Keeping `approved` in the
database rather than `aprobada` is what lets the interface say "Aprobada",
"Aprobado" or "En regla" without a data migration each time.

## Versioning

Commits follow [Conventional Commits](https://www.conventionalcommits.org).

```
<type>(<scope>): <subject in imperative mood>
```

| Type       | Use for                                           |
| ---------- | ------------------------------------------------- |
| `feat`     | New behaviour visible to a user or another system |
| `fix`      | Corrected behaviour                               |
| `refactor` | Restructuring with no behavioural change          |
| `docs`     | Documentation only                                |
| `test`     | Tests only                                        |
| `chore`    | Tooling, dependencies, configuration              |

Rules:

- One commit is one reviewable unit of work. Tests and documentation ship with
  the code they describe, not in a follow-up commit.
- Never commit generated credentials, `.env` files, co-author trailers, or AI
  attribution lines.
- Subject line in the imperative mood: `add member lookup`, not `added`.

Commits made up to 15 September 2026 are written in Spanish. They stay that
way: the history is public and rewriting it costs more than the inconsistency.
Everything from that point on is English.

Branching and pull request rules are defined by CCLU-116 and will be added here
once that ticket lands.

## Self-explaining code

The name is the documentation. If a reader needs a comment to know what a
function does, the name failed.

| Rule                 | Detail                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Naming               | `camelCase` for variables and functions, `PascalCase` for classes and types                               |
| No abbreviations     | `request`, not `req`. `database`, not `db`. The exception is an established acronym such as `id` or `url` |
| Single purpose       | A function does one thing. If the name needs an `and`, split it                                           |
| Short functions      | If a function does not fit on one screen, it is doing too much                                            |
| Explicit over clever | A reader should never have to decode an expression                                                        |

## Comments

Write a comment only when the code cannot express the reason behind it.

- Explain the **why**, never the **what**. The code already states the what.
- Atomic: one idea per comment, two lines at most.
- Never leave commented-out code. Git remembers it; the file should not.
- Never restate a signature, a type, or an obvious assignment.

- Never cite a requirement identifier. Write the reason itself.

A comment that explains a business constraint or a non-obvious external
limitation earns its place. Everything else is noise.

`// CA-ADM-003-03 requires this` tells a reader nothing they can act on. They
still do not know why, only that someone decided it, and checking costs them a
trip into a versioned PDF whose identifiers may since have moved. Write what the
rule is and the code explains itself:

```js
// An administrator can suspend an account, so being approved once is not
// enough to be let in today.
```

Traceability belongs to the ticket, the pull request and `docs/`, which are
versioned alongside the requirements and read by people looking for exactly
that. Source files are read by people trying to change the code.

## Separation of responsibilities

Every file belongs to exactly one layer and may only depend downward.

```
routes -> controllers -> services -> models
```

The full rules, including the boundary between modules, are in
[architecture.md](architecture.md).

## Data retention

BD-003 of the ERS requires that members, memberships, payments and published
content be kept permanently. Historical records are never physically deleted.

- Never call `deleteOne`, `deleteMany`, `findByIdAndDelete` or `drop` on a
  domain collection.
- A record that should stop being visible changes state. `applicationStatus`,
  `status` and `accountStatus` already exist for that.
- If an entity ever needs a removal its state fields cannot express, add an
  explicit timestamp for it and document the rule here first.

The requirement is traceability: an approval, a rejection and a payment must
still be answerable a year later. A deleted row cannot answer anything.

## Asynchronous error handling

Express 5 forwards a rejected promise from a route handler to the error
middleware automatically. This repository relies on that behaviour.

```js
async function getMember(request, response) {
  const member = await memberService.findByCode(request.params.code);
  response.json(member);
}
```

- Do not wrap controllers in `try/catch` to forward an error.
- Do not write or install an `asyncHandler` wrapper. It is redundant in
  Express 5 and three different wrappers is worse than none.
- Use `try/catch` only when this function can genuinely recover from the
  failure or must add context before rethrowing.
- To signal an HTTP status, throw an error carrying a `statusCode` property.
  `middlewares/errorHandler.js` reads it and defaults to 500.

Errors with a status of 500 or above are logged and returned with a generic
message. Internal failure detail never reaches the client.

## Manual testing collection

`postman.json` in the repository root is a Postman collection covering every
endpoint the API exposes. It exists so a person can exercise the API by hand
without reconstructing requests from the source.

- **Every new endpoint is added to `postman.json` in the same commit that
  creates it.** A collection updated later is a collection that is already
  wrong.
- Requests are grouped in a folder named after the module that owns them, the
  same grouping [architecture.md](architecture.md) applies to the code.
- **The collection never stores a value.** Hosts, tokens and identifiers are
  written as `{{variable}}` and resolved from a Postman environment.

Each person creates their own Postman environment and sets the variables the
collection declares. Environments are not versioned: `.gitignore` covers the
names Postman exports them under, so an exported environment cannot reach the
repository by accident.

This repository is public. A collection is where an access token leaks, because
unlike `.env` it is a file you are meant to commit. Paste a token into your
environment, never into `postman.json`.

If you edit the collection inside Postman and export it again, the export adds
an `_postman_id` and reorders keys, which turns a one-line change into a large
diff. Prefer editing the file directly.
