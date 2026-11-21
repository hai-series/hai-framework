# @h-ai/deploy Configuration

<!-- translation: partial -->

[Chinese source](deploy.md) · [Data structures](../data/deploy.en.md) · [API reference](../function/deploy.en.md)

Set deployment options in `hai.json.deploy`, and select environment overrides for each target. Configure credentials outside the public application files.

## Configuration examples

```yaml schema=@h-ai/deploy:DeployConfigSchema
provider:
  type: docker-ssh
  ssh:
    host: staging.example.com
    username: deployer
  expose:
    hostPort: 8080
```

### Expose container port 3000 on host port 8080

This shows the outer structure of the root `hai.json`. The target host needs a container runtime and the deployment account needs permission to use it. Supply the SSH private key through the deployment machine’s private environment. `expose` sets the entry port; it does not bypass application authentication.

```json
{
  "deploy": {
    "environment": "staging",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "staging.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

### Select a deployment environment file

With `environment: prod`, the CLI loads the prod environment layers, including private values from `.env.prod.local`. The host and account are examples. Check the actual target before running; changing the environment name does not correct a wrong host.

```json
{
  "deploy": {
    "environment": "prod",
    "provider": {
      "type": "docker-ssh",
      "ssh": { "host": "production.example.com", "username": "deployer" },
      "expose": { "hostPort": 8080 }
    }
  }
}
```

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `environment`, `provider.type` | Optional | Select deployment environment and backend (`vercel` or `docker-ssh`). |

<a id="provider"></a>

## Deployment providers

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `provider.token`, `provider.ssh` | See backend | Vercel access token or SSH host, user, verification and authentication settings. |
| `provider.remote`, `provider.expose` | See backend | Remote release directory and container runtime, port mapping and HTTPS configuration. |

<a id="services"></a>

## Services

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `services.db`, `services.cache`, `services.storage` | Optional | Optional provisioned services. Supply the provider and its credentials when enabled. |

Still untranslated: the full provider, HTTPS, SSH and middleware options. Read the [Chinese source section](deploy.md#configuration-fields).
