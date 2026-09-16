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

Open `.env` and fill in the values:

| Variable      | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| `PORT`        | Port for the API. Defaults to 4000 if unset                   |
| `MONGODB_URI` | Connection string from Atlas, with your own user and password |

Atlas gives you the connection string under **Connect > Drivers**. Replace the
placeholder password and keep the `/cclu` database name at the end.

Then start it:

```bash
npm start
```

The API refuses to start if `MONGODB_URI` is missing and tells you which
variable it needs. That is intentional: a server running without a database is
harder to diagnose than one that never started.

## Verify

```bash
curl http://localhost:4000/health
```

A working setup returns `200` with `"database": "connected"`. A `503` with
`"database": "disconnected"` means the process started but Atlas refused or
dropped the connection, which points back to the access section above.

## Checks before pushing

```bash
npm run lint
npm run format:check
```

## Port note

`cclu-web` runs on port 3000 in development, so this API defaults to 4000. If
you change `PORT`, update `NEXT_PUBLIC_API_URL` in `cclu-web` to match.

## Never commit

`.env` holds real credentials and is ignored by git. This repository is public.
A credential pushed here is compromised the moment it lands, and deleting the
file afterwards does not undo it: rotate the credential instead.
