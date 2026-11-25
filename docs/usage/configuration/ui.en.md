# @h-ai/ui Configuration

<a id="h-aiui-file-configuration"></a>

[简体中文](ui.md) · [日本語](ui.ja.md)

[Configuration reference](README.en.md) · [Components and examples](../function/ui.en.md#component-catalog) · [Browser storage](../data/ui.en.md#browser-storage)

<a id="configuration-fields"></a>

## Configuration entry

Svelte mounts `@h-ai/ui`. The module has no `config/_ui.yml`, dedicated environment variables, or initialization call. The frontend build reads stylesheet and auto-import settings. Application layouts and pages supply themes, locales, guides and component options.

| Location | Reader | Effect and timing |
| --- | --- | --- |
| Frontend stylesheet, for example `src/app.css` | Tailwind CSS 4 and DaisyUI 5 | Compiles UI classes and themes. Rebuild to publish changes. The development server updates styles in place. |
| Vite or Svelte preprocessors | Svelte compiler | Optionally register `ui.autoImport()` to add component imports when templates compile. |
| Root layout, HTML shell and page components | Application and browser | Apply themes, locales and saved preferences. Pass props and callbacks to the controls. |
| `defaultLocale` in `config/_core.yml` | Host code that configures Core and selects a locale | Affects the server default when the host passes it to Core. SSR can select a locale per request. |

<a id="style-configuration"></a>

## Build styles and choose themes

Load the UI styles in the frontend stylesheet. For an application with `src/app.css`, the `@source` path is relative to that file. If the UI package is installed in the monorepo root, use the actual relative path to `@h-ai/ui/dist`. A Vite project registers `@tailwindcss/vite` first.

```css
@import 'tailwindcss';
@import '@h-ai/ui/styles/global.css';
@import '@h-ai/ui/styles/theme.css';
@source '../node_modules/@h-ai/ui/dist';
@plugin 'daisyui' {
  themes: light --default, dark;
}
```

After the root layout imports this stylesheet, `light` is the initial theme. Selecting `dark` changes the page and native form controls. Limit the choices with `ThemeSelector.themeIds` and include the listed themes in the compiled stylesheet. For mobile layouts, add `@h-ai/ui/styles/design-tokens.css` and `@h-ai/ui/styles/mobile.css` as needed. [Styles and auto-imports](../function/ui.en.md#styles) · [Theme examples](../function/ui.en.md#theme)

The Fullstack template reads `fullstack.theme.defaultTheme` and `fullstack.theme.themes` from the module options at generation time. The default is `light`. Without a list, the template supplies `light`, `dark`, `high-contrast`, `formal`, `eye-care` and `liquid-glass`. The default theme is included in the list. In a generated project, each frontend's `src/app.css` controls the compiled themes, and the shared theme store controls selectable themes and the fallback. [CLI generation](../function/cli.en.md)

<a id="runtime-preferences"></a>

## Runtime preferences

- **Theme.** Use `ui.getSavedTheme(fallback)` to read a saved theme ID and `ui.applyTheme(id)` to apply and save it. If the HTML shell needs to restore the theme before Svelte loads, use `ui.createThemeBootstrapScript(options)` with a separate storage key for its JSON preferences.
- **Locale.** In the browser, `ui.createLocaleStore(options)` checks a supported saved locale, browser preferences, then the configured fallback. With Paraglide, call the application's `setLocale` as well for application messages. On the server, wrap the render in `core.i18n.runWithLocale` or `kit.i18n.runWithLocale`.
- **Guides and components.** Call `ui.createGuide(options)` in the layout and pass props and callbacks to page components. Storage, copying, uploads and search follow the supplied options and callbacks. The host owns service addresses, authorization and persistence.

[Core locale defaults](core.en.md) · [Kit locale and request context](../function/kit.en.md#hooks) · [Integration arguments](../function/ui.en.md#call-options)
