import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ parent }) => {
  return { iamPublicConfig: (await parent()).iamPublicConfig }
}
