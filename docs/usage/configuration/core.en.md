# @h-ai/core Configuration

<a id="core-settings"></a>

[简体中文](core.md) · [日本語](core.ja.md) · [Configuration API](../function/core.en.md#config-api)

## Configuration entry

At Node startup, call `core.init({ configDir: './config' })` to read `config/_core.yml`. The validated settings are available under the name `core`. For example, `HAI_CORE_NAME` overrides the name in YAML.

## Configuration reference

### Application settings

| Setting           | Default                              | Effect                                                                                                                          |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `"hai Admin"`                        | Application name that page and startup code can display                                                                         |
| `version`         | `"0.1.0"`                            | Application version metadata. The package version used by the build is set in `package.json`                                    |
| `env`             | `"development"`                      | Environment metadata. Also accepts `production`, `test` and `staging`. Set `NODE_ENV` separately at process startup             |
| `defaultLocale`   | `"zh-CN"`                            | Pass it to `core.i18n.setGlobalLocale()` to select the Core message language                                                    |
| `logging`         | Omit to keep current logger settings | Write an object to apply its settings. In a new process the starting level and format are `info` and `pretty`                   |
| `logging.level`   | `"info"`                             | Minimum level. Choose `trace`, `debug`, `info`, `warn`, `error` or `fatal`                                                      |
| `logging.format`  | `"pretty"`                           | Terminal-friendly output. Node uses JSON if `pino-pretty` is unavailable. Explicitly choose `json` for line-oriented collection |
| `logging.context` | Optional                             | Fixed fields on each log record, such as the service name                                                                       |
| `logging.redact`  | `[]`                                 | Additional field paths to hide. A single `*` matches one level. Core always masks known credential fields                       |

<a id="request-access"></a>

### HTTP request access

The HTTP service applies the policy. Put it under `http.access` in `config/_serv.yml` for Serv or under the top-level `access` in `config/_kit.yml` for SvelteKit. Both use Core to check the policy when creating the HTTP application or request handler. The `_core.yml` validator rejects `access` and `global`.

Omit `access` or set it to `false` to disable this policy. To enable it, write `global` and/or `rules` inside `access`. You can instead use `access.file` to point to a YAML file with `global` or `rules` at the top level. The file is read at startup, has a 1 MiB limit and is resolved relative to the server's working directory.

| Field                         | Default                              | Effect                                                                                                                                                                          |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global`                      | Optional                             | Applies its conditions to every request handled by the service                                                                                                                  |
| `rules`                       | `[]`                                 | Up to 1,000 rules. Requests must pass the global conditions and every matching rule                                                                                             |
| `allowIps`, `denyIps`         | `[]`                                 | Up to 1,000 entries for each list. IPv4, IPv6 or CIDR ranges in `global` or an individual rule. A nonempty allowlist restricts access to listed addresses. Denies take priority                                    |
| `timezone`                    | `"UTC"`                              | IANA time zone used with the server clock                                                                                                                                       |
| `windows`                     | `[]`                                 | Up to 100 windows. Allowed time windows from `start` (inclusive) to `end` (exclusive), in `HH:mm`. `days` uses 1 for Monday and 7 for Sunday. Use the start day for an overnight window            |
| `rules[].id`, `rules[].paths` | Required                             | Unique rule ID (1–64 characters) and 1–100 paths (1–2,048 characters each), including the deployed prefix. A trailing `/**` also matches descendants                                                                   |
| `rules[].methods`             | `[]`                                 | An empty list covers every HTTP method. List `HEAD` explicitly if the rule otherwise lists only `GET`                                                                           |
| `rules[].encryption`          | Use the service's transport settings | `required` requires Hai request encryption and `disabled` uses the ordinary HTTP request format. Conflicting modes for the same path and method prevent creation of the checker |

## Configuration examples

### Application logging

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
defaultLocale: en-US
logging:
  level: warn
  format: json
  redact: [customer.email]
```

This example writes warnings and higher-severity records as JSON and masks the email. Leaving out `format` selects `pretty`. Passing `logging` directly to `core.init()` takes precedence over the logging settings in YAML. After changing the file, restart the application or explicitly apply the new logger settings. `core.config.reload()` updates the stored configuration.

### HTTP policy examples

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    global:
      allowIps: [192.0.2.0/24]
      denyIps: [192.0.2.7]
    rules:
      - id: orders-hours
        paths: [/api/v1/orders/**]
        timezone: Asia/Shanghai
        windows:
          - days: [1, 2, 3, 4, 5]
            start: '09:00'
            end: '18:00'
```

`global` checks every request handled by the service, including health checks. In the example, `192.0.2.7` is denied even though it belongs to the allowed subnet. A request for an order from `192.0.2.10` must also pass the weekday time rule. At 18:00 the window has ended. For SvelteKit, move the entire `access` block to the top level of `_kit.yml`.

#### Restrict SvelteKit requests to business hours

Set the time window at the top level of `config/_kit.yml`. This example allows requests reaching the SvelteKit handler from 09:00 up to 18:00 on weekdays in Shanghai. To restrict only an API, put the window in a path rule so it does not cover the sign-in route.

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  global:
    timezone: Asia/Shanghai
    windows:
      - days: [1, 2, 3, 4, 5]
        start: '09:00'
        end: '18:00'
```

#### Keep the policy in a separate file

Save this file as `config/security/request-access.yml`.

```yaml schema=@h-ai/core:RequestAccessPolicySchema
global:
  denyIps: [192.0.2.7]
```

In Serv, reference it in `config/_serv.yml`.

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    file: ./config/security/request-access.yml
```

In SvelteKit, reference it in `config/_kit.yml`.

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  file: ./config/security/request-access.yml
```

Put all rules in the referenced file when `file` is set. On another Node HTTP framework, call `core.access.createRequestCheck({ file: './config/security/request-access.yml' })` at startup. Pass the request path, method, and trusted client IP to the returned checker.

Restart the backend after editing the policy. For deployments with reverse proxies or a separate rule file, see the [request access guide in Chinese](request-access.md).
