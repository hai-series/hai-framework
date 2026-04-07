export interface PreviewComponent {
  id: string
  component: string
  [key: string]: unknown
}

export interface PreviewSurface {
  surfaceId: string
  rootId: string
  components: Map<string, PreviewComponent>
  dataModel: Record<string, unknown>
}

function normalizeComponent(definition: Record<string, unknown>): PreviewComponent | null {
  const id = typeof definition.id === 'string' ? definition.id : null
  if (!id)
    return null

  if (typeof definition.component === 'string')
    return definition as unknown as PreviewComponent

  if (definition.component && typeof definition.component === 'object') {
    const entries = Object.entries(definition.component as Record<string, unknown>)
    if (!entries.length)
      return null
    const [component, props] = entries[0]
    return {
      id,
      component,
      ...(props && typeof props === 'object' ? props as Record<string, unknown> : {}),
    }
  }

  return null
}

function readPath(model: Record<string, unknown>, path: string): unknown {
  if (!path || path === '/')
    return model

  const parts = path.split('/').filter(Boolean)
  let current: unknown = model
  for (const part of parts) {
    if (!current || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function resolveDynamicValue(value: unknown, surface: PreviewSurface): unknown {
  if (value === null || value === undefined)
    return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (Array.isArray(value))
    return value.map(item => resolveDynamicValue(item, surface))
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.path === 'string')
      return readPath(surface.dataModel, record.path)
    if ('literalString' in record)
      return record.literalString
  }
  return value
}

export function buildPreviewSurface(messages: unknown[]): PreviewSurface | null {
  const surfaces = new Map<string, PreviewSurface>()
  let firstRenderableSurfaceId: string | null = null

  function ensureSurface(surfaceId: string): PreviewSurface {
    let surface = surfaces.get(surfaceId)
    if (!surface) {
      surface = {
        surfaceId,
        rootId: 'root',
        components: new Map<string, PreviewComponent>(),
        dataModel: {},
      }
      surfaces.set(surfaceId, surface)
    }
    return surface
  }

  for (const message of messages) {
    if (!message || typeof message !== 'object')
      continue
    const msg = message as Record<string, unknown>

    if (msg.createSurface?.surfaceId) {
      const surface = ensureSurface(msg.createSurface.surfaceId)
      if (typeof msg.createSurface.rootComponentId === 'string')
        surface.rootId = msg.createSurface.rootComponentId
      continue
    }

    if (msg.updateComponents?.surfaceId && Array.isArray(msg.updateComponents.components)) {
      const surface = ensureSurface(msg.updateComponents.surfaceId)
      for (const rawDef of msg.updateComponents.components) {
        if (!rawDef || typeof rawDef !== 'object')
          continue
        const normalized = normalizeComponent(rawDef as Record<string, unknown>)
        if (normalized)
          surface.components.set(normalized.id, normalized)
      }
      continue
    }

    if (msg.surfaceUpdate?.surfaceId && Array.isArray(msg.surfaceUpdate.components)) {
      const surface = ensureSurface(msg.surfaceUpdate.surfaceId)
      for (const rawDef of msg.surfaceUpdate.components) {
        if (!rawDef || typeof rawDef !== 'object')
          continue
        const normalized = normalizeComponent(rawDef as Record<string, unknown>)
        if (normalized)
          surface.components.set(normalized.id, normalized)
      }
      continue
    }

    if (msg.updateDataModel?.surfaceId) {
      const surface = ensureSurface(msg.updateDataModel.surfaceId)
      if (msg.updateDataModel.data && typeof msg.updateDataModel.data === 'object') {
        Object.assign(surface.dataModel, msg.updateDataModel.data)
      }
      if (Array.isArray(msg.updateDataModel.contents)) {
        for (const item of msg.updateDataModel.contents) {
          if (!item || typeof item !== 'object')
            continue
          const key = typeof item.key === 'string' ? item.key : null
          if (!key)
            continue
          const rawValue = typeof item.valueString === 'string' ? item.valueString : ''
          try {
            surface.dataModel[key] = JSON.parse(rawValue)
          }
          catch {
            surface.dataModel[key] = rawValue
          }
        }
      }
      if (typeof msg.updateDataModel.path === 'string' && msg.updateDataModel.path.startsWith('/')) {
        const key = msg.updateDataModel.path.slice(1)
        surface.dataModel[key] = msg.updateDataModel.value
      }
      continue
    }

    if (msg.dataModelUpdate?.surfaceId && Array.isArray(msg.dataModelUpdate.contents)) {
      const surface = ensureSurface(msg.dataModelUpdate.surfaceId)
      for (const item of msg.dataModelUpdate.contents) {
        if (!item || typeof item !== 'object')
          continue
        const key = typeof item.key === 'string' ? item.key : null
        if (!key)
          continue
        const rawValue = typeof item.valueString === 'string' ? item.valueString : ''
        try {
          surface.dataModel[key] = JSON.parse(rawValue)
        }
        catch {
          surface.dataModel[key] = rawValue
        }
      }
      continue
    }

    if (msg.beginRendering?.surfaceId) {
      const surface = ensureSurface(msg.beginRendering.surfaceId)
      if (typeof msg.beginRendering.root === 'string')
        surface.rootId = msg.beginRendering.root
      if (!firstRenderableSurfaceId)
        firstRenderableSurfaceId = surface.surfaceId
    }
  }

  if (!firstRenderableSurfaceId)
    return null

  return surfaces.get(firstRenderableSurfaceId) ?? null
}
