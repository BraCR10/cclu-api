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
| [Architecture](docs/architecture.md) | Layers, supporting folders, adding a module       |
| [Conventions](docs/conventions.md)   | Versioning, code style, comments, error handling  |
| [Branching](docs/branching.md)       | Branch roles, naming, and the pull request cycle  |
| [Testing](docs/testing.md)           | What carries unit tests, and how they are written |

## Prototype

The accepted Figma prototype defines the product: screens, flows, UI copy and the business rules they imply.

- [Desktop prototype](https://www.figma.com/proto/YPsVPnxVtPDJZxj2Q2NtS5/CCLU-%E2%80%94-Prototipo-de-plataforma?node-id=30-2&starting-point-node-id=30%3A2)
- [Mobile prototype](https://www.figma.com/proto/YPsVPnxVtPDJZxj2Q2NtS5/CCLU-%E2%80%94-Prototipo-de-plataforma?node-id=81-557&starting-point-node-id=81%3A557)
- [Design canvas](https://www.figma.com/design/YPsVPnxVtPDJZxj2Q2NtS5/CCLU-%E2%80%94-Prototipo-de-plataforma?node-id=5-2)

The decisions below are settled by the prototype; the API must enforce them.

### Product decisions settled by the prototype

- Member types: Empresa, Asociación, Profesional independiente. Asociación provides the same data as Empresa.
- There is no "Sector"; members are classified by economic activity only.
- A password changes only through an emailed link, never with the current password in session.
- Only the account owner changes their email, and the change is confirmed by a link sent to the new address.
- There is no membership withdrawal. An expired paid plan drops to Gratuita.
- A registration receives three answers: approved, rejected, or changes requested. Asking for changes keeps the application and names what to fix.
- Moderation only inactivates a publication, and a reason is required. There is no permanent block.
- Administrator states: Activo, Invitación pendiente, Invitación expirada, Inactivo.

### Known divergences from the prototype (to be removed in code)

- `POST /api/members/verification` still verifies a member code for a signed-in
  member or administrator.
- The activity catalog ships with a starting set of names rather than the
  municipality's patent roll, and a branch writes its district out because the
  district list is not loaded yet.

## Repositories

| Repository | Role                                         |
| ---------- | -------------------------------------------- |
| `cclu-api` | This repository. REST API and business rules |
| `cclu-web` | Web client                                   |
