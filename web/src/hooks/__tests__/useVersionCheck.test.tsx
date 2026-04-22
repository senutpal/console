import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import {
    parseReleaseTag,
    parseRelease,
    getLatestForChannel,
    isDevVersion,
    isNewerVersion,
    VersionCheckProvider,
    useVersionCheck
} from '../useVersionCheck'
import type { GitHubRelease, ParsedRelease } from '../../types/updates'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

const mockUseLocalAgent = vi.hoisted(() =>
    vi.fn(() => ({
        isConnected: false,
        health: null as Record<string, unknown> | null,
        refresh: vi.fn(),
    }))
)

vi.mock('../useLocalAgent', () => ({
    useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../../lib/analytics', () => ({
    emitSessionContext: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    return {
        tag_name: 'v1.2.3',
        name: 'Release v1.2.3',
        body: 'Release notes',
        published_at: '2025-01-24T00:00:00Z',
        html_url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        prerelease: false,
        draft: false,
        ...overrides,
    }
}

function makeParsedRelease(overrides: Partial<ParsedRelease> = {}): ParsedRelease {
    return {
        tag: 'v1.2.3',
        version: 'v1.2.3',
        type: 'stable',
        date: null,
        publishedAt: new Date('2025-01-24T00:00:00Z'),
        releaseNotes: 'Release notes',
        url: 'https://github.com/kubestellar/console/releases/tag/v1.2.3',
        ...overrides,
    }
}

function wrapper({ children }: { children: React.ReactNode }) {
    return <VersionCheckProvider>{children}</VersionCheckProvider>
}

const RELEASES_API_PATH = '/api/github/repos/kubestellar/console/releases'
const AUTO_UPDATE_STATUS_PATH = '/auto-update/status'

function isReleasesApiCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(RELEASES_API_PATH)
}

function isAutoUpdateStatusCall(call: unknown[]): boolean {
    return typeof call[0] === 'string' && (call[0] as string).includes(AUTO_UPDATE_STATUS_PATH)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVersionCheck (Main Hook Logic)', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    // --- Utility Parsing Tests ---
    describe('Utilities', () => {
        it('parseReleaseTag correctly identifies nightly/weekly/stable', () => {
            expect(parseReleaseTag('v0.0.1-nightly.20250124')).toEqual({ type: 'nightly', date: '20250124' })
            expect(parseReleaseTag('v0.0.1-weekly.20250124')).toEqual({ type: 'weekly', date: '20250124' })
            expect(parseReleaseTag('v1.2.3')).toEqual({ type: 'stable', date: null })
        })

        it('isDevVersion identifies non-tagged or dev versions', () => {
            expect(isDevVersion('unknown')).toBe(true)
            expect(isDevVersion('dev')).toBe(true)
            expect(isDevVersion('0.0.0')).toBe(true) // placeholder dev
            expect(isDevVersion('v1.2.3')).toBe(false)
            expect(isDevVersion('0.1.0')).toBe(false) // Helm install
        })

        it('isNewerVersion handles semver and nightly comparisons', () => {
            expect(isNewerVersion('v1.0.0', 'v1.0.1', 'stable')).toBe(true)
            expect(isNewerVersion('v1.2.3', 'v1.2.3', 'stable')).toBe(false)
            expect(isNewerVersion('0.1.0', 'v2.0.0', 'stable')).toBe(true) // Helm -> stable update
            expect(isNewerVersion('0.0.0', 'v2.0.0', 'stable')).toBe(false) // dev placeholder -> no update
            expect(isNewerVersion('v0.0.1-nightly.20250101', 'v0.0.1-nightly.20250102', 'unstable')).toBe(true)
        })
    })

    // --- Hook State & Persistence Tests ---
    describe('State & Persistence', () => {
        it('loads skipped versions from localStorage', () => {
            localStorage.setItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS, JSON.stringify(['v9.9.9']))
            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            expect(result.current.skippedVersions).toContain('v9.9.9')
        })

        it('skipVersion persists new version to localStorage', () => {
            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            act(() => { result.current.skipVersion('v8.8.8') })
            expect(result.current.skippedVersions).toContain('v8.8.8')
            expect(localStorage.getItem(UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS)).toContain('v8.8.8')
        })

        it('setChannel persists and syncs with agent', async () => {
            const mockFetch = vi.fn().mockResolvedValue({ ok: true })
            vi.stubGlobal('fetch', mockFetch)
            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            await act(async () => { await result.current.setChannel('unstable') })
            expect(result.current.channel).toBe('unstable')
            expect(localStorage.getItem(UPDATE_STORAGE_KEYS.CHANNEL)).toBe('unstable')
        })
    })

    // --- GitHub API Integration Tests ---
    describe('GitHub API Integration', () => {
        it('forceCheck calls GitHub API and updates releases', async () => {
            localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
            const mockReleases = [makeGitHubRelease({ tag_name: 'v2.0.0' })]
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockReleases,
                headers: { get: () => null }
            }))

            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            await act(async () => { await result.current.forceCheck() })

            expect(result.current.releases).toHaveLength(1)
            expect(result.current.releases[0].tag).toBe('v2.0.0')
        })

        it('handles 403 Rate Limit by using cache and setting error', async () => {
            localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
            const cache = { data: [makeGitHubRelease({ tag_name: 'cached' })], timestamp: Date.now(), etag: null }
            localStorage.setItem(UPDATE_STORAGE_KEYS.RELEASES_CACHE, JSON.stringify(cache))

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                headers: { get: () => null }
            }))

            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            // Threshold is 2 failures
            await act(async () => { await result.current.forceCheck() })
            await act(async () => { await result.current.checkForUpdates() })

            expect(result.current.error).toMatch(/Rate limited/)
            expect(result.current.releases[0].tag).toBe('cached')
        })
    })

    // --- Agent Integration & Auto-Update Tests ---
    describe('Agent Integration', () => {
        it('syncs auto-update status from agent', async () => {
            mockUseLocalAgent.mockReturnValue({
                isConnected: true,
                health: { install_method: 'dev' },
                refresh: vi.fn(),
            })

            const statusResponse = { latestSHA: 'new-sha', hasUpdate: true }
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => statusResponse
            }))

            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            await waitFor(() => {
                expect(result.current.latestMainSHA).toBe('new-sha')
                expect(result.current.hasUpdate).toBe(true)
            })
        })

        it('triggerUpdate returns success when agent responds OK', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
            const { result } = renderHook(() => useVersionCheck(), { wrapper })
            const res = await act(async () => result.current.triggerUpdate())
            expect(res.success).toBe(true)
        })
    })
})
