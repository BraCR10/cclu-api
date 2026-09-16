# Conventions

Rules that apply to every change in this repository. They are stable: if a rule
here needs to change, change it deliberately and tell the team.

## Language

| Item                          | Language |
| ----------------------------- | -------- |
| Code, identifiers, file names | English  |
| Documentation                 | English  |
| Commit messages               | Spanish  |
| Content shown to end users    | Spanish  |

The source requirement documents (ERS, SAD) are in Spanish. Translating a
domain term is the exception, not the rule: an `agremiado` is an `agremiado`,
not a `member`.

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
- Subject line in the imperative mood: `agrega busqueda de agremiado`, not
  `agregado`.

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

A comment that explains a business constraint or a non-obvious external
limitation earns its place. Everything else is noise.

## Separation of responsibilities

Every file belongs to exactly one layer and may only depend downward.

```
routes -> controllers -> services -> models
```

The full rules, including the boundary between modules, are in
[architecture.md](architecture.md).

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
