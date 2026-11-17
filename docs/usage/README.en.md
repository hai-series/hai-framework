# hai-framework usage guide

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

Start with the [English creation-to-delivery workflow](getting-started/workflow.en.md) to create, run and build an app. Use the module references to look up an API or setting as you work. On the documentation site, chapters awaiting translation display the Chinese text with a notice and a link to the original.

For Core, see the [API reference](function/core.en.md), [configuration settings](configuration/core.en.md) and [data reference](data/core.en.md).

## Chapters

1. [Understand the framework](overview/README.en.md): capabilities, boundaries, environment requirements and [six reading paths](overview/reading-paths.en.md).
2. [Create your first deliverable](getting-started/workflow.en.md): create, run, develop, build and upgrade.
3. [Develop business capabilities](development/README.en.md): APIs/data, authentication/UI, AI and integrations.
4. [Manage configuration by domain](configuration/README.en.md): purpose, defaults, value differences, complete examples and actual result images.
5. [Deploy and operate](operations/README.en.md): full/incremental updates, recovery conditions, feedback and troubleshooting.
6. [Maintain, review security and validate](governance/README.en.md): public contracts, synchronized documentation and evidence boundaries.
7. [Module data structures](data/README.en.md). Find tables, columns, cache keys and retention by package.
8. [Module features](function/README.en.md). Find public entry points, usage examples and operational notes by package.

Package READMEs link to these references. Use the configuration reference for individual settings and the domain guides for tasks that involve multiple packages. GitHub Pages builds from these Markdown files and `navigation.json`.

Query `pnpm view @h-ai/cli@latest version` or consult [npm](https://www.npmjs.com/package/@h-ai/cli?activeTab=versions) for the current release. Pin the returned version for reproducible installations. Main is not proof of registry availability. [Verification](governance/verification.md) distinguishes actual runs from environment-dependent work.
