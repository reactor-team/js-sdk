# Staging and launch for the HappyOyster example

This example lives in `reactor-team/js-sdk`, which is **public**. Nothing about
this example may reach the public repo before the coordinated launch: no push,
no PR, no branch, no tag. An `examples/` merge is visible to
`create-reactor-app` users the instant it hits public `main` (the CLI lists the
directory live over the GitHub API), and an npm publish of the typed package is
likewise a public signal. Both wait for the webapp reveal.

Pre-launch work happens in a private mirror; the public push is a single manual
step at T-0.

## Running before the typed package publishes

The example depends on `@reactor-models/happy-oyster` at a published range
(`^0.1.0`), but that package is not on npm yet (it publishes with the launch,
REA-4015), so `pnpm install` will not resolve as committed. To develop or verify
before the publish, build the typed SDK from its source and link it locally,
without committing the link:

```bash
# 1. Build the typed SDK from its source (the sdk/ package in happy-oyster-demo).
cp -R <path-to>/happy-oyster-demo/sdk examples/happy-oyster/.local-typed-sdk   # .local-typed-sdk is gitignored
# set .local-typed-sdk/package.json "name" to "@reactor-models/happy-oyster"
( cd examples/happy-oyster/.local-typed-sdk && pnpm install && pnpm build )

# 2. Point the dependency at that build (TEMPORARY, uncommitted):
#    in examples/happy-oyster/package.json, set
#      "@reactor-models/happy-oyster": "file:.local-typed-sdk"
( cd examples/happy-oyster && pnpm install )

# 3. Verify.
( cd examples/happy-oyster && pnpm build )

# 4. Revert the dependency to "^0.1.0" before committing. Never commit the link.
```

The committed `package.json` always pins the published range. `pnpm-lock.yaml`
is intentionally absent until the package publishes; regenerate and commit it at
T-0, or let it regenerate on first install.

REA-4015 landed the package as `@reactor-models/happy-oyster` (imported at
`@reactor-models/happy-oyster` and `@reactor-models/happy-oyster/react`). The name
is locked; nothing else changes. The npm publish itself flips on with the
distribution switch in `reactor-team/happy-oyster-demo` (happy-oyster-demo#8),
merged at T-1h per that repo's runbook — merging it **is** the publish action.

## Private staging mirror: `reactor-team/js-sdk-internal`

A standing **private** mirror of the public repo. Pre-launch branches and PRs
live here with real CI; the public repo stays untouched until T-0. Set up once:

```bash
# Create the private repo (done).
gh repo create reactor-team/js-sdk-internal --private

# Seed it as an exact mirror of the public repo (read public, write internal).
git clone --bare https://github.com/reactor-team/js-sdk.git /tmp/js-sdk-mirror.git
git -C /tmp/js-sdk-mirror.git push --mirror https://github.com/reactor-team/js-sdk-internal.git
```

Internal cannot publish to npm even if a workflow runs there: `publish.yml`
triggers only on `release: published`, and npm's trusted publisher / provenance
is bound to `reactor-team/js-sdk`, not the mirror, and the mirror holds no npm
token. As defense in depth you may also gate the publish jobs with
`if: github.repository == 'reactor-team/js-sdk'`.

### Optional one-way sync (public to internal)

To keep the mirror current, a scheduled `workflow_dispatch` + `cron` job can
fetch public `main` and push it to internal `main`. One direction only, public
to internal, never the reverse. Two constraints make it safe:

- Push **fast-forward only** so it can never clobber internal history.
- Keep the workflow off `main` (a dedicated default/CI branch), or keep internal
  `main` a pure mirror. A sync that force-pushes `main` while the workflow lives
  on `main` would delete itself. This is why it is not auto-enabled here; wire it
  up deliberately.

## The T-0 cutover (public, at reveal)

Run only after the webapp reveal is live and the typed package is published:

```bash
# From a clean checkout of the PUBLIC repo, with the reviewed branch:
git push origin ho/example          # the FIRST and ONLY public push
gh pr create --repo reactor-team/js-sdk --base main --head ho/example \
  --title "feat(happy-oyster): add HappyOyster example app"

# Merge only after:
#   - the webapp reveal is live, and
#   - @reactor-models/happy-oyster is published to npm (so the committed
#     ^0.1.0 range resolves for anyone who clones the example).

# After merge, confirm discovery + install end to end:
npx create-reactor-app ho-smoke --model happy-oyster
( cd ho-smoke && cp .env.example .env.local && pnpm install && pnpm build )
```

`create-reactor-app` resolves `--model happy-oyster` to this folder by a live
GitHub directory listing (no CLI release needed), so the merge is the moment it
goes live. Keep the model's `about` status private until the flip regardless.
