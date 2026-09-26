import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { queryClient } from './queries.ts'
import { Viewer } from './router.tsx'
import './styles.css'

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
