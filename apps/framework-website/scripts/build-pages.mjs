import { writeFile } from 'node:fs/promises'
/** 官网发布到自定义域名的根路径，只复制公开截图，不读取私密运行配置。 */
import { createBuilder } from 'vite'

const builder = await createBuilder()
await builder.buildApp()
await writeFile('build/.nojekyll', '')
