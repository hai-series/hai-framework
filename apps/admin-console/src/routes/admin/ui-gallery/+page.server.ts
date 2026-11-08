import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'

/** 展示入口在服务端规范化到首个标签；SSR、刷新和客户端导航共用同一跳转。 */
export function load(): never {
  redirect(302, resolve('admin/ui-gallery/primitives'))
}
