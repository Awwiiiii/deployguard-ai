import { createContext, useContext } from 'react'
import type { Operations } from './api'
export const DataContext = createContext<Operations | null>(null)
export function useData() { const data = useContext(DataContext); if (!data) throw new Error('Operational data provider is missing'); return data }
