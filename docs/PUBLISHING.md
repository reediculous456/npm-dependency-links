# Publishing

This extension can publish to Open VSX and the Visual Studio Marketplace.

## Local checks

```bash
npm install
npm run check
npm run package
```

## Open VSX

The extension is configured for the Open VSX namespace `reediculous456`.

The GitHub Actions workflow at `.github/workflows/open-vsx.yml` uses Open VSX trusted publishing through GitHub OIDC:

- GitHub permission: `id-token: write`
- Publish command: `ovsx publish --trusted-publishing`

Before using the workflow:

1. Create or verify the `reediculous456` namespace at <https://open-vsx.org>.
2. Configure an Open VSX trusted publisher for `reediculous456/npm-package-page-links`.
3. Confirm the trusted publisher is allowed to publish this extension under the `reediculous456` namespace.

## Visual Studio Marketplace

The extension is configured for the marketplace publisher `reediculous456`.

The GitHub Actions workflow at `.github/workflows/vscode-marketplace.yml` uses VS Code Marketplace trusted publishing through GitHub OIDC:

- GitHub permission: `id-token: write`
- Publish command: `vsce publish --oidc`

Before using the workflow:

1. Create or verify the `reediculous456` publisher in the Visual Studio Marketplace publisher portal.
2. Configure trusted publishing for `reediculous456/npm-package-page-links`.
3. Confirm the trusted publisher is allowed to publish this extension under the `reediculous456` publisher.

## Release workflow

Both publish workflows run when:

- A release is published.
- The workflow is run manually from GitHub Actions.
