import type {
  ArtifactCreateRequest,
  ArtifactDocument,
  ArtifactRewriteRequest,
  ArtifactSaveRequest,
  ArtifactSaveResponse,
  ArtifactSummary,
  ToolCatalogItem,
  ToolResource,
  ToolRun,
  ToolRunRequest,
} from '@h-ai/ui/components/scenes/tools/index'
import type { AgentResource } from '#lib/workspace.js'
import { replaceState } from '$app/navigation'
import { page } from '$app/state'
import { AgentClientError, mutate, read, url } from '#lib/client.js'

/** 将已有资源投影给通用工作台，工程补丁保留原来的预览与发布入口。 */
function summary(resource: AgentResource): ArtifactSummary {
  return {
    id: resource.id,
    title: resource.title,
    kind: resource.artifactKind ?? 'file',
    version: resource.version ?? 1,
    mediaType: resource.mediaType,
    updatedAt: resource.updatedAt,
    downloadUrl: url({ download: resource.id }),
  }
}

/** 地址仅保留同主体服务端才能查询的回执/幂等键，不保存参数或身份。 */
function remember(run: ToolRun | undefined) {
  if (typeof window === 'undefined')
    return
  const target = new URL(window.location.href)
  target.searchParams.delete('toolRun')
  target.searchParams.delete('toolKey')
  if (run?.idempotencyKey)
    target.searchParams.set('toolKey', run.idempotencyKey)
  else if (run)
    target.searchParams.set('toolRun', run.id)
  if (target.href !== window.location.href)
    replaceState(target, page.state)
}

/** Agent 只连接组件回调，通用编辑、表单和任务展示由 UI 模块负责。 */
export const workbench = {
  artifacts: {
    async list(signal?: AbortSignal): Promise<ArtifactSummary[]> {
      const resources = await read<AgentResource[]>({ pane: 'artifacts' }, signal)
      return resources.filter(item => item.artifactKind && item.version).map(summary)
    },
    read(id: string, version: number | undefined, signal: AbortSignal): Promise<ArtifactDocument> {
      return read({
        artifact: id,
        ...(version === undefined
          ? {}
          : {
              version: String(version),
            }),
      }, signal)
    },
    create(input: ArtifactCreateRequest, signal: AbortSignal): Promise<ArtifactDocument> {
      return mutate({
        type: 'artifact-create',
        id: crypto.randomUUID(),
        ...input,
      }, signal)
    },
    async save(input: ArtifactSaveRequest, signal: AbortSignal): Promise<ArtifactSaveResponse> {
      try {
        return await mutate<ArtifactSaveResponse>({ type: 'artifact-save', ...input }, signal)
      }
      catch (error) {
        if (error instanceof AgentClientError && error.status === 409 && error.code === 'artifact-conflict' && error.currentVersion)
          return { status: 'conflict', currentVersion: error.currentVersion }
        throw error
      }
    },
    history(id: string, signal: AbortSignal): Promise<readonly ArtifactSummary[]> {
      return read({ artifactHistory: id }, signal)
    },
    rewrite(input: ArtifactRewriteRequest, signal: AbortSignal): Promise<{ content: string }> {
      return mutate({ type: 'artifact-rewrite', ...input }, signal)
    },
  },
  tools: {
    remember,
    resume(): ToolRun | undefined {
      if (typeof window === 'undefined')
        return undefined
      const query = new URL(window.location.href).searchParams
      const key = query.get('toolKey')
      const id = query.get('toolRun')
      if (key && key.length <= 200)
        return { id: `pending.${key}`, idempotencyKey: key, status: 'unknown' }
      return id && id.length <= 1024
        ? { id, status: 'unknown' }
        : undefined
    },
    async resources(signal?: AbortSignal): Promise<ToolResource[]> {
      const lists = await Promise.all([
        read<AgentResource[]>({ pane: 'files' }, signal),
        read<AgentResource[]>({ pane: 'artifacts' }, signal),
      ])
      return [
        ...new Map(lists.flat().map(item => [
          item.id,
          {
            id: item.id,
            title: item.title,
            kind: item.artifactKind ?? item.kind,
            mediaType: item.mediaType,
          },
        ])).values(),
      ]
    },
    catalog(signal?: AbortSignal): Promise<ToolCatalogItem[]> {
      return read({ catalog: '1' }, signal)
    },
    run(input: ToolRunRequest, signal: AbortSignal): Promise<ToolRun> {
      remember({ id: `pending.${input.idempotencyKey}`, idempotencyKey: input.idempotencyKey, status: 'unknown' })
      return mutate({
        type: 'tool-run',
        ...input,
      }, signal)
    },
    status(id: string, signal: AbortSignal): Promise<ToolRun | null> {
      return read(id.startsWith('pending.')
        ? {
            toolKey: id.slice(8),
          }
        : { toolRun: id }, signal)
    },
    cancel(id: string, signal: AbortSignal): Promise<ToolRun> {
      return mutate({ type: 'tool-cancel', id }, signal)
    },
  },
}
