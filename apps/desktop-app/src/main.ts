/**
 * @file src/main.ts
 *
 * 应用入口：初始化 api 客户端 → 挂载 App.svelte。
 */

import { mount } from 'svelte'
import App from './App.svelte'
import { initApi } from './lib/api.js'
import './app.css'

async function bootstrap() {
  await initApi()
  const target = document.getElementById('app')
  if (!target) {
    throw new Error('Root element #app not found')
  }
  return mount(App, { target })
}

const appPromise = bootstrap()
export default appPromise
