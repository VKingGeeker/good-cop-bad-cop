import { PropsWithChildren } from 'react'
import { LucideTaroProvider } from 'lucide-react-taro'
import { Toaster } from '@/components/ui/toast'
import '@/app.css'
import { Preset } from './presets'

const App = ({ children }: PropsWithChildren) => {
  return (
    <LucideTaroProvider defaultColor="#e8edf5" defaultSize={24}>
      <Preset>{children}</Preset>
      <Toaster />
    </LucideTaroProvider>
  )
}

export default App