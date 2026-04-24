import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { JaegerStatus } from '../index'
import React from 'react'

// Mock i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

// Mock custom hooks
const mockUseCachedJaegerStatus = vi.fn()
vi.mock('../../../../hooks/useCachedData', () => ({
    useCachedJaegerStatus: () => mockUseCachedJaegerStatus(),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
    useGlobalFilters: () => ({ selectedClusters: [] }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
    useDrillDownActions: () => ({ drillToNode: vi.fn() }),
}))

vi.mock('../../../../hooks/useCardLoadingState', () => ({
    useCardLoadingState: () => ({
        showSkeleton: false,
        showSpinner: false,
        showEmpty: false,
        showError: false,
        isInteractive: true,
    }),
}))

vi.mock('../../../../hooks/useCardData', () => ({
    useCardData: () => ({
        data: null,
        error: null,
        isLoading: false,
        isRefreshing: false,
        refetch: vi.fn(),
    }),
}))

// Mock CardControls and other UI components to avoid dependency issues
vi.mock('../../../ui/CardControls', () => ({
    CardControls: () => <div data-testid="card-controls" />,
}))

vi.mock('../../../ui/StatusBadge', () => ({
    StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

vi.mock('../../../ui/RefreshIndicator', () => ({
    RefreshIndicator: () => <div data-testid="refresh-indicator" />,
}))

describe('JaegerStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseCachedJaegerStatus.mockReturnValue({
            data: {
                status: 'Healthy',
                version: '1.57.0',
                collectors: {
                    count: 1,
                    status: 'Healthy',
                    items: [{ name: 'col-1', status: 'Healthy', version: '1.57.0', cluster: 'cl1' }]
                },
                query: { status: 'Healthy' },
                metrics: {
                    servicesCount: 10,
                    tracesLastHour: 100,
                    dependenciesCount: 5,
                    avgLatencyMs: 10,
                    p95LatencyMs: 20,
                    p99LatencyMs: 30,
                    spansDroppedLastHour: 5,
                    avgQueueLength: 12
                }
            },
            isLoading: false,
            isRefreshing: false,
            isDemoData: false,
            isFailed: false,
            consecutiveFailures: 0,
            lastRefresh: Date.now(),
            refetch: vi.fn(),
        })
    })

    it('renders Jaeger title and metrics', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('jaeger.title')).toBeInTheDocument()
        expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('renders health KPIs', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('jaeger.dropped')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('renders collectors list', async () => {
        render(<JaegerStatus />)
        expect(await screen.findByText('col-1')).toBeInTheDocument()
    })
})
