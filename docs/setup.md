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

| Variable                  | Purpose                                                                       | Example |
| ------------------------- | ----------------------------------------------------------------------------- | ------- |
| `PORT`                    | Port for the API. Defaults to 4000 if unset                                   | `4000`  |
| `TRUST_PROXY`             | `true` only when the API answers through a reverse proxy                      | `false` |
| `REMEMBERED_SESSION_DAYS` | How long a session lasts when somebody asks to stay signed in. Defaults to 30 | `30`    |

**Read when the first mail is sent.** The API starts without them. Until they
are set, approving or rejecting an application still succeeds but its mail is
only logged as not delivered, a registration still succeeds and its confirmation
is logged the same way, and requesting a password link fails. The membership
mails behave the same way: a plan still moves to Gratuita when its mail cannot
be sent, and a reminder that cannot be sent is tried again on the next hourly
run. Any SMTP server works; [Ethereal](https://ethereal.email) gives a test inbox
for local development.

| Variable        | Purpose                                                 | Example                                             |
| --------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `SMTP_HOST`     | SMTP server                                             | `smtp.ethereal.email`                               |
| `SMTP_PORT`     | SMTP port                                               | `587`                                               |
| `SMTP_SECURE`   | `true` only on port 465. Optional, defaults to `false`  | `false`                                             |
| `SMTP_USER`     | SMTP user                                               | The user your provider gives you                    |
| `SMTP_PASSWORD` | SMTP password                                           | The password your provider gives you                |
| `MAIL_FROM`     | Sender the recipient sees, in the `Name <address>` form | `Cámara de Comercio de La Unión <no-reply@cclu.cr>` |

**Read when the first file is stored.** Without them the disk answers instead,
under `FILE_STORAGE_DIRECTORY` (`.file-storage` by default), which is what a
development machine has; `API_PUBLIC_URL` says which address to hand a stored
file out under, and defaults to `http://localhost:4000`. A deployment that
stores files sets all six variables and the files live in the buckets instead of
on the machine. Any S3 compatible provider works.

| Variable               | Purpose                                                      | Example                            |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------- |
| `S3_ENDPOINT`          | Provider endpoint                                            | `https://<provider-endpoint>`      |
| `S3_REGION`            | Region the provider expects                                  | `auto`                             |
| `S3_PUBLIC_BUCKET`     | Bucket for files anybody may see, such as logos              | `cclu-development-public`          |
| `S3_PRIVATE_BUCKET`    | Bucket for receipts and certifications, never public         | `cclu-development-private`         |
| `S3_ACCESS_KEY_ID`     | Access key                                                   | The key your provider gives you    |
| `S3_SECRET_ACCESS_KEY` | Secret key                                                   | The secret your provider gives you |
| `S3_FORCE_PATH_STYLE`  | `true` on providers that name the bucket in the path (MinIO) | `false`                            |

`NODE_ENV=production` without all six refuses to start: a server writing
receipts to its own disk loses them on the next deploy. The private bucket must
have public access blocked; the public one allows reading objects and nothing
else.

Atlas gives you the connection string under **Connect > Drivers**. Replace the
placeholder password and keep the `/cclu` database name at the end.

## First run

An empty database has nothing to choose from and nobody to sign in as. Run
these two once, after `.env` is filled in:

```bash
npm run seed-catalogs
ADMIN_PASSWORD='<password>' npm run create-admin -- <email> [name]
```

`seed-catalogs` loads the cantons, the activities and the four plans from
`scripts/data/` into the database, and creates the membership policy with a
seven-day expiry notice. The registration form offers only what this
loads, and approving an application needs the plans, so both fail until it has
run. It upserts each entry by its name or key, so running it again updates the
same entries rather than duplicating them. A plan's fee is written only when the
plan is created, so seeding again never undoes a fee the chamber changed from
the panel, and the notice is written only when the policy is created. The
activities it ships with are a starting set: the official one is
the municipality's patent roll.

`create-admin` creates the first administrator, since the panel has no way to
sign up. The password is read from `ADMIN_PASSWORD` rather than from the
command line so it is never printed, and it follows the same rules as a member
password: at least 8 characters, with a letter, a number and a symbol. The name
is optional. It refuses an address that already belongs to a member or to
another administrator.

If the database already holds members approved before memberships existed,
give each of them Gratuita once. It only creates what is missing, so it is safe
to run again:

```bash
npm run grant-free-memberships
```

Then start it:

```bash
npm start
```

Once connected, the API runs the membership job at start and every hour after:
it moves expired paid plans to Gratuita and sends the reminders within the expiry notice. To
run it now instead of waiting, use `npm run run-membership-expiry`. Access never
waits for it; see [Time and access](architecture.md#time-and-access).

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

Run the same checks CI runs, in this order:

1. `npm run lint`
2. `npm run format:check`
3. `npm test`

## Port note

`cclu-web` runs on port 3000 in development, so this API defaults to 4000. If
you change `PORT`, update `NEXT_PUBLIC_API_URL` in `cclu-web` to match.

## Never commit

`.env` holds real credentials and is ignored by git. This repository is public.
A credential pushed here is compromised the moment it lands, and deleting the
file afterwards does not undo it: rotate the credential instead.
