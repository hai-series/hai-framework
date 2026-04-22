// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadAiDocument,
  resolveDocumentDownloadActions,
  resolveDocumentMarkdownContent,
} from '../src/lib/components/scenes/ai/document-download'

const html2canvasMock = vi.fn(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 1500
  return canvas
})
const pdfAddImageMock = vi.fn()
const pdfAddPageMock = vi.fn()
const pdfOutputMock = vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' }))
const canvasFillRectMock = vi.fn()
const canvasDrawImageMock = vi.fn()
const canvasGetImageDataMock = vi.fn((x = 0, y = 0, width = 0, height = 0) => ({
  data: new Uint8ClampedArray(width * height * 4).fill(255),
  width,
  height,
  colorSpace: 'srgb',
} as ImageData))

vi.mock('html2canvas', () => ({
  default: html2canvasMock,
}))

vi.mock('jspdf', () => ({
  jsPDF: class {
    addImage = pdfAddImageMock
    addPage = pdfAddPageMock
    output = pdfOutputMock
  },
}))

describe('document-download', () => {
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>
  let anchorClickSpy: ReturnType<typeof vi.spyOn>
  let canvasGetContextSpy: ReturnType<typeof vi.spyOn>
  let canvasToDataUrlSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    document.body.innerHTML = ''
    html2canvasMock.mockClear()
    pdfAddImageMock.mockClear()
    pdfAddPageMock.mockClear()
    pdfOutputMock.mockClear()
    canvasFillRectMock.mockClear()
    canvasDrawImageMock.mockClear()
    canvasGetImageDataMock.mockClear()
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf')
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function mockCanvasContext(this: HTMLCanvasElement) {
        return {
          fillStyle: '#ffffff',
          fillRect: canvasFillRectMock,
          drawImage: canvasDrawImageMock,
          getImageData: canvasGetImageDataMock,
        } as unknown as CanvasRenderingContext2D
      },
    )
    canvasToDataUrlSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,ZmFrZQ==',
    )
  })

  afterEach(() => {
    createObjectUrlSpy.mockRestore()
    revokeObjectUrlSpy.mockRestore()
    anchorClickSpy.mockRestore()
    canvasGetContextSpy.mockRestore()
    canvasToDataUrlSpy.mockRestore()
  })

  it('falls back to the built-in download action order', () => {
    expect(resolveDocumentDownloadActions()).toEqual([
      {
        id: 'word',
        label: 'Word',
        badgeLabel: 'DOC',
      },
      {
        id: 'pdf',
        label: 'PDF',
        badgeLabel: 'PDF',
      },
      {
        id: 'markdown',
        label: 'Markdown',
        badgeLabel: 'MD',
      },
    ])
  })

  it('preserves custom download labels while filling missing badges', () => {
    expect(resolveDocumentDownloadActions([
      { id: 'markdown', label: '导出 Markdown' },
      { id: 'custom-export', label: '导出其他格式' },
    ])).toEqual([
      {
        id: 'markdown',
        label: '导出 Markdown',
        badgeLabel: 'MD',
      },
      {
        id: 'custom-export',
        label: '导出其他格式',
        badgeLabel: 'CUST',
      },
    ])
  })

  it('wraps code downloads into fenced markdown without mutating regular markdown', () => {
    expect(resolveDocumentMarkdownContent('console.log(1)', 'code', 'ts')).toBe(
      '```ts\nconsole.log(1)\n```',
    )

    expect(resolveDocumentMarkdownContent('# Title', 'document')).toBe('# Title')
  })

  it('expands the fence length when the code already contains triple backticks', () => {
    expect(resolveDocumentMarkdownContent('```js\nalert(1)\n```', 'code', 'md')).toBe(
      '````md\n```js\nalert(1)\n```\n````',
    )
  })

  it('downloads pdf exports directly instead of opening the print dialog', async () => {
    await downloadAiDocument({
      actionId: 'pdf',
      content: '# Export',
      title: 'Monthly Report',
    })

    expect(html2canvasMock).toHaveBeenCalledTimes(1)
    const renderedElement = html2canvasMock.mock.calls[0]?.[0] as HTMLElement
    expect(renderedElement.ownerDocument).not.toBe(document)
    expect(pdfAddImageMock).toHaveBeenCalled()
    expect(pdfOutputMock).toHaveBeenCalledWith('blob')
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy.mock.instances[0]?.download).toBe('Monthly Report.pdf')
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.body.innerHTML).toBe('')
  })

  it('prefers blank rows when splitting long pdf pages', async () => {
    html2canvasMock.mockImplementationOnce(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 186
      canvas.height = 400
      canvas.dataset.sourceCanvas = 'true'
      return canvas
    })
    canvasGetImageDataMock.mockImplementation((x = 0, y = 0, width = 0, height = 0) => {
      const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
      for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
        const absoluteY = y + rowIndex
        if (absoluteY >= 240 && absoluteY <= 242) {
          continue
        }

        for (const column of [0, 4, 8]) {
          const pixelOffset = (rowIndex * width * 4) + (column * 4)
          pixels[pixelOffset] = 0
          pixels[pixelOffset + 1] = 0
          pixels[pixelOffset + 2] = 0
          pixels[pixelOffset + 3] = 255
        }
      }

      return {
        data: pixels,
        width,
        height,
        colorSpace: 'srgb',
      } as ImageData
    })

    await downloadAiDocument({
      actionId: 'pdf',
      content: '# Export',
      title: 'Split Report',
    })

    expect(canvasDrawImageMock).toHaveBeenCalledTimes(2)
    expect(canvasDrawImageMock.mock.calls[0]?.[2]).toBe(0)
    expect(canvasDrawImageMock.mock.calls[1]?.[2]).toBe(243)
    expect(pdfAddPageMock).toHaveBeenCalledTimes(1)
  })
})
