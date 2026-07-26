import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText, CircleAlert, Upload, Check, LoaderCircle } from 'lucide-react-taro'
import { useErrorLogger, LogEntry } from '@/hooks/use-error-logger'
import Taro from '@tarojs/taro'

const getLevelColor = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return '#ef4444'
    case 'warn': return '#f59e0b'
    default: return '#3b82f6'
  }
}

const getLevelLabel = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return 'ERROR'
    case 'warn': return 'WARN'
    default: return 'INFO'
  }
}

const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

const isTouchDevice = () => {
  if (isWeapp) return true
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0
}

const BUTTON_WIDTH = 120
const BUTTON_HEIGHT = 40

const getScreenSize = () => {
  try {
    if (typeof window !== 'undefined' && window.innerWidth) {
      return { width: window.innerWidth, height: window.innerHeight }
    }
    const sysInfo = Taro.getSystemInfoSync()
    return { width: sysInfo.windowWidth || 375, height: sysInfo.windowHeight || 667 }
  } catch {
    return { width: 375, height: 667 }
  }
}

export const FloatingLogButton = () => {
  const { logs, errorCount, submitting, submitLogs, clearLogs } = useErrorLogger()
  const [showDialog, setShowDialog] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)
  const [screenSize, setScreenSize] = useState(getScreenSize())

  const [pos, setPos] = useState({ x: 20, y: 200 })
  const dragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  })
  const dialogOpenTimeRef = useRef(0)

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      dialogOpenTimeRef.current = Date.now()
      setShowDialog(true)
    } else {
      if (Date.now() - dialogOpenTimeRef.current < 400) {
        return
      }
      setShowDialog(false)
    }
  }, [])

  useEffect(() => {
    setScreenSize(getScreenSize())
    
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setScreenSize(getScreenSize())
      }
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (isTouchDevice()) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true
      }
      const newX = dragRef.current.startPosX + dx
      const newY = dragRef.current.startPosY + dy
      const maxX = screenSize.width - BUTTON_WIDTH
      const maxY = screenSize.height - BUTTON_HEIGHT - 60
      setPos({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      if (!dragRef.current.moved) {
        handleDialogOpenChange(true)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [screenSize, handleDialogOpenChange])

  const onMouseDown = useCallback((e: MouseEvent) => {
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
  }, [pos])

  const onTouchStart = useCallback((e: any) => {
    const touch = e.touches ? e.touches[0] : e
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: touch.clientX || touch.pageX,
      startY: touch.clientY || touch.pageY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
  }, [pos])

  const onTouchMove = useCallback((e: any) => {
    if (!dragRef.current.dragging) return
    const touch = e.touches ? e.touches[0] : e
    const clientX = touch.clientX || touch.pageX
    const clientY = touch.clientY || touch.pageY
    const dx = clientX - dragRef.current.startX
    const dy = clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true
    }
    const newX = dragRef.current.startPosX + dx
    const newY = dragRef.current.startPosY + dy
    const maxX = screenSize.width - BUTTON_WIDTH
    const maxY = screenSize.height - BUTTON_HEIGHT - 60
    setPos({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    })
  }, [pos, screenSize])

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    if (!dragRef.current.moved) {
      handleDialogOpenChange(true)
    }
  }, [handleDialogOpenChange])

  const handleSubmit = useCallback(async () => {
    const result = await submitLogs()
    setSubmitResult(result)
    if (result.success) {
      Taro.showToast({ title: result.message, icon: 'success' })
      setTimeout(() => setSubmitResult(null), 3000)
    } else {
      Taro.showToast({ title: result.message, icon: 'none' })
    }
  }, [submitLogs])

  const sortedLogs = [...logs].reverse()
  const hasErrors = errorCount > 0

  return (
    <>
      <View
        style={{
          position: 'fixed',
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '24px',
          backgroundColor: hasErrors ? 'rgba(239, 68, 68, 0.7)' : 'rgba(30, 41, 59, 0.6)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        }}
        {...(isTouchDevice() ? {
          onTouchStart,
          onTouchMove,
          onTouchEnd,
        } : {
          onMouseDown,
          onClick: () => handleDialogOpenChange(true),
        })}
      >
        {hasErrors ? (
          <CircleAlert size={18} color="#fff" />
        ) : (
          <FileText size={18} color="#cbd5e1" />
        )}
        <Text style={{ fontSize: '13px', color: '#fff', whiteSpace: 'nowrap' }}>
          {hasErrors ? '错误日志' : '查看日志'}
        </Text>
        {hasErrors && (
          <View
            style={{
              minWidth: '20px',
              height: '20px',
              borderRadius: '10px',
              backgroundColor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
            }}
          >
            <Text style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444' }}>
              {errorCount}
            </Text>
          </View>
        )}
      </View>

      <Dialog open={showDialog} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-w-[90vw] w-full"
          style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={20} color="#3b82f6" />
              <Text className="block">系统日志</Text>
              {errorCount > 0 && (
                <View
                  style={{
                    backgroundColor: '#ef4444',
                    borderRadius: '10px',
                    padding: '2px 8px',
                  }}
                >
                  <Text className="block text-white text-xs font-bold">
                    {errorCount} 个错误
                  </Text>
                </View>
              )}
            </DialogTitle>
          </DialogHeader>

          <View style={{ flex: 1, overflow: 'auto', minHeight: '200px', maxHeight: '50vh' }}>
            {sortedLogs.length === 0 ? (
              <View style={{ textAlign: 'center', padding: '40px 0' }}>
                <Text className="block text-gray-400 text-sm">暂无日志记录</Text>
              </View>
            ) : (
              <ScrollView scrollY style={{ height: '100%' }}>
                {sortedLogs.map((log) => (
                  <View
                    key={log.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      padding: '10px 4px',
                    }}
                  >
                    <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <View
                        style={{
                          backgroundColor: getLevelColor(log.level),
                          borderRadius: '4px',
                          padding: '1px 6px',
                        }}
                      >
                        <Text className="block text-white text-xs font-bold">
                          {getLevelLabel(log.level)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {log.timestamp}
                      </Text>
                      {log.submitted && (
                        <Check size={14} color="#22c55e" />
                      )}
                    </View>
                    <Text
                      className="block"
                      style={{
                        fontSize: '13px',
                        color: '#e2e8f0',
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {log.message}
                    </Text>
                    {log.stack && (
                      <Text
                        className="block"
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginTop: '4px',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '60px',
                          overflow: 'hidden',
                        }}
                      >
                        {log.stack.substring(0, 200)}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '10px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                clearLogs()
                Taro.showToast({ title: '日志已清空', icon: 'none' })
              }}
            >
              <Text className="block">清空</Text>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleDialogOpenChange(false)}
            >
              <Text className="block">关闭</Text>
            </Button>
            <Button
              className="flex-1"
              disabled={submitting || errorCount === 0}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <LoaderCircle size={16} color="#fff" className="animate-spin" />
                  <Text className="block ml-1">提交中...</Text>
                </>
              ) : (
                <>
                  <Upload size={16} color="#fff" />
                  <Text className="block ml-1">提交日志</Text>
                </>
              )}
            </Button>
          </View>

          {submitResult && (
            <View
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: submitResult.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                marginTop: '8px',
              }}
            >
              <Text
                className="block"
                style={{
                  fontSize: '13px',
                  color: submitResult.success ? '#22c55e' : '#ef4444',
                }}
              >
                {submitResult.message}
              </Text>
            </View>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}