# Architecture

How the API is layered, and what each layer may depend on.

## Layers

Dependencies only ever point downward. A layer never imports from the layer
above it.

```
routes        HTTP surface: paths, verbs, router wiring
    |
controllers   Translate HTTP to and from the service layer
    |
services      Business rules. The only layer that decides anything
    |
models        Mongoose schemas and data access
```

| Layer         | May import             | Must never                             |
| ------------- | ---------------------- | -------------------------------------- |
| `routes`      | controllers            | Contain business rules or touch models |
| `controllers` | services               | Build queries or know about Mongoose   |
| `services`    | models, other services | Read `request` or write `response`     |
| `models`      | nothing in this list   | Contain business rules                 |

The controller layer is the only place that knows an HTTP request exists. A
service receives plain values and returns plain values, which is what makes it
testable without starting a server.

## Supporting folders

Four folders sit beside the layers rather than inside the chain.

| Folder        | Holds                                                                                    | Imported by                        |
| ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| `middlewares` | Request pipeline: session, roles, origin check, rate limits, errors                      | `app.js`, routes, `authController` |
| `config`      | Fixed values and environment reading: roles, statuses, rules, error codes, mail, storage | any layer                          |
| `emails`      | The templates for each outgoing mail and the layout they share                           | `emailService` only                |
| `jobs`        | Work the API starts on a timer, such as the hourly membership run                        | `server.js` and `scripts/` only    |

`src/app.js` wires middlewares and routers together, and `src/server.js` checks
the environment, connects to the database, starts listening and starts the jobs.
A job calls services like a controller does; it holds no rule of its own.

## Services

The code is organised by layer, not by feature module. Each concern owns one
service file, named after what it decides: `memberRegistrationService`,
`applicationReviewService`, `passwordResetService`, `accountService` and so on.

A service may call another service when it needs that service's rule rather
than a copy of it. `passwordResetService` asks `accountService` and
`emailService`; `applicationReviewService` asks `memberCodeService`,
`resubmissionService`, `membershipService` and `emailService`. A rule written once in a service is
called from there, never copied into a second one.

## Worked example

The `health` module is the reference implementation. It is small on purpose and
exercises every layer:

| File                                  | Responsibility                                   |
| ------------------------------------- | ------------------------------------------------ |
| `src/routes/healthRoutes.js`          | Declares `GET /` on the health router            |
| `src/controllers/healthController.js` | Chooses the status code, serialises the response |
| `src/services/healthService.js`       | Decides what "healthy" means                     |

`healthService` reads the Mongoose connection state rather than a schema,
because there is no health entity to store. A module backed by real data adds a
`models/` file and the service imports it from there.

## Adding a module

1. Create `models/<entity>.js` with the Mongoose schema.
2. Create `services/<module>Service.js`. Business rules live here and nowhere
   else.
3. Create `controllers/<module>Controller.js`. No queries, no rules.
4. Create `routes/<module>Routes.js` exporting an `express.Router()`.
5. Mount it in `src/app.js` under the `/api` prefix:

```js
app.use('/api/<module>', <module>Routes);
```

6. Add the module's endpoints to `postman.json`, in a folder named after the
   module. See [conventions.md](conventions.md).

Domain modules mount under `/api`. `/health` sits at the root because
infrastructure checks it and it is not part of the domain.

## Authentication and authorization

The session travels in an `httpOnly` cookie that the API issues and the browser
returns on its own. No script can read it, so a cross-site scripting flaw cannot
carry the session away; the client never holds the token at all.

