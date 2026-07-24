import { useState, useRef, useCallback } from 'react'
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

/**
 * 获取日志等级颜色
 */
const getLevelColor = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return '#ef4444'
    case 'warn': return '#f59e0b'
    default: return '#3b82f6'
  }
}

/**
 * 获取日志等级标签
 */
const getLevelLabel = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return 'ERROR'
    case 'warn': return 'WARN'
    default: return 'INFO'
  }
}

/**
 * 悬浮日志按钮组件
 * - 可拖动位置
 * - 半透明不影响游戏
 * - 有错误时显示红色图标 + 数量
 * - 点击弹出日志列表
 */
export const FloatingLogButton = () => {
  const { logs, errorCount, submitting, submitLogs, clearLogs } = useErrorLogger()
  const [showDialog, setShowDialog] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null)

  // 拖动状态
  const [pos, setPos] = useState({ x: 20, y: 200 })
  const dragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  })

  // 指针按下：开始拖动
  const onPointerDown = useCallback((e: any) => {
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    }
  }, [pos])

  // 指针移动：更新位置
  const onPointerMove = useCallback((e: any) => {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true
    }
    const newX = dragRef.current.startPosX + dx
    const newY = dragRef.current.startPosY + dy
    // 边界限制
    const maxX = window.innerWidth - 120
    const maxY = window.innerHeight - 50
    setPos({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY)),
    })
  }, [])

  // 指针抬起：结束拖动，如果未移动则视为点击
  const onPointerUp = useCallback((e: any) => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    if (!dragRef.current.moved) {
      // 阻止事件传播，避免 pointer 释放后触发 click 关闭刚打开的弹窗
      if (e) {
        e.stopPropagation?.()
        e.preventDefault?.()
      }
      // 延迟打开弹窗，确保当前事件循环完成
      setTimeout(() => setShowDialog(true), 50)
    }
  }, [])

  // 提交日志
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

  // 倒序日志
  const sortedLogs = [...logs].reverse()

  const hasErrors = errorCount > 0

  return (
    <>
      {/* 悬浮按钮 */}
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
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerMove}
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

      {/* 日志弹窗 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
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

          {/* 日志列表 */}
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

          {/* 底部操作栏 */}
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
              onClick={() => setShowDialog(false)}
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
