import { aiM } from '../ai-i18n.js'

const fields = {
  prompt: ['ai_toolsFieldPrompt', 'ai_toolsFieldPromptHelp'],
  text: ['ai_toolsFieldText', 'ai_toolsFieldTextHelp'],
  instruction: ['ai_toolsFieldInstruction', 'ai_toolsFieldInstructionHelp'],
  model: ['ai_toolsFieldModel', 'ai_toolsFieldModelHelp'],
  fileId: ['ai_toolsFieldFile', 'ai_toolsFieldFileHelp'],
  referenceIds: ['ai_toolsFieldReferences', 'ai_toolsFieldReferencesHelp'],
  id: ['ai_toolsFieldDocument', 'ai_toolsFieldDocumentHelp'],
  content: ['ai_toolsFieldContent', 'ai_toolsFieldContentHelp'],
  selectedText: ['ai_toolsFieldSelection', 'ai_toolsFieldSelectionHelp'],
  baseVersion: ['ai_toolsFieldVersion', 'ai_toolsFieldVersionHelp'],
  language: ['ai_toolsFieldLanguage', 'ai_toolsFieldLanguageHelp'],
  voice: ['ai_toolsFieldVoice', 'ai_toolsFieldVoiceHelp'],
  speed: ['ai_toolsFieldSpeed', 'ai_toolsFieldSpeedHelp'],
  format: ['ai_toolsFieldFormat', 'ai_toolsFieldFormatHelp'],
  size: ['ai_toolsFieldSize', 'ai_toolsFieldSizeHelp'],
  width: ['ai_toolsFieldWidth', 'ai_toolsFieldWidthHelp'],
  imageWidth: ['ai_toolsFieldWidth', 'ai_toolsFieldImageWidthHelp'],
  height: ['ai_toolsFieldHeight', 'ai_toolsFieldHeightHelp'],
  imageHeight: ['ai_toolsFieldHeight', 'ai_toolsFieldImageHeightHelp'],
  timestamps: ['ai_toolsFieldTimestamps', 'ai_toolsFieldTimestampsHelp'],
  targetDuration: ['ai_toolsFieldTargetDuration', 'ai_toolsFieldTargetDurationHelp'],
  durationTolerance: ['ai_toolsFieldTolerance', 'ai_toolsFieldToleranceHelp'],
  url: ['ai_toolsFieldUrl', 'ai_toolsFieldUrlHelp'],
  goal: ['ai_toolsFieldGoal', 'ai_toolsFieldGoalHelp'],
  durationSeconds: ['ai_toolsFieldDuration', 'ai_toolsFieldDurationHelp'],
  brandColor: ['ai_toolsFieldColor', 'ai_toolsFieldColorHelp'],
  captureId: ['ai_toolsFieldCapture', 'ai_toolsFieldCaptureHelp'],
  storyboardId: ['ai_toolsFieldStoryboard', 'ai_toolsFieldStoryboardHelp'],
  audioIds: ['ai_toolsFieldAudioReuse', 'ai_toolsFieldAudioReuseHelp'],
} as const

/**
 * Schema 元数据供通用表单和模型共同使用，不在应用逐工具硬编码。
 * @example 模块内部上下文
 * ```ts
 * const metadata = toolField('fileId', 'artifact-id')
 * ```
 */
export function toolField(name: keyof typeof fields, format?: string): Record<string, string> {
  const [title, description] = fields[name]
  return {
    title: aiM(title),
    description: aiM(description),
    ...(format
      ? { format }
      : {}),
  }
}
