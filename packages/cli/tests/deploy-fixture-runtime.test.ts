import { afterEach, expect, it, vi } from 'vitest'
import { testContainerRuntimeCandidates } from './helpers/deploy-container-fixture.js'

afterEach(() => vi.unstubAllEnvs())

it('preserves Podman-first probing when no test engine was requested', () => {
  vi.stubEnv('HAI_TEST_CONTAINER_ENGINE', undefined)
  expect(testContainerRuntimeCandidates()).toEqual(['podman', 'docker'])
})

it.each(['docker', 'podman'])('only probes the explicitly selected %s engine', (runtime) => {
  vi.stubEnv('HAI_TEST_CONTAINER_ENGINE', runtime)
  expect(testContainerRuntimeCandidates()).toEqual([runtime])
})

it.each(['', 'containerd', 'Docker'])('rejects invalid explicit engine %j before probing', (runtime) => {
  vi.stubEnv('HAI_TEST_CONTAINER_ENGINE', runtime)
  expect(() => testContainerRuntimeCandidates()).toThrow('HAI_TEST_CONTAINER_ENGINE')
})
