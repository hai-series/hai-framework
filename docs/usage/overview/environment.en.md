# Development, deployment and native tooling

[Chapter overview](README.en.md) · [Create and run a project](../getting-started/create.en.md)

Install the tools needed for the artifact or check you plan to run. Engine discovery uses tools that are already installed and running.

<a id="development-tools"></a>

## Local development

Check the application's `engines` and `packageManager`. This repository requires Node `^22.23.4 || ^24.22.1 || ^26.12.1` and pnpm 12.11.2. Install Git and make sure the project can reach its package registry. Use `pnpm.cmd` in Windows PowerShell.

Check the versions with `node --version`, `pnpm --version`, and `hai --version`. The CLI version identifies the installed tool, the app's `package.json` version identifies the application release, and the build ID identifies a particular artifact or deployment.

<a id="browser-tests"></a>

## Browser verification

Install the browser required by the project's Playwright configuration. Start the database, cache, LDAP service, or other fixtures the selected tests actually use. Keep test data isolated and retain redacted evidence when a test fails. Record skipped checks and missing prerequisites in the verification result.

<a id="container-deployment"></a>

## Containers and Linux deployments

Install and start Podman or Docker on the build machine. On Windows, use Linux containers. Fully offline builds need base images, a pnpm dependency cache, and native packages for the target ABI, architecture, and libc.

The machine uploading files needs `tar`, `ssh`, and `scp`. Linux and macOS runners also need `sh` and `awk`. Windows runners need PowerShell 5 or later and OpenSSH. The Linux target needs a container engine, Compose with `--pull never`, `sh`, `tar`, `sha256sum`, `awk`, `curl`, and util-linux `flock`. Check filesystem locking and directory and container permissions. Offline deployment runs without Node or pnpm on the target.

Prepare HTTPS, certificates, DNS, firewall rules, shared services, backups, and a maintenance window for production. See the [deployment settings](../configuration/delivery.md).

<a id="native-tools"></a>

## Native packages

For Android, prepare the SDK, JDK, platform project, and signing credentials. For iOS, prepare macOS, Xcode, and signing. For desktop, install Rust, Tauri prerequisites, and the SDK for the target OS. Run the native build after syncing assets with `cap:sync`. Verify permissions, secure storage, and notifications on the device.
