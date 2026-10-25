import { describe, expect, it } from 'vitest'
import { readmeIssues } from '../check-readme.mjs'

describe('readme structure', () => {
  it('ignores example headings inside fences and accepts a final license', () => {
    expect(readmeIssues('# Example\n\n## Usage\n\n```md\n## License\n```\n\n## License\n\nApache-2.0\n')).toEqual([])
  })
  it('rejects misplaced, duplicated and unheaded feature content after the license', () => {
    expect(readmeIssues('## License\n\nApache-2.0\n\n## Usage\n')).toContain('License must be the final section')
    expect(readmeIssues('## 许可证\n\nApache-2.0\n\n新增功能\n')).toContain('Move feature content out of the license section')
    expect(readmeIssues('## License\n\nApache-2.0Feature added\n')).toContain('Move feature content out of the license section')
    expect(readmeIssues('### 📄 许可证\n\nApache-2.0\n\n## 许可证\n\nApache-2.0\n')).toContain('Duplicate license section')
  })
  it.each(['开发测试', '二次开发', 'Development and testing', 'Development', '開発とテスト'])('keeps feature content before %s', (heading) => {
    expect(readmeIssues(`## ${heading}\n\nTesting\n\n## Usage\n\nExample\n\n## License\n\nApache-2.0\n`)).toContain('Place feature sections before development/testing')
    expect(readmeIssues(`## Usage\n\nExample\n\n## ${heading}\n\n### Test commands\n\nTesting\n\n## License\n\nApache-2.0\n`)).toEqual([])
  })
})
