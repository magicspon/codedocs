import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient } from './queries.ts'
import { Viewer } from './router.tsx'
import { inject } from '@vercel/analytics'

import './styles.css'

// Only the public site counts visits. The embed page ships inside codedocs,
// which must never reach the network (ADR 0011), and its CSP would block it.
if (import.meta.env.MODE === 'web') inject()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* With reduced motion asked for, panels fade rather than move. */}
      <MotionConfig reducedMotion="user">
        <Viewer />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