Two middlewares protect a route, and they always run in this order.
`authenticate` runs once, at the gate in `app.js` (see
[Deny by default](#deny-by-default)). `authorize` runs inside the router, either
on the whole router or on a single route.

```js
// src/routes/adminRoutes.js
adminRoutes.use(authorize(ROLES.ADMIN));
adminRoutes.get('/applications/pending', applicationReviewController.getPendingApplications);

// src/routes/memberRoutes.js
memberRoutes.get('/me', authorize(ROLES.MEMBER), memberProfileController.getOwnProfile);
```

`authenticate` reads the session cookie, verifies the signature and attaches
`request.identity` as `{ id, role }`. `authorize` reads that identity and
refuses a role it was not given.

A route that needs something a plan unlocks adds a third middleware after
`authorize`. It is described in [Time and access](#time-and-access).

```js
memberRoutes.post(
  '/me/publications',
  authorize(ROLES.MEMBER),
  requireEntitlement('publishInMarketplace'),
  publicationController.create,
);
```

A public route, mounted above the gate, runs neither. There is no public role: a visitor holds no
token, and a role nobody is ever issued is a value that can only ever be wrong.

Because the client cannot read the cookie, it cannot know its own role either.
`GET /api/auth/me` answers that question, and the answer comes from a verified
token rather than from one the client decoded for itself.

The token carries the identifier and the role, and nothing else. It is signed,
not encrypted, so whoever holds it can read its payload. Personal data stays in
the database, behind a request that proves who is asking.

Whether a given account may sign in at all is a rule of the module that owns it,
not of these middlewares. A member whose registration is still pending
cannot log in, and that decision belongs to the service that authenticates them;
teaching the middleware about registration states would tie every role in the
system to the member model.

## Signing in

`POST /api/auth/admin/login` answers 204 and sets the cookie. The token is never
in the body: putting it there would hand it to any script on the page, which is
the reach the cookie exists to deny.

Members sign in through a route of their own, `POST /api/auth/member/login`,
rather than sharing this one, because what the answer may reveal differs. Once
the password is right, a member is told the state of their application and an
administrator the state of their account — invited, expired or inactive. Before
it is right, neither is told anything: confirming that an address holds an
account at all is half of what someone guessing needs.

Three things protect the route, and each covers a different attack.

**Credentials are read as strings before anything is queried.** A body carrying
`{ "email": { "$ne": null } }` would otherwise become a query that matches the
first account in the collection, with no credentials at all.

**A missing account costs the same as a wrong password.** Returning early when
no account is found would answer identically but faster, and the difference in
waiting is enough to map which addresses are accounts.

**Failures are counted, successes are not**, and every one of them is logged
with the address it came from and the account it was aimed at. An attempt that
stays under the limits is invisible otherwise, and a run of them is the only
warning of an attack in progress.

Ten failures from one address in fifteen minutes stops guessing from there. The
per account limit sits at a hundred, which is not a mistake and not a number a
person will reach.

It cannot be set low, and the reason is worth stating plainly rather than
claiming a protection that does not hold. Counting by account alone means
anyone who knows an address can lock its owner out by guessing at it from
enough places, and no value avoids that: a limit tight enough to stop guessing
spread across many addresses is tight enough to be used as a weapon. What makes
guessing pointless is the cost of the hash, roughly a quarter of a second each.
The counter is the backstop, not the defence.

**Whether the address is real depends on deployment.** `TRUST_PROXY` says
whether the API answers through a proxy. Left false behind one, every caller
shares the proxy's address and therefore one bucket, and they lock each other
out. Set true without one, a caller can forge the address being counted.

## Registering

`POST /api/members` is public, since nobody has an account yet, and answers 201
with the new identifier and nothing else. The registration is pending review, so
there is nothing yet that anyone is entitled to read back.

**The document is built field by field and the request body is never spread into
it.** Each accepted field is named in the service, and anything else in the body
is not so much rejected as never looked at. The account status and the
application status come from the schema's defaults, so a registration that
arrives claiming to be approved is stored pending like any other.

That is the single most valuable thing on this route. Administrative approval is
the gate the whole system rests on, and a registration that could set its own
status would walk past it and collect a member code and a card on the way.

Anything that must be text is checked before it reaches a query, because
MongoDB reads `$` and `.` as operators and an unchecked value stops being data.
References are checked for shape first and looked up second, and the password is
read before either, so a body that was never going to be accepted costs no
lookups.

**A repeated identifier is caught by the unique index, not by looking first.**
Checking and then inserting leaves a gap two simultaneous registrations can both
pass through, so the duplicate is treated as an expected answer rather than a
failure. What comes back names nothing: saying which identifier collided would
confirm to a stranger that a particular card belongs to a member of the chamber.

**Registrations are counted per address, successes included.** A registration
that works is still a row created and a hash computed by a stranger, and the
hash is deliberately slow. Five in fifteen minutes is more than anyone signing
up once will need.

The password is refused past the 72nd byte, which is as far as bcrypt reads.
Accepting more would let someone believe the tail of their password counted for
something.

Fields that will be rendered as links are checked for their scheme here rather
than trusted to whatever displays them later.

`GET /api/cantons` and `GET /api/activities` are public for the same reason the
registration is. A form cannot offer a closed list without knowing what is in
it, and that is also why the registration needs a limit: those listings hand
anyone the references a submission has to carry.

## Plans and fees

Every member is on one of four plans: Gratuita, Lite MiPyme, Pro Pymex and
Premium Empresarial. A plan carries its monthly fee in whole colones and its
**entitlements**, the flags that say what it unlocks. Screens and services ask
those flags rather than comparing plan names. `GET /api/plans` is public,
because a visitor compares plans before having an account.

An administrator changes fees with `PATCH /api/admin/plans/fees` and a body such
as `{ "fees": { "lite": 6000 } }`:

- Every key is checked before anything is written, so one bad amount changes
  nothing.
- Gratuita always costs nothing.
- An amount equal to the current one is not a change.

Each fee is updated only if it still holds the amount the administrator saw.
If another administrator saved first, the request answers 409
`changed_meanwhile` for that fee and the whole transaction is undone.

The seed writes a fee only when it creates the plan, so seeding again never
undoes what the chamber set.

### The audit log

Each fee that moves leaves an entry in `auditentries`. The fee and its entry are
written in one transaction, because a fee that changed without a trace is what
the log exists to rule out. `GET /api/admin/plans/fee-changes` reads the log
back, newest first.

An entry records three things:

- **Action:** what happened.
- **Actor:** who did it, copied at that moment, so renaming an administrator
  does not rewrite history.
- **Subject:** what it happened to, with the fields that changed.

A change nobody made by hand, such as a plan running out overnight, is recorded
with the system as its actor: `{ role: 'system', name: 'system' }` and no
account identifier. Only that role may leave the identifier out.

| Action              | Written by                      | Subject      |
| ------------------- | ------------------------------- | ------------ |
| `plan.fee_changed`  | An administrator changing a fee | `Plan`       |
| `membership.lapsed` | The hourly membership run       | `Membership` |

Entries are only ever inserted. The model refuses every update and delete. In
production, the database user should only be granted `find` and `insert` on
this collection, which is what stops a rewrite on purpose. Other decisions the
chamber has to answer for later belong in the same collection, under an action
of their own.

## Memberships

Every approved member holds exactly one membership: the plan they are on, when
it started and, for a paid plan, when it expires. It is the current state, one
document per member under a unique index. What happened before lives in the
audit log.

- **Approval grants Gratuita.** The grant only writes when the membership is
  missing, so approving twice, seeding again or two requests racing each other
  leave the one membership that is there.
- **Reading grants it too.** `GET /api/members/me/membership` creates Gratuita
  for a member approved before memberships existed, or whose grant was cut
  short. `npm run grant-free-memberships` does the same for every approved
  member at once.
- **The answer is the effective plan**, worked out against the clock as the next
  section describes, with `validUntil`, the last day the plan is valid, and
  `lapsed`, the paid plan that ran out, until the next one is approved.

### The hourly run

`src/jobs/membershipExpiryJob.js` runs inside the API every hour, and once at
start. `npm run run-membership-expiry` runs it by hand.

1. **Expired paid plans move to Gratuita.** The update is conditional on the
   plan and the expiry it read, and it is written with its audit entry in one
   transaction. A payment approved in between is not undone, and a second run
   finds nothing left to move. The member is mailed.
2. **Plans expiring within seven days get one reminder.** The reminder is
   claimed on the membership before the mail is sent, naming the expiry, so two
   runs cannot both send it and a renewal makes the next one due. A mail that
   fails releases the claim, so the next run tries again.

The run is safe to repeat, which is why it lives in the API rather than in the
host's scheduler: a restart, a second instance or a missed hour only means it
runs again. **It decides no access.** If it stops, plans still end on time; only
the data, the audit entry and the mails wait.

## Time and access

Plans grant access by date, so a mistake here gives somebody a paid plan that
never ends. These rules close that.

**The clock decides, never stored data alone.** A paid plan holds while the
current time is before its expiry. `effectivePlan` in `entitlementService`
returns Gratuita from the expiry itself onward, whatever plan is stored, and
every reader goes through it: the middleware, the membership screen and the
public listings.

**One enforcement point.** `requireEntitlement(name)` reads the member's
effective plan on every request and answers 403 `plan_required`, with the
entitlement as `reason`, when the plan does not include it. A name that is not
an entitlement throws while the routes are built, so a misspelling stops the
server instead of granting nothing, or everything. It costs one indexed read,
and a second only when the plan has run out. The browser hides what a plan does
not include, but only the API refuses.

**Public listings filter by the same rule.** The marketplace and the job board
have no session, and the member they show is not the visitor, so the middleware
cannot guard them. When they are built, their queries keep only members whose
plan is current, so an expired plan does not keep its public reach. The
directory is not filtered this way: every plan, Gratuita included, is listed
there.

**It fails closed.** A paid plan whose expiry is missing, unreadable or further
away than the longest term plus one month counts as Gratuita.

**Only the server's clock counts.** `src/config/clock.js` is the one source of
the current time for these decisions. No date a member sends, including the date
on a payment receipt, decides an expiry. The session token carries the role and
the identifier only, so a token issued on a paid plan does not keep it alive.

### Days and time zones

The chamber counts days in Costa Rica, `America/Costa_Rica`. The zone is named,
not written as an offset, so a change to the country's rules arrives with the
time zone database. `src/config/chamberCalendar.js` is the only place that
counts days.

- **A plan is valid through the end of its last day.** `expiryFrom(approvedAt,
frequency)` adds the months on the Costa Rican calendar and returns the
  exclusive end: midnight opening the following day. Access holds while now is
  before it.
- **Months clamp.** 31 January plus a month is valid through 28 February.
- **The frequency is a closed list:** monthly, quarterly, semiannual and annual
  are 1, 3, 6 and 12 months. A number sent by anyone is never used as a term.
- **Instants are stored and sent in UTC.** Only the calendar arithmetic uses the
  zone, and it runs once, when a payment is approved.

| Event                         | Value                                |
| ----------------------------- | ------------------------------------ |
| Approved, monthly             | 17 October 2026, 15:40 in Costa Rica |
| Stored approval instant       | `2026-10-17T21:40:00Z`               |
| Last valid day (`validUntil`) | `2026-11-17`                         |
| Stored expiry (`expiresAt`)   | `2026-11-18T06:00:00Z`               |
| Access                        | while now is before the expiry       |

**Screens show the last valid day, never the expiry.** The expiry falls on the
following day, so formatting it would tell a member their plan lasts a day
longer than it does. The API sends `validUntil` as `YYYY-MM-DD`, and a value
with no time is shown from its own parts, without converting it between zones.

## Pagination

Every list that grows answers one page. The query is `?page=1&pageSize=10`, and
the answer is `{ items, page, pageSize, total, pageCount }`. The helper in
`src/config/pagination.js` reads and checks both parameters:

- Missing parameters fall back to page 1 and 10 items.
- A value that is not a whole number in range, or a size above 50, answers
  `invalid_format` naming the parameter, rather than quietly serving page 1.

Closed catalogs that feed a select, such as cantons, activities and plans, are
not paged.

## Answering a registration

A registration receives one of three answers, and all three are made through the
administrator routes, which is how decisions are taken while the admin screens
do not exist yet.

| Answer            | Application status  | What the applicant gets |
| ----------------- | ------------------- | ----------------------- |
| Approved          | `approved`          | Their member code       |
| Rejected          | `rejected`          | The reason, and a link  |
| Changes requested | `changes_requested` | The reason, what to fix |

**The update carries the expected state in its own filter**, so the read and the
write are one operation and two administrators deciding at once cannot both
succeed. An application that is not pending answers 409 with the state it is in,
which is the only reason `applicationStatus` is read back.

A rejection draws no member code. A code is the mark of belonging to the
chamber, and an applicant who was refused never belonged.

Asking for changes is the middle answer, and it is not a soft rejection: the
application is kept, the applicant is expected to send it back, and it leaves the
pending list for as long as that takes. The reason is required — an applicant
told to fix something and not told what has nowhere to look — and every field the
chamber names carries its own reason, which is the pair the correction screen
shows. Both are restricted to the list the correction form is able to show;
naming anything else would send them looking for a field that is not there.

An approval also grants the member Gratuita (see [Memberships](#memberships)).

**Every decision is written before the message is attempted.** A mail server that
is down must not undo a decision that already stands; the caller learns the
notice did not go out and says so.

### The link back

A rejection and a request for changes issue the same token, so there is one way
back in rather than two. Only the digest is stored, the token is 256 random bits
hashed fast enough to be looked up by index, and it is spent the moment it is
used: the application returns to pending review and the digest goes with it.

What the link opens is the correction screen: the type of applicant, the
identification, the business and the way to reach it, read against the same rules
the registration answers to, so a value nobody could have registered cannot be
corrected in either. Everything else the registration carries is preserved rather
than corrected, which is why none of it is read here — the address and the
password are named by their own flows, and the rest is what the applicant
already got right.

Changing what the applicant _is_ means the identification type has to go with
it, which is the one rule the corrections share wholesale with the registration:
the pairing is imported from it rather than written a second time. The identity
that does not go with the chosen type is cleared, because a person is not a
company and a company has no name of its own.

The document number is unique across members, so a correction that typed somebody
else's is refused in the same words a registration uses for an address that is
already taken. Naming the member who holds it would turn a link handed to one
applicant into a way of asking who else is affiliated.

## What a refusal may say

A member is told their application is pending; an administrator is told their
account is invited, expired or inactive. Each says what the person has to do
about it, and either is only said once the password was right. The difference in
vocabulary is not inconsistency, it is the reason there are two routes.

Saying "your application is pending" is useful to the person waiting and useless
to nobody else, right up until it can be obtained without knowing the password.
Then the form becomes a way to ask the chamber who is affiliated with it, one
address at a time.

The order is what resolves it.

1. The password is answered first, and on its own.
2. Wrong password, or an address that is not an account: one message, the same
   for both.
3. Only once the password was right is the state of the registration explained.

Someone who guessed the password already proved they own the account, so telling
them costs nothing. Someone trying addresses learns the same thing every time.

The refusal carries the state as its `code`, repeated in `reason`, so a screen
can say the right thing in its own words without matching on English text. It
is only ever present on the 403, which is to say only after the password was
correct.

## Deny by default

`app.js` mounts the public routes, then the gate, then everything else.

```js
app.use('/api/auth', publicAuthRoutes);
app.use('/api', publicRoutes);

app.use('/api', authenticate, requireActiveAccount);

app.use('/api/auth', privateAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/members', memberRoutes);
```

A route registered below the gate is protected without asking for it, so
forgetting to think about access leaves a route closed rather than open. Making
one public means moving it above the gate, which is a deliberate edit a reviewer
sees in the diff.

Without a session, an unknown path under `/api` answers 401 rather than 404,
which also keeps the list of routes that exist to ourselves.

## Two questions about an account

Access asks two things, and they are separate on purpose.

| Field               | Answers                       | When it changes                   |
| ------------------- | ----------------------------- | --------------------------------- |
| `applicationStatus` | Was the application accepted? | Only during the application       |
| `accountStatus`     | Does the account work today?  | Whenever an administrator says so |

A member needs an approved application and an active account. An admin has no
application, so only the account is read.

Folding the two together would mean suspending someone by writing
`applicationStatus: rejected`, which records something that never happened and
would offer them the resubmission a rejected applicant is given.

`accountStatus` holds `active` or `suspended`, the same two values for every
account in the system. They are defined once, in `src/config/accountStatus.js`,
and both `Member` and `Admin` read them from there.

`authenticate` proves a token is genuine; it cannot know whether the account
behind it still works, because a token is a photograph taken at sign in and
nothing rechecks it afterwards. `requireActiveAccount` reads the account on each
request, which costs one indexed lookup and is what makes a suspension take
effect immediately instead of whenever the token happens to expire.

## Cross origin requests and CSRF

The browser loads the interface from one origin and calls the API on another, so
every call is cross origin. `WEB_ORIGIN` names the single origin allowed to send
credentials. A wildcard is not an option: a response that allows any origin
cannot carry a cookie.

A cookie the browser attaches by itself is a cookie an attacker's page can make
it attach too, which is what cross-site request forgery is. Two things stop it.

`SameSite=Lax` keeps the cookie off requests that arrive from another site. This
holds as long as the interface and the API stay on the same registrable domain,
which is why they are deployed as subdomains of one domain.

`verifyOrigin` then refuses any state changing request whose `Origin` names
somewhere else. A browser always sends that header on such a request, so a
forged page cannot avoid it. A request with no `Origin` at all did not come from
a browser and is allowed through, which is what keeps `postman.json` usable.

## Presentation boundary

`cclu-web` reaches this API over HTTP and by no other means. It holds no
database driver and no direct connection. Keeping the web client free of data
access dependencies is what enforces this, not convention alone.
