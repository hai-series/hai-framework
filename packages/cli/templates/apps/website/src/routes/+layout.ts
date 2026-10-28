// Vite公开开关只影响静态展示；服务端模块在构建入口预检时拒绝，不降级运行守卫。
export const prerender = __HAI_BUILD_STATIC__
export const trailingSlash = __HAI_BUILD_STATIC__ ? 'always' : 'never'
