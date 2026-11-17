# Changelog

## 0.1.0

- Initial Open VSX-compatible npm dependency links extension.
- Added configurable registry URL pattern support.
- Added parser tests for dependency sections, scoped packages, JSONC input, and URL generation.
- Added Open VSX and Visual Studio Marketplace publishing setup.
- Removed the legacy `npmDependencyLinks.registryUrl` configuration option.
- Skipped local workspace protocol dependencies when generating registry links.
