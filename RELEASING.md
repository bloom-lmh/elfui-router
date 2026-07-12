# Releasing

All user-facing changes require a changeset:

```sh
pnpm changeset
```

When the release batch is ready, run the following from `main`, review the generated
`package.json` and `CHANGELOG.md`, then commit them.

```sh
pnpm release:status
pnpm release:version
pnpm verify
git tag v<package-version>
git push origin main --tags
```

`v<package-version>` starts the trusted npm publishing workflow and creates the GitHub Release.
This repository remains in Changesets `beta` prerelease mode until the first stable release.
