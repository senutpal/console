import { describe, it, expect } from 'vitest'
import * as useMCP from '../useMCP'

describe('useMCP barrel', () => {
    it('re-exports expected hooks and utilities', () => {
        // Basic connectivity / status
        expect(useMCP).toHaveProperty('useMCPStatus')
        expect(useMCP).toHaveProperty('useClusters')
        expect(useMCP).toHaveProperty('useClusterHealth')

        // Sub-hooks
        expect(useMCP).toHaveProperty('useWorkloads')
        expect(useMCP).toHaveProperty('usePods')
        expect(useMCP).toHaveProperty('useEvents')
        expect(useMCP).toHaveProperty('useNetworking')
        expect(useMCP).toHaveProperty('useNamespaces')

        // Shared / utils
        expect(useMCP).toHaveProperty('connectSharedWebSocket')
        expect(useMCP).toHaveProperty('clusterCache')
    })
})
