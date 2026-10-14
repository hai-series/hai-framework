import type { NavAdapter } from '@h-ai/ui'
import * as m from '$lib/paraglide/messages.js'
import { createGuide } from '@h-ai/ui/guide'

/** 在后台布局中创建实例，应用只维护业务内容，通用交互由 UI 模块提供。 */
export function createAdminGuide(nav: NavAdapter) {
  return createGuide({
    nav,
    persistKey: 'hai-admin-guide',
    tours: [{
      id: 'overview',
      title: () => m.guide_overview_title(),
      description: () => m.guide_overview_description(),
      route: '/admin',
      steps: [
        { target: 'admin-content', title: () => m.guide_content_title(), description: () => m.guide_content_description() },
        { target: 'admin-theme', title: () => m.guide_theme_title(), description: () => m.guide_theme_description() },
        { target: 'admin-profile', title: () => m.guide_profile_title(), description: () => m.guide_profile_description() },
        { target: 'admin-help', title: () => m.guide_help_title(), description: () => m.guide_help_description() },
      ],
    }, {
      id: 'profile',
      title: () => m.guide_profile_tour_title(),
      description: () => m.guide_profile_tour_description(),
      route: '/admin/profile',
      steps: [
        { target: 'admin-profile-form', title: () => m.guide_profile_title(), description: () => m.guide_profile_form_description() },
        { target: 'admin-password', title: () => m.guide_password_title(), description: () => m.guide_password_description() },
      ],
    }],
    articles: [{
      id: 'overview',
      title: () => m.guide_overview_title(),
      description: () => m.guide_overview_description(),
      content: () => m.guide_overview_article(),
      tourId: 'overview',
    }, {
      id: 'profile',
      title: () => m.guide_profile_tour_title(),
      description: () => m.guide_profile_tour_description(),
      content: () => m.guide_profile_article(),
      tourId: 'profile',
    }],
  })
}
