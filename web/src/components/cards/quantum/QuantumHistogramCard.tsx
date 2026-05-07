import React, { useState, useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { useReportCardDataState } from '../CardDataContext'
import { Slider } from '../../ui/Slider'
import { isGlobalQuantumPollingPaused } from '../../../lib/quantum/pollingContext'
import { isQuantumForcedToDemo, isDemoMode } from '../../../lib/demoMode'
import { useResultHistogram } from '../../../hooks/useResultHistogram'
import { useAuth } from '../../../lib/auth'
import { getChartColor } from '../../../lib/chartColors'

const HISTOGRAM_DEFAULT_POLL_MS = 10000
const HISTOGRAM_POLL_MIN_MS = 2000
const HISTOGRAM_POLL_MAX_MS = 30000
const COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(i => getChartColor(i))

export const QuantumHistogramCard: React.FC = () => {
  const { isAuthenticated, login, isLoading: authIsLoading } = useAuth()
  const [sortBy, setSortBy] = useState<'count' | 'pattern'>('pattern')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [refreshInterval, setRefreshInterval] = useState(HISTOGRAM_DEFAULT_POLL_MS)

  
  const { data, isLoading, error: hookError, refetch } = useResultHistogram(sortBy, refreshInterval)

  const isPaused = isGlobalQuantumPollingPaused()
  const forceDemo = isQuantumForcedToDemo()
  const globalDemoEnabled = isDemoMode()
  const effectiveIsDemoData = forceDemo || globalDemoEnabled

  useEffect(() => {
    if (isPaused || forceDemo) {
      setRefreshInterval(Number.MAX_SAFE_INTEGER)
    } else {
      setRefreshInterval(HISTOGRAM_DEFAULT_POLL_MS)
    }
  }, [isPaused, forceDemo])

  useEffect(() => {
    if (hookError) {
      setError(hookError)
      setConsecutiveFailures(prev => prev + 1)
    } else {
      setError(null)
      setConsecutiveFailures(0)
    }
  }, [hookError])

  useReportCardDataState({
    isFailed: error !== null,
    consecutiveFailures,
    errorMessage: error || undefined,
    isLoading,
    isDemoData: effectiveIsDemoData,
    hasData: (data?.histogram?.length ?? 0) > 0,
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  const handleSortChange = (newSort: 'count' | 'pattern') => {
    setSortBy(newSort)
  }

  const handleRefreshIntervalChange = (newInterval: number) => {
    setRefreshInterval(newInterval)
  }

  if (authIsLoading) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <p className="text-gray-500">Please log in to view quantum data</p>
        <button
          onClick={login}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Continue with GitHub
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Execution Histogram</h3>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 hover:bg-accent/20 rounded-lg disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="text-center py-8 text-muted-foreground">
          <p>No execution results available yet</p>
          <p className="text-xs mt-2">Run a quantum circuit to see the histogram</p>
        </div>
      </div>
    )
  }

  const chartOption = {
    responsive: true,
    maintainAspectRatio: true,
    color: COLORS,
    grid: {
      left: '10%',
      right: '10%',
      top: '10%',
      bottom: '15%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const param = params[0]
        const pattern = data.histogram[param.dataIndex]?.pattern ?? ''
        const count = param.value
        const prob = data.histogram[param.dataIndex]?.probability ?? 0
        return `Pattern: ${pattern}<br/>Count: ${count}<br/>Probability: ${(prob * 100).toFixed(1)}%`
      },
    },
    xAxis: {
      type: 'category',
      data: (data.histogram || []).map((entry: any) => entry.pattern),
      axisLabel: { rotate: 45, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: 'Counts',
    },
    series: [
      {
        data: (data.histogram || []).map((entry: any) => entry.count),
        type: 'bar',
        itemStyle: {
          color: (params: any) => COLORS[params.dataIndex % COLORS.length],
        },
      },
    ],
  }

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Execution Histogram</h3>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-2 hover:bg-accent/20 rounded-lg disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sort Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => handleSortChange('count')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            sortBy === 'count'
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          By Frequency
        </button>
        <button
          onClick={() => handleSortChange('pattern')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            sortBy === 'pattern'
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          By Pattern
        </button>
      </div>

      {/* Refresh Interval Control */}
      <div className="bg-secondary/30 rounded-lg p-3 border border-border">
        <Slider
          label="Refresh Interval"
          value={refreshInterval}
          onChange={(e) => handleRefreshIntervalChange(Number(e.currentTarget.value))}
          min={HISTOGRAM_POLL_MIN_MS}
          max={HISTOGRAM_POLL_MAX_MS}
          step={500}
          unit=" ms"
        />
      </div>

      {/* Metadata */}
      <div className="text-xs text-muted-foreground flex gap-4">
        <span>Patterns: {data.num_patterns}</span>
        <span>Total Shots: {data.total_shots}</span>
        <span>Qubits: {data.num_qubits}</span>
      </div>

      {/* ECharts Vertical Bar Chart */}
      <div className="flex-1 min-h-[300px]">
        <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
      </div>

      {/* Timestamp */}
      {data.timestamp && (
        <div className="text-xs text-muted-foreground text-center">
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
