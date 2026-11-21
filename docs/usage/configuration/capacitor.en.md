# @h-ai/capacitor Configuration

[Chinese source](capacitor.md) · [Data structures](../data/capacitor.en.md) · [API reference](../function/capacitor.en.md)

Set `appId`, `appName` and the actual web output directory `webDir` in the native project. A physical device must be able to reach the API URL passed to the API client. `CAPACITOR_SERVER_URL` is optional for device development; ship synced assets in release builds.

## Configuration examples

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
}
export default config
```

### Copy a SvelteKit static build

This assumes a static adapter that writes to `build/`. Set `webDir` to the actual build output, not the development server URL. Synchronize the built assets into the native project, then check pages and plugins on the device.

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'build',
}
export default config
```

### Use a development server on a device

The computer and device must reach each other. Set `CAPACITOR_SERVER_URL` only for local development, for example `http://192.168.1.20:5173`; the configuration below explicitly reads it. With no variable, use bundled assets. Clear it and resynchronize for release. Configure the API URL and allowed origins for your actual backend.

```ts
import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'

const developmentUrl = process.env.CAPACITOR_SERVER_URL
const config: CapacitorConfig = {
  appId: 'com.example.orders',
  appName: 'Orders',
  webDir: 'dist',
  ...(developmentUrl
    ? { server: { url: developmentUrl, cleartext: developmentUrl.startsWith('http:') } }
    : {}),
}
export default config
```

## Configuration reference


| Field | Default or requirement | Meaning |
| --- | --- | --- |
| `appId` | Project supplies | Unique application identifier in `capacitor.config.ts`. |
| `appName` | Project supplies | Display name in the native project. |
| `webDir` | Match build output | Directory copied into the native package. |
| `CAPACITOR_SERVER_URL` | Optional | Template reads this environment value for device development; release builds use synced assets. |
