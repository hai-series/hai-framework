# Upgrade an application's framework dependencies

[First delivery](workflow.en.md) · [Maintenance and verification](../governance/README.en.md)

Plan changes to dependencies, public API calls, settings, and complete Skills together. Check that the exact target version exists in the intended registry for every package the app uses.

<a id="compare-release"></a>

## Compare the releases

In the application directory, use [hai-framework-sync](../../../packages/cli/templates/skills/hai-framework-sync/SKILL.md) to compare the current installation with the published target. It checks registry tags, package files, Node requirements, the dependency catalog, and the lockfile. Record incomplete releases or network failures. Run a read-only comparison first if you need to choose between migration options.

<a id="migrate-app"></a>

## Migrate and retain application rules

Use the target version's public APIs where they meet the requirement. After updating callers, remove duplicate code and dependencies only after checking references. Keep application-specific business rules. If the target requires a patch or changes a config contract or workflow, review the proposed change and recovery conditions before implementation.

Use `hai init` to fill missing AI entry files or Skills. Merge existing Skills from the previous template, the app's edits, and the new template. Keep the accepted requirements and task records.

<a id="data-compatibility"></a>

## Verify data and session compatibility

Back up the database, session cache, objects, volumes, and managed credentials. Initialize the target release against a database copy in an isolated environment. Check sign-in and persistent records. Rebuild the image with the current CLI and use the application's procedure for data recovery during a [rollback](../configuration/delivery.md#失败恢复与发布后回滚).

<a id="verify-upgrade"></a>

## Verify the updated delivery

Run type checks, lint, builds, tests, and E2E for sign-in, data, pages, and the changed flows. Rebuild the affected images and installers, deploy, verify the actual running version, and exercise the affected flows.
