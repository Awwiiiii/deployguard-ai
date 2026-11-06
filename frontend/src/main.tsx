import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreferencesProvider } from './lib/preferences'
import { ToastProvider } from './components/ui'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './styles.css'
import App from './App'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } })
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><PreferencesProvider><BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter></PreferencesProvider></QueryClientProvider></React.StrictMode>)
