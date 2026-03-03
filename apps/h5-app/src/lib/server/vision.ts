/**
 * 拍照识图服务端工具
 */

export interface VisionAnalysis {
  summary: string
  details: string[]
  tags: string[]
  confidence: number
}

/**
 * 解析模型返回文本为结构化识图结果
 */
export function parseVisionAnalysis(text: string): VisionAnalysis {
  const fallback: VisionAnalysis = {
    summary: text,
    details: [],
    tags: [],
    confidence: 0.6,
  }

  try {
    const parsed = JSON.parse(text) as Partial<VisionAnalysis>
    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.length > 0 ? parsed.summary : fallback.summary,
      details: Array.isArray(parsed.details) ? parsed.details.filter(v => typeof v === 'string') : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(v => typeof v === 'string') : [],
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.6,
    }
  }
  catch {
    return fallback
  }
}
