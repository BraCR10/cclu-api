# Setup

Start the API from a clean clone.

## Requirements

| Requirement                           | How to check     |
| ------------------------------------- | ---------------- |
| Node, version pinned in `.nvmrc`      | `node --version` |
| A MongoDB Atlas cluster you can reach | See below        |

With `nvm` installed, `nvm use` reads `.nvmrc` and selects the right version.
The exact version lives in `.nvmrc` and `package.json`, never in this document.

## MongoDB Atlas access

Copying the environment file is not enough. The cluster has to let you in, and
that takes three things:

1. **A cluster.** The team shares one development cluster. Ask the project lead
   for access instead of creating a second one.
2. **A database user.** Atlas credentials are per user, not per team. You need
   your own username and password on that cluster.
3. **Your IP address in the allowlist.** Atlas rejects every connection from an
   address it does not know, and the error it returns looks like a timeout
   rather than a permission problem. If the connection hangs and then fails,
   check this first.

A home connection usually has a dynamic IP, so an address that worked last week
can stop working. Re-adding it is normal.

## Steps

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in the values. Every variable the API reads is listed
below, grouped by when it is read.

**Read at startup.** The API refuses to start if any of these is missing, and
tells you which.

| Variable         | Purpose                                                          | Example                                                      |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `MONGODB_URI`    | Connection string from Atlas, with your own user and password    | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/cclu` |
| `JWT_SECRET`     | Signs the session token. Generate with `openssl rand -hex 32`    | 64 hexadecimal characters                                    |
| `JWT_EXPIRES_IN` | Lifetime of a session token                                      | `2h`                                                         |
| `WEB_ORIGIN`     | Exact origin of `cclu-web`, and the base of every link in a mail | `http://localhost:3000`                                      |
| `COOKIE_SECURE`  | `true` when deployed, `false` only for local http development    | `false`                                                      |

**Optional at startup.**

| Variable      | Purpose                                                  | Example |
| ------------- | -------------------------------------------------------- | ------- |
| `PORT`        | Port for the API. Defaults to 4000 if unset              | `4000`  |
| `TRUST_PROXY` | `true` only when the API answers through a reverse proxy | `false` |

**Read when the first mail is sent.** The API starts without them. Until they
are set, approving or rejecting an application still succeeds but its mail is
only logged as not delivered, and requesting a password link fails. Any SMTP server works; [Ethereal](https://ethereal.email) gives a test inbox
for local development.

| Variable        | Purpose                                                 | Example                                             |
| --------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `SMTP_HOST`     | SMTP server                                             | `smtp.ethereal.email`                               |
| `SMTP_PORT`     | SMTP port                                               | `587`                                               |
| `SMTP_SECURE`   | `true` only on port 465. Optional, defaults to `false`  | `false`                                             |
| `SMTP_USER`     | SMTP user                                               | The user your provider gives you                    |
| `SMTP_PASSWORD` | SMTP password                                           | The password your provider gives you                |
| `MAIL_FROM`     | Sender the recipient sees, in the `Name <address>` form | `Cámara de Comercio de La Unión <no-reply@cclu.cr>` |

**Read when the first file is stored.** No endpoint stores a file yet, so the
API runs without them today. Any S3 compatible provider works.

| Variable               | Purpose                                                      | Example                            |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `S3_ENDPOINT`          | Provider endpoint                                            | `https://<provider-endpoint>`      |
| `S3_REGION`            | Region the provider expects                                  | `auto`                             |
| `S3_BUCKET`            | Bucket name                                                  | `cclu-development`                 |
| `S3_ACCESS_KEY_ID`     | Access key                                                   | The key your provider gives you    |
| `S3_SECRET_ACCESS_KEY` | Secret key                                                   | The secret your provider gives you |
| `S3_FORCE_PATH_STYLE`  | `true` on providers that name the bucket in the path (MinIO) | `false`                            |

Atlas gives you the connection string under **Connect > Drivers**. Replace the
placeholder password and keep the `/cclu` database name at the end.

## First run

An empty database has nothing to choose from and nobody to sign in as. Run
these two once, after `.env` is filled in:

```bash
npm run seed-catalogs
ADMIN_PASSWORD='<password>' npm run create-admin -- <email> [name]
```

`seed-catalogs` loads the cantons and sectors from `scripts/data/` into the
database. The registration form offers only what this loads, so registering
fails until it has run. It upserts by name, so running it again updates the same
entries rather than duplicating them.

`create-admin` creates the first administrator, since the panel has no way to
sign up. The password is read from `ADMIN_PASSWORD` rather than from the
command line so it is never printed, and it follows the same rules as a member
password: at least 8 characters, with a letter, a number and a symbol. The name
is optional. It refuses an address that already belongs to a member or to
another administrator.

Then start it:

```bash
npm start
```

The API refuses to start if a startup variable is missing and tells you which
one it needs. That is intentional: a server running without a database is
harder to diagnose than one that never started.

## Verify

```bash
curl http://localhost:4000/health
```

A working setup returns `200` with `"database": "connected"`. A `503` with
`"database": "disconnected"` means the process started but Atlas refused or
dropped the connection, which points back to the access section above.

## Checks before pushing

The QA workflow runs these three on every pull request, in this order, and a
failure in any of them blocks the merge. Run them locally first:

```bash
npm run lint
npm run format:check
npm test
```

## Port note

`cclu-web` runs on port 3000 in development, so this API defaults to 4000. If
you change `PORT`, update `NEXT_PUBLIC_API_URL` in `cclu-web` to match.

## Never commit

`.env` holds real credentials and is ignored by git. This repository is public.
A credential pushed here is compromised the moment it lands, and deleting the
file afterwards does not undo it: rotate the credential instead.
