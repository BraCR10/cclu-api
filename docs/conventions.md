# Conventions

Rules that apply to every change in this repository. They are stable: if a rule
here needs to change, change it deliberately and tell the team.

## Language

| Item                          | Language |
| ----------------------------- | -------- |
| Code, identifiers, file names | English  |
| Comments                      | English  |
| Configuration examples        | English  |
| Documentation                 | English  |
| Commit messages               | English  |
| Content shown to end users    | Spanish  |

The interface is Spanish because the people using it are. Everything else is English, including
the parts that are easy to forget: route paths, model names, field names, the
values stored in the database, comments, and the explanations in
`.env.example`.

A comment is written for whoever maintains the code, and the code is English,
so the comment is too. A value inside `.env.example` may still be Spanish when a
person reads it, as the sender name in `MAIL_FROM` does; the explanation above
it is not. In this repository,
`tests/conventions/commentLanguage.test.js` fails when a comment in `src`,
`scripts`, `tests` or `.env.example` slips into Spanish, so this is checked
rather than remembered.

A stored value is an identifier, not a sentence. Keeping `approved` in the
database rather than `aprobada` is what lets the interface say "Aprobada",
"Aprobado" or "En regla" without a data migration each time.

## Error messages

The API and the web split an error into what a program decides and what a person
reads.

The API answers every client error with the same shape:

```json
{
  "error": "ValidationError",
  "message": "Too long.",
  "code": "too_long",
  "field": "phone"
}
```

- `code` is stable, snake_case and in English. It is the only thing a client
  decides on. Adding an error means adding a code, never reusing a message.
- `field` names the input the error belongs to, when there is one.
- `message` is English and written for whoever reads the logs or calls the API by
  hand. It is never shown to a user and may change at any time.

The web keeps one catalog that turns each `code` into the Spanish sentence a
person reads. An error with a `field` appears under that input; one without it
appears in a toast. A code missing from the catalog, or any server error, shows
the generic message "Algo salió mal. Intentá de nuevo."

Emails are the one exception: the API writes them in Spanish, because they reach
a person without passing through the web.

### Error contract

`cclu-api/src/config/errorCodes.json` is the registry: the only codes the API
answers with. A test in the API fails when the source writes a code that is not
in it.

| Status | `code`                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 4xx    | A registered code, or `invalid_request` when the failure came from outside the application, such as a body that is not JSON |
| 5xx    | Always `internal_error`, with a generic `message` and no `field`                                                            |

- The API raises a client error with `ApplicationError`, from
  `cclu-api/src/config/errorCodes.js`: a code, a message and, when needed, a
  status (400 by default), a `field` and a `reason`. Every client error is one,
  and none is built by setting `statusCode` by hand. A server failure needs no
  code, since the answer is `internal_error` whatever caused it.
- `reason` refines a code when a screen needs the detail, such as the state an
  already decided application is in.
- `cclu-web` keeps a copy of the registry in `tests/fixtures/apiErrorCodes.json`.
  Its contract test fails when a code in that copy has no sentence in the
  `errors` messages.

Adding a code takes three edits: the registry, the copy in `cclu-web` (run
`npm run sync:error-codes` there with both repositories cloned side by side),
and the sentence in the `errors` messages.

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

Branching and pull request rules are in [branching.md](branching.md).

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

The full rules, including how services call each other, are in
[architecture.md](architecture.md).

## Data retention

Members, memberships, payments and published content are kept permanently. Historical records are never physically deleted.

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
- To signal an HTTP status, throw an `ApplicationError` with a registered code
  (see [Error contract](#error-contract)). `middlewares/errorHandler.js` reads
  its status and defaults to 500.

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
