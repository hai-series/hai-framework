# Compile, build images and package native apps

<!-- translation: partial -->

[First delivery](workflow.en.md) · [Previous: develop](develop.en.md) · [Next: deploy](../operations/deployment.md) · [Chinese original](build.md)

Choose the target for the artifact you plan to ship. Run these commands from the generated project root.

```sh
pnpm build
pnpm build --target image --concurrency 2
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
pnpm build --target app --platform android --runtime auto --debug
pnpm build --target app --platform android --runtime auto
```

The first command compiles the source. Image builds package `serv` and/or `web`. The desktop command builds a Windows x64 release. The two Android commands build a debug installer and a release installer respectively. To build one image at a time, use `--concurrency 1`. Use `cap:sync` to synchronize web assets into the native project before packaging. Build and deploy read separate sections of [`hai.json`](../configuration/delivery.md#配置入口和角色).

Choose `--image-source cn --npm-source cn` to use the configured mirrors, or set `--proxy-mode` to `inherit`, `system`, `custom`, or `none`. The initial interactive selection is saved for the project. `--yes` reuses it. [Download sources and proxies](../configuration/delivery.md#下载源和代理)

<a id="browser-startup"></a>

## Browser startup check

A standalone script in the page's HTML checks the browser before the main app loads. A browser known to be below the minimum sees a localized update page with its detected version and a link to the vendor. After updating, revisit the site. Browsers whose version cannot be detected still attempt startup.

| Browser or platform | Minimum |
| --- | --- |
| Chrome and Edge | 111 |
| Firefox | 114 |
| Safari | 16.4 |
| iOS and iPadOS browsers | OS 16.4 |

New admin, website, h5, and fullstack Web projects include the check. To add it to an existing app, copy [startup.js and its companion files](../../../packages/cli/templates/shared/browser-check/) to `static/_hai/browser-check/` for SvelteKit or `public/_hai/browser-check/` for Vite. Add the appropriate tag before the main scripts and styles.

```html
<!-- SvelteKit src/app.html -->
<script id="hai-browser-startup" src="%sveltekit.assets%/_hai/browser-check/startup.js"></script>
<!-- Vite Web index.html -->
<script id="hai-browser-startup" src="./_hai/browser-check/startup.js"></script>
```

Deploy all three files under the same site path. Test a simulated old browser while blocking the main app's JavaScript and CSS, then verify normal startup on a supported browser.

<a id="verify-artifact"></a>

## Identify and verify the artifact

The root `package.json` supplies the project name and version. An image batch goes under `.hai/build/docker/build-<project>-image-<buildId>/`. The manifest records roles, platform, the checksum, and whether the batch is partial. A successful export advances the local `latest` pointer. Rebuilding the same version creates a different build ID.

```sh
hai build --target image --json
```

On success the CLI emits one JSON line on stdout, with `schemaVersion: 1`, absolute `artifactDir` and `manifestPath`. Progress and failures go to stderr. Use `manifest.images[].file` to locate archives within that directory. Keep each concurrent task's own result and pass its `artifactDir` to `hai deploy --artifact-dir`. Use `readDeploymentArtifact(artifactDir)` to verify archives and SHA-256 checksums.

`manifest.source` reports the observed Git commit and whether the project and build inputs had changes. A commit the CLI could not identify is `unknown`, and an incomplete dirty check gives `null`. Use a clean checkout pinned to the intended commit for traceable releases. Check `manifest.images[].platform` against the target architecture. Source builds and image builds keep runtime credentials separate. Check the target requirements before deploying a partial batch.

<a id="native-builds"></a>

## Package a native app

Use `--runtime auto`, `docker`, or `podman` to build Android in a container. A first debug build can generate an Android shell in the work copy. Release builds need the existing Android project and signing variables `HAI_ANDROID_KEYSTORE`, `HAI_ANDROID_STORE_PASSWORD`, `HAI_ANDROID_KEY_ALIAS`, and `HAI_ANDROID_KEY_PASSWORD`. Inject passwords through the build process or CI. Use macOS and Xcode to sign and export iOS, and Tauri on the appropriate system for desktop.

The default is a release. `--debug` selects a debug build. Each platform and build type writes its own batch and `latest` under `.hai/build/app/` or `.hai/build/desktop/`. Prepare base images and dependency caches before building offline.

Core's `name` sets the Capacitor display name and the Tauri product name and main window title. The build resolves `HAI_CORE_NAME` with the same precedence as other Core settings. Fullstack projects read the server workspace's `_core.yml` and project-root environment files. Existing native projects also need their platform display-name setting updated and a new installer built. Native package naming, environment selection, per-window overrides, and the handling of existing artifacts are covered in the [Chinese original](build.md#原生应用名称).

Before delivery, check the new installer on the target device and verify the image checksums, user flow, and persistent data for a server release.
