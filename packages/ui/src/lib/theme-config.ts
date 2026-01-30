/**
 * =============================================================================
 * @hai/ui - 主题配置
 * =============================================================================
 * FlyonUI 主题元数据和配置
 *
 * 支持的主题列表（17 个）：
 * - light, dark, black - 基础主题
 * - claude, corporate, ghibli, gourmet - 品牌主题
 * - luxury, mintlify, pastel, perplexity - 设计主题
 * - shadcn, slack, soft, spotify - 产品主题
 * - valorant, vscode - 游戏/工具主题
 * =============================================================================
 */

/**
 * 主题信息
 */
export interface ThemeInfo {
  /** 主题标识符 */
  id: string
  /** 显示名称 */
  name: string
  /** 是否为暗色主题 */
  dark: boolean
  /** 主题色（用于预览） */
  primaryColor: string
  /** 背景色（用于预览） */
  bgColor: string
  /** 所需字体族（可选） */
  fontFamily?: string
  /** Google Fonts URL（可选） */
  fontUrl?: string
}

/**
 * 主题分组
 */
export interface ThemeGroup {
  /** 分组标识 */
  id: string
  /** 分组名称 */
  name: string
  /** 分组内的主题 */
  themes: ThemeInfo[]
}

/**
 * 所有 FlyonUI 主题配置
 */
export const THEMES: ThemeInfo[] = [
  // 基础主题
  {
    id: 'light',
    name: 'Light',
    dark: false,
    primaryColor: '#570df8',
    bgColor: '#ffffff',
  },
  {
    id: 'dark',
    name: 'Dark',
    dark: true,
    primaryColor: '#661ae6',
    bgColor: '#1d232a',
  },
  {
    id: 'black',
    name: 'Black',
    dark: true,
    primaryColor: '#ffffff',
    bgColor: '#000000',
  },
  // 品牌主题
  {
    id: 'claude',
    name: 'Claude',
    dark: false,
    primaryColor: '#d97706',
    bgColor: '#fffbf5',
    fontFamily: 'Geist',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    dark: false,
    primaryColor: '#4b6bfb',
    bgColor: '#ffffff',
    fontFamily: 'Public Sans',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'ghibli',
    name: 'Ghibli',
    dark: false,
    primaryColor: '#65c3c8',
    bgColor: '#faf7f5',
    fontFamily: 'Amaranth',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Amaranth:ital,wght@0,400;0,700;1,400;1,700&display=swap',
  },
  {
    id: 'gourmet',
    name: 'Gourmet',
    dark: false,
    primaryColor: '#b91c1c',
    bgColor: '#fef9f3',
    fontFamily: 'Rubik',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap',
  },
  // 设计主题
  {
    id: 'luxury',
    name: 'Luxury',
    dark: true,
    primaryColor: '#c9a53d',
    bgColor: '#171618',
    fontFamily: 'Archivo',
    fontUrl: 'https://fonts.googleapis.com/css?family=Archivo:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'mintlify',
    name: 'Mintlify',
    dark: false,
    primaryColor: '#16a34a',
    bgColor: '#f8fafc',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    dark: false,
    primaryColor: '#d1c1d7',
    bgColor: '#f5f0fa',
    fontFamily: 'Open Sans',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    dark: false,
    primaryColor: '#20808d',
    bgColor: '#ffffff',
  },
  // 产品主题
  {
    id: 'shadcn',
    name: 'Shadcn',
    dark: false,
    primaryColor: '#18181b',
    bgColor: '#ffffff',
  },
  {
    id: 'slack',
    name: 'Slack',
    dark: true,
    primaryColor: '#e9b045',
    bgColor: '#1a1d21',
    fontFamily: 'Lato',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap',
  },
  {
    id: 'soft',
    name: 'Soft',
    dark: false,
    primaryColor: '#5e4db2',
    bgColor: '#f9f7ff',
    fontFamily: 'Montserrat',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    dark: true,
    primaryColor: '#1db954',
    bgColor: '#121212',
    fontFamily: 'Lato',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap',
  },
  // 游戏/工具主题
  {
    id: 'valorant',
    name: 'Valorant',
    dark: true,
    primaryColor: '#ff4654',
    bgColor: '#0f1923',
    fontFamily: 'Work Sans',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=swap',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    dark: true,
    primaryColor: '#0078d4',
    bgColor: '#1e1e1e',
    fontFamily: 'Fira Code',
    fontUrl: 'https://fonts.googleapis.com/css?family=Fira+Code:wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap',
  },
]

/**
 * 主题分组配置
 */
export const THEME_GROUPS: ThemeGroup[] = [
  {
    id: 'basic',
    name: '基础',
    themes: THEMES.filter(t => ['light', 'dark', 'black'].includes(t.id)),
  },
  {
    id: 'brand',
    name: '品牌',
    themes: THEMES.filter(t => ['claude', 'corporate', 'ghibli', 'gourmet'].includes(t.id)),
  },
  {
    id: 'design',
    name: '设计',
    themes: THEMES.filter(t => ['luxury', 'mintlify', 'pastel', 'perplexity'].includes(t.id)),
  },
  {
    id: 'product',
    name: '产品',
    themes: THEMES.filter(t => ['shadcn', 'slack', 'soft', 'spotify'].includes(t.id)),
  },
  {
    id: 'special',
    name: '特色',
    themes: THEMES.filter(t => ['valorant', 'vscode'].includes(t.id)),
  },
]

/**
 * 暗色主题列表
 */
export const DARK_THEMES = THEMES.filter(t => t.dark).map(t => t.id)

/**
 * 获取主题信息
 */
export function getThemeInfo(themeId: string): ThemeInfo | undefined {
  return THEMES.find(t => t.id === themeId)
}

/**
 * 检查是否为暗色主题
 */
export function isDarkTheme(themeId: string): boolean {
  return DARK_THEMES.includes(themeId)
}

/**
 * 获取主题需要的字体 URL
 */
export function getThemeFontUrl(themeId: string): string | undefined {
  return getThemeInfo(themeId)?.fontUrl
}

/**
 * 获取所有需要预加载的字体 URL
 */
export function getAllFontUrls(): string[] {
  const urls = new Set<string>()
  for (const theme of THEMES) {
    if (theme.fontUrl) {
      urls.add(theme.fontUrl)
    }
  }
  return [...urls]
}
