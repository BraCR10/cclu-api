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

| Variable                  | Purpose                                                                                         | Example       |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------- |
| `NODE_ENV`                | `production` on any deployed server, which then also requires buckets, mail and a secure cookie | `development` |
| `PORT`                    | Port for the API. Defaults to 4000 if unset                                                     | `4000`        |
| `TRUST_PROXY`             | `true` only when the API answers through a reverse proxy                                        | `false`       |
| `REMEMBERED_SESSION_DAYS` | How long a session lasts when somebody asks to stay signed in. Defaults to 30                   | `30`          |

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

### Creating the buckets

The API never creates a bucket; whoever holds the chamber's AWS account creates
them once per environment, in the S3 console, region `us-east-1`:

| Environment | Public bucket         | Private bucket         |
| ----------- | --------------------- | ---------------------- |
| Production  | `cclu-prod-public`    | `cclu-prod-private`    |
| Staging     | `cclu-staging-public` | `cclu-staging-private` |

Bucket names are global; if one is taken, add a word such as `launion`.

1. **Private bucket.** Leave _Block all public access_ on, Object Ownership on
   _Bucket owner enforced_ and default encryption (SSE-S3) on. Nothing else.
2. **Public bucket.** Turn _Block all public access_ off, then under
   _Permissions → Bucket policy_ allow reading objects and nothing else:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::cclu-prod-public/*"
       }
     ]
   }
   ```

3. **A user for the API.** In IAM, create a user such as `cclu-api` whose only
   permissions are on these two buckets, then create an access key for it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": ["arn:aws:s3:::cclu-prod-public/*", "arn:aws:s3:::cclu-prod-private/*"]
       }
     ]
   }
   ```

4. **The environment.** On the server, never in the repository:
   `S3_ENDPOINT=https://s3.us-east-1.amazonaws.com`, `S3_REGION=us-east-1`,
   the two bucket names, the key and its secret, and
   `S3_FORCE_PATH_STYLE=false`.

Atlas gives you the connection string under **Connect > Drivers**. Replace the
placeholder password and keep the `/cclu` database name at the end.

## First run

An empty database has nothing to choose from and nobody to sign in as. Run
these two once, after `.env` is filled in:

```bash
npm run reset-database
npm run create-admin -- <email> "<name>"
```

`reset-database` deletes everything in the database named by `MONGODB_URI`,
rebuilds the indexes and loads the cantons, the activities and the four plans
from `scripts/data/`, plus the chamber settings with a seven-day expiry
notice. It prints the database and host first and asks you to type the
database name; `--confirm <name>` answers that without the prompt. Files already uploaded to
storage are not removed. The activities it ships with are a starting set: the
official one is the municipality's patent roll.

`create-admin` invites an administrator, since the panel has no way to sign up.
It mails a link to `/invitation/<token>` where the person chooses their own
password, so it needs the mail variables and `WEB_ORIGIN`. The link is valid for
seven days. Running it again for an invitation that was not accepted sends a
new link. It refuses an address that already belongs to a member or to an
active administrator.

Then start it:

```bash
npm start
```

Once connected, the API runs the membership job at start and every hour after:
it moves expired paid plans to Gratuita and sends the reminders within the expiry notice. Access never
waits for it; see [Time and access](architecture.md#time-and-access).

The API refuses to start if a startup variable is missing and lists every one
it needs at once. That is intentional: a server running without a database is
harder to diagnose than one that never started. `NODE_ENV` must be
`development`, `test` or `production` (unset reads as `development`), and with
`production` it also needs the six `S3_*` variables, the five mail variables and
`COOKIE_SECURE=true`. The check lives in `src/config/environment.js`.

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
