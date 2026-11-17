# @h-ai/feedback

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md)

[Framework](../../README.en.md)

Collect user feedback and diagnostic evidence, notify administrators, review reports and export offline bundles. Descriptions are optional. Reports and structured evidence use a relational database; screenshots and binary attachments use private object storage. A separate telemetry service is not required.

## Quick Start

[Open the quick-start guide](../../docs/usage/function/feedback.en.md#quick-start).

## Configuration Reference

Generated projects define the application ID and feedback notification settings in `config/_feedback.yml`. At startup, the application reads the file and passes the settings object to `feedback.init(config, options)`.

See the [configuration reference](../../docs/usage/configuration/feedback.en.md) for configuration entry points, defaults, accepted values and when changes take effect.

## Features

[Browse the API list](../../docs/usage/function/feedback.en.md#api-reference) for entry points, inputs, results and examples.

## Data Structures

See the [data reference](../../docs/usage/data/feedback.en.md) for reports, evidence, background jobs, attachments, offline bundles and browser drafts.

## Development and Testing

```sh
pnpm --filter @h-ai/feedback typecheck
pnpm --filter @h-ai/feedback lint
pnpm --filter @h-ai/feedback build
pnpm --filter @h-ai/feedback test
pnpm --filter @h-ai/cli test:scaffold-gates
# After the builds above, verify the built viewer and replay in real Chromium without rebuilding dist.
node packages/cli/tests/feedback-offline-browser.mjs
```

Validate browser flows, SQLite/PG/MySQL, real S3 and SMTP, multi-instance recovery and disconnected bundle viewing separately. Build/mock success cannot replace those checks. See the [usage guide](../../docs/usage/README.en.md) for application integration and deployment.

## License

Apache-2.0
