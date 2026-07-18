import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import pretendardWoff2Url from 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2?url'
import App from './App.tsx'
import { queryClient } from './lib/query-client.ts'

// ?url을 통해 Vite가 빌드 시 부여하는 해시 파일명을 그대로 받아 프리로드한다 —
// 정적 <link> 하드코딩은 프로덕션 해시와 어긋날 수 있어 이 방식을 쓴다.
const fontPreload = document.createElement('link')
fontPreload.rel = 'preload'
fontPreload.as = 'font'
fontPreload.type = 'font/woff2'
fontPreload.crossOrigin = 'anonymous'
fontPreload.href = pretendardWoff2Url
document.head.appendChild(fontPreload)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
