# @h-ai/deploy Configuration

<!-- translation: partial -->

[Chinese source](deploy.md) · [Data structures](../data/deploy.en.md) · [API reference](../function/deploy.en.md)

## Configuration entry

Set deployment options in `hai.json.deploy`, and select environment overrides for each target. Configure credentials outside the public application files.

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `environment`, `provider.type` | Optional | Select deployment environment and backend (`vercel` or `docker-ssh`). |

<a id="provider"></a>

### Deployment providers

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `provider.token`, `provider.ssh` | See backend | Vercel access token or SSH host, user, verification and authentication settings. |
| `provider.remote`, `provider.expose` | See backend | Remote release directory and container runtime, port mapping and HTTPS configuration. |
| `provider.remote.dockerMode` | Optional | `rootless` requires `runtime: docker` and selects the SSH user’s local socket. Omit it or use `default` for the regular local engine rules. |
| `provider.expose.hostAddress`, `provider.expose.publicUrl` | Set together for an external gateway | Bind to a specific host IPv4/IPv6 address and register the public HTTPS origin. The artifact supplies the application path. Select either this pair or Hai-managed `provider.expose.https`. |

<a id="services"></a>

### Services

| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `services.db`, `services.cache`, `services.storage` | Optional | Optional provisioned services. Supply the provider and its credentials when enabled. |

Still untranslated: the full provider, HTTPS, SSH and middleware options. Read the [Chinese source section](deploy.md#configuration-fields).

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

<a id="rootless-docker-external-https"></a>

### Deploy to Rootless Docker behind an existing HTTPS gateway

Visitors open `https://app.example.com/`. A gateway on the same machine forwards to `http://127.0.0.1:18070`. This example goes under `hai.json.deploy`. The SSH account owns the Rootless Docker socket and has write access to `baseDir`. An off-host gateway uses a specific private IP protected by a firewall.

```yaml schema=@h-ai/deploy:DeployConfigSchema
environment: prod
provider:
  type: docker-ssh
  ssh:
    host: deployment.example.com
    username: deploy
  remote:
    runtime: docker
    dockerMode: rootless
    baseDir: /home/deploy/hai-apps
  expose:
    hostAddress: 127.0.0.1
    hostPort: 18070
    publicUrl: https://app.example.com
```

Configure DNS and TLS on the gateway and have it replace the Host, client-IP and protocol headers. Set `trustedEdgeProxies` to the gateway peer address actually seen by the deployment, including any rootless port forwarding. Check both addresses with `hai deploy --env prod --plan`, then deploy the full bundle. Rebuild the full bundle when changing domains or listeners and test login, redirects and health.
