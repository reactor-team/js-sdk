# Contributing to the Reactor JS SDK

Thanks for your interest in contributing to the Reactor JavaScript SDK
(`@reactor-team/js-sdk`) and the `create-reactor-app` CLI.

This repository contains:

- `packages/js-sdk/` — the published `@reactor-team/js-sdk` package
- `packages/create-app/` — the published `create-reactor-app` CLI

Both packages are released under the [Apache License, Version 2.0](./LICENSE).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md).
By participating you agree to abide by its terms.

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/)
("DCO") to make explicit the licensing terms under which contributions are made.
We do **not** require a separate CLA.

Every commit must carry a `Signed-off-by` trailer that matches the commit author's
real name and a reachable e-mail address. The trailer is the contributor's
attestation that they have read and agreed to the DCO, which reads as follows:

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

### How to sign off

Add the trailer automatically with the `-s` flag:

```sh
git commit -s -m "Add example streaming hook"
```

The resulting commit message ends with:

```
Signed-off-by: Your Name <you@example.com>
```

The name and e-mail in the trailer must match those in your `git config user.name`
and `git config user.email`. Pseudonyms or anonymous contributions are not accepted.

### Forgot to sign off?

For the most recent commit:

```sh
git commit --amend --signoff
git push --force-with-lease
```

For an entire branch:

```sh
git rebase --signoff main
git push --force-with-lease
```

### Enforcement

A CI check verifies that every commit on a pull request carries a valid
`Signed-off-by` trailer. PRs without sign-off are blocked from merging until
every commit has been amended to include the trailer.

## File headers

Every TypeScript or TSX source file in `packages/js-sdk` and
`packages/create-app` must start with the following two-line header (after a
shebang, if any):

```ts
// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0
```

The `check-license-headers.sh` script enforces this in CI. Run it locally
before pushing:

```sh
./scripts/check-license-headers.sh
```

## Development workflow

```sh
pnpm install                       # bootstrap
pnpm -F @reactor-team/js-sdk build # build the SDK
pnpm -F @reactor-team/js-sdk test  # run unit + integration tests
pnpm format                        # format with Prettier
```

See each package's `README.md` for additional commands.

## Pull request guidelines

- Keep PRs focused and small. Separate refactors from feature work.
- Add or update tests for any behaviour change.
- Run `pnpm format` and `pnpm -F @reactor-team/js-sdk test` before pushing.
- Make sure every commit on the PR is signed off (`git commit -s`).
- For larger changes, open an issue or discussion first to align on the
  approach.

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Email
`security@reactor.inc` instead. We'll coordinate disclosure and a fix.
