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

Domain modules mount under `/api`. `/health` sits at the root because
infrastructure checks it and it is not part of the domain.

## Presentation boundary

`cclu-web` reaches this API over HTTP and by no other means. It holds no
database driver and no direct connection. Keeping the web client free of data
access dependencies is what enforces this, not convention alone.
