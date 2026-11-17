# @h-ai/deploy Configuration

<!-- translation: partial -->

[Chinese source](deploy.md) · [Data structures](../data/deploy.en.md) · [API reference](../function/deploy.en.md)

Set deployment options in `hai.json.deploy`, and select environment overrides for each target. Configure credentials outside the public application files.

```yaml schema=@h-ai/deploy:DeployConfigSchema
provider:
  type: docker-ssh
  ssh:
    host: staging.example.com
    username: deployer
  expose:
    hostPort: 8080
```

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `environment`, `provider.type` | Optional | Select deployment environment and backend (`vercel` or `docker-ssh`). |
| `provider.token`, `provider.ssh` | See backend | Vercel access token or SSH host, user, verification and authentication settings. |
| `provider.remote`, `provider.expose` | See backend | Remote release directory and container runtime, port mapping and HTTPS configuration. |
| `services.db`, `services.cache`, `services.storage` | Optional | Optional provisioned services. Supply the provider and its credentials when enabled. |

Additional options and workflow examples are available in the [Chinese reference](deploy.md).
