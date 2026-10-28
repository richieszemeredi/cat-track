import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { domMax, LazyMotion, MotionConfig, MotionGlobalConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './lib/auth'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    // Live onSnapshot subscriptions keep the cache fresh; avoid refetch churn.
    queries: { staleTime: 60_000, retry: 1 },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Under Playwright every animation jumps to its end, so the layout suite
// measures where things settle rather than a frame caught mid-flight.
if (navigator.webdriver) MotionGlobalConfig.skipAnimations = true

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing #root element')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* domMax rather than domAnimation: the sliding tab and cat pills are
        layoutId animations, which the smaller bundle leaves out. `strict`
        keeps the full-fat `motion.*` components out — use `m.*`. */}
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </LazyMotion>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
