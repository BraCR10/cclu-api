# cclu-api

## About the project

The Cámara de Comercio y Empresarios de La Unión manages its affiliated
businesses through spreadsheets and informal channels. This system replaces
that with a web platform: it centralises member records, gives traceability to
membership fees, and offers affiliated businesses a digital channel for
commercial visibility and job postings.

Built as the term project for IC-7841, Proyecto de Ingeniería de Software,
Escuela de Computación, Instituto Tecnológico de Costa Rica.

## This repository

`cclu-api` is the REST API. It holds every business rule in the system and is
the only component that reaches the database. It runs on Node with Express and
persists to MongoDB Atlas through Mongoose.

The web client consumes this API over HTTP and has no other route to the data.

## Documentation

| Document                             | Contents                                          |
| ------------------------------------ | ------------------------------------------------- |
| [Setup](docs/setup.md)               | Run the API from a clean clone                    |
| [Architecture](docs/architecture.md) | Layers, module boundaries, adding a module        |
| [Conventions](docs/conventions.md)   | Versioning, code style, comments, error handling  |
| [Branching](docs/branching.md)       | Branch roles, naming, and the pull request cycle  |
| [Testing](docs/testing.md)           | What carries unit tests, and how they are written |

The requirement and architecture documents (ERS and SAD) are the source of
truth for what this system does. They are not published here; ask the project
lead for a copy.

## Repositories

| Repository | Role                                         |
| ---------- | -------------------------------------------- |
| `cclu-api` | This repository. REST API and business rules |
| `cclu-web` | Web client                                   |
