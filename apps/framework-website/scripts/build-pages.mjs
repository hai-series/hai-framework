import { writeFile } from 'node:fs/promises'
/** 官网固定发布到仓库子路径；只复制公开截图，不读取私密运行配置。 */
import { createBuilder } from 'vite'

const builder = await createBuilder()
await builder.buildApp()
await writeFile('build/.nojekyll', '')
