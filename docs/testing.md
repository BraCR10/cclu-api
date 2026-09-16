# Testing

Every change that carries a decision carries a unit test for it, written in the
same commit.

## Running

```bash
npm test
```

The runner is `node:test`, built into Node. There is nothing to install.

The command exits with a non-zero status when a test fails. Continuous
integration reads that status, not the output, so a runner that printed a
failure and exited zero would let broken code merge.

## What must have unit tests

| Layer         | Tested                                    |
| ------------- | ----------------------------------------- |
| `services`    | **Yes.** Business rules live here         |
| `middlewares` | **Yes** when they decide something        |
| `controllers` | Only when they choose between responses   |
| `routes`      | No. They declare paths and delegate       |
| `models`      | No. Schema definitions carry no decisions |
| `config`      | No                                        |

The question to ask is not "which layer is this" but **"does this code make a
decision?"** A function that maps a value, picks a status code, validates an
input or branches on a rule is a decision. A function that forwards a call to
the next layer is not.

## What a unit test is here

A unit test exercises one unit in isolation:

- **No database.** If a test needs Mongo, it is not a unit test.
- **No network.**
- **No dependency on another test**, and no dependency on the order tests run
  in. Each one sets up what it needs.

This is what makes a unit testable in the first place. When a function reaches
out for its own dependencies, it cannot be tested without them, so pass them in
instead:

```js
function getHealthStatus(readyState = mongoose.connection.readyState) {
```

The default keeps the caller unchanged; the parameter lets a test supply any
state it wants without a connection.

## Where tests live and how they are named

- Tests live in `tests/`, in a tree that **mirrors `src/`**.
  `src/services/healthService.js` is tested by
  `tests/services/healthService.test.js`.
- `src/` holds production code only. What ships and what verifies it stay in
  separate trees, so reading `src/` shows the application and nothing else.
- The test name is a sentence describing **the behaviour**, not the function:

```js
test('getHealthStatus reports degraded for every state other than connected', ...)
```

Names matter beyond readability. The test report required by OR-002 is built by
reading the suite, so a test named `works correctly` contributes nothing to it.

## What is not worth testing

- Configuration files.
- Accessors that only return a stored value.
- Code with no branches and no rules.

A test that restates the implementation line by line verifies nothing: it fails
whenever the code changes and passes whenever the code is wrong in the same way
the test is wrong.
