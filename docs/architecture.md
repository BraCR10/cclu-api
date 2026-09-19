# Architecture

Layered structure required by SAD v1.0, section 4.3.2 (logical view) and
RNF-015. Where this document and the SAD disagree, the SAD wins.

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

| Layer         | May import                                | Must never                             |
| ------------- | ----------------------------------------- | -------------------------------------- |
| `routes`      | controllers                               | Contain business rules or touch models |
| `controllers` | services                                  | Build queries or know about Mongoose   |
| `services`    | models, other services in the same module | Read `request` or write `response`     |
| `models`      | nothing in this list                      | Contain business rules                 |

The controller layer is the only place that knows an HTTP request exists. A
service receives plain values and returns plain values, which is what makes it
testable without starting a server.

## Module boundaries

The system has four functional modules. Each one owns a service, and that
service is the only way into the module.

- A module's service may call other services **inside the same module** freely.
- A module's service may **never** import a service from another module
  directly. Cross-module access goes through an explicit interface agreed
  between both modules and documented here before it is written.

The rule exists because a direct import creates a dependency nobody declared
and nobody can see. When two modules need each other, that is a design
decision, not an import statement.

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

Two middlewares protect a route, and they always appear in this order.

```js
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { ROLES } = require('../config/roles');

router.get('/applications', authenticate, authorize(ROLES.ADMIN), listApplications);
```

`authenticate` reads the session cookie, verifies the signature and attaches
`request.identity` as `{ id, role }`. `authorize` reads that identity and
refuses a role it was not given.

A public route mounts neither. There is no public role: a visitor holds no
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

Members will sign in through a route of their own rather than sharing this one,
because what the answer may reveal differs. A member is told their application
is still pending once the password is right; an administrator is told nothing
either way, since confirming that an address is an administrator is half of what
someone guessing needs.

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

`GET /api/cantons` and `GET /api/sectors` are public for the same reason the
registration is. A form cannot offer a closed list without knowing what is in it.

## Deny by default

`app.js` mounts the public routes, then the gate, then everything else.

```js
app.use('/api/auth', publicAuthRoutes);
app.use('/api', authenticate, requireActiveAccount);
app.use('/api/auth', privateAuthRoutes);
```

A route registered below the gate is protected without asking for it, so
forgetting to think about access leaves a route closed rather than open. Making
one public means moving it above the gate, which is a deliberate edit a reviewer
sees in the diff.

An unknown path under `/api` answers 401 rather than 404, which also keeps the
list of routes that exist to ourselves.

## Two questions about an account

Access asks two things, and they are separate on purpose.

| Field               | Answers                       | When it changes                   |
| ------------------- | ----------------------------- | --------------------------------- |
| `applicationStatus` | Was the application accepted? | Only during the application       |
| `accountStatus`     | Does the account work today?  | Whenever an administrator says so |

A member needs an approved application and an active account. An admin has no
application, so only the account is read.

Folding the two together would mean suspending someone by writing
`applicationStatus: rechazada`, which records something that never happened and
would offer them the resubmission RF-AG-009 gives a rejected applicant.

`accountStatus` holds `activa` or `suspendida`, the same two values for every
account in the system. CA-ADM-003-03 also names giving a member their leave,
which is suspending the account and ending the membership rather than a third
state of its own.

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
