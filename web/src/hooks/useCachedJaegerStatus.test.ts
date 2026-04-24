import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCachedJaegerStatus } from './useCachedJaegerStatus'

// Mock useCache
const mockUseCache = vi.fn()
vi.mock('./useCache', () => ({
    useCache: (options: any) => mockUseCache(options),
}))

// Mock demo mode
let mockIsDemoMode = false
vi.mock('../lib/demoMode', () => ({
    isDemoMode: () => mockIsDemoMode,
}))

// Mock demo data
vi.mock('./useCachedData/demoData', () => ({
    getDemoJaegerStatus: () => ({ status: 'Healthy', version: 'demo-1.0' }),
}))

describe('useCachedJaegerStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsDemoMode = false
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: '1.57.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: 123456789,
            refetch: vi.fn(),
        })
    })

    it('returns live data when not in demo mode', () => {
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.data.version).toBe('1.57.0')
        expect(result.current.isDemoData).toBe(false)
    })

    it('returns demo data when in demo mode', () => {
        mockIsDemoMode = true
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.data.version).toBe('demo-1.0')
        expect(result.current.isDemoData).toBe(true)
    })

    it('identifies demo fallback when API fails', () => {
        mockUseCache.mockReturnValue({
            data: { status: 'Healthy', version: 'demo-1.0' },
            isLoading: false,
            isRefreshing: false,
            isDemoFallback: true, // Cache layer signaled fallback
            isFailed: true,
            consecutiveFailures: 1,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.isDemoData).toBe(true)
    })

    it('does not show demo data while loading', () => {
        mockUseCache.mockReturnValue({
            data: null,
            isLoading: true,
            isRefreshing: false,
            isDemoFallback: true,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: null,
            refetch: vi.fn(),
        })
        const { result } = renderHook(() => useCachedJaegerStatus())
        expect(result.current.isDemoData).toBe(false)
        expect(result.current.isLoading).toBe(true)
    })
})
