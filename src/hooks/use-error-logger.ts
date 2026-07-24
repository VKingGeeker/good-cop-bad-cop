import { useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Network } from '@/network'

export interface LogEntry {
  id: string
  timestamp: string
  level: 'error' | 'warn' | 'info'
  message: string
  stack?: string
  submitted: boolean
}

const STORAGE_KEY = 'systemErrorLogs'
const MAX_LOGS = 200

/**
 * 生成唯一 ID
 */
const genId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 格式化时间戳
 */
const formatTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * 从存储恢复日志
 */
const loadFromStorage = (): LogEntry[] => {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 保存日志到存储
 */
const saveToStorage = (logs: LogEntry[]) => {
  try {
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(logs.slice(-MAX_LOGS)))
  } catch {
    // 存储失败静默处理
  }
}

/**
 * 错误日志管理 Hook
 * - 拦截 console.error、window.onerror、unhandledrejection
 * - 本地持久化存储
 * - 提供错误计数和提交功能
 */
export const useErrorLogger = () => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [errorCount, setErrorCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const isInitializedRef = useRef(false)

  // 添加日志
  const addLog = useCallback((level: LogEntry['level'], message: string, stack?: string) => {
    const entry: LogEntry = {
      id: genId(),
      timestamp: formatTime(new Date()),
      level,
      message,
      stack,
      submitted: false,
    }
    setLogs((prev) => {
      const next = [...prev, entry].slice(-MAX_LOGS)
      saveToStorage(next)
      return next
    })
  }, [])

  // 初始化：恢复存储 + 安装全局错误监听
  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    // 恢复历史日志
    const stored = loadFromStorage()
    if (stored.length > 0) {
      setLogs(stored)
    }

    // 拦截 console.error
    const originalError = console.error
    console.error = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      addLog('error', msg)
      originalError.apply(console, args)
    }

    // 拦截 console.warn
    const originalWarn = console.warn
    console.warn = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      addLog('warn', msg)
      originalWarn.apply(console, args)
    }

    // window.onerror
    const onError = (event: ErrorEvent) => {
      addLog('error', `${event.message} (${event.filename}:${event.lineno}:${event.colno})`, event.error?.stack)
    }
    window.addEventListener('error', onError)

    // unhandledrejection
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const msg = typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
      addLog('error', `Unhandled Promise Rejection: ${msg}`, reason?.stack)
    }
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      console.error = originalError
      console.warn = originalWarn
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [addLog])

  // 计算未提交的错误数
  useEffect(() => {
    const count = logs.filter((l) => l.level === 'error' && !l.submitted).length
    setErrorCount(count)
  }, [logs])

  // 清空日志
  const clearLogs = useCallback(() => {
    setLogs([])
    Taro.removeStorageSync(STORAGE_KEY)
  }, [])

  // 标记已提交
  const markSubmitted = useCallback((ids: string[]) => {
    setLogs((prev) => {
      const next = prev.map((l) => (ids.includes(l.id) ? { ...l, submitted: true } : l))
      saveToStorage(next)
      return next
    })
  }, [])

  // 提交错误日志到服务器
  const submitLogs = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    const errorLogs = logs.filter((l) => l.level === 'error' && !l.submitted)
    if (errorLogs.length === 0) {
      return { success: false, message: '没有未提交的错误日志' }
    }

    setSubmitting(true)
    try {
      const payload = {
        logs: errorLogs.map((l) => ({
          errorTime: l.timestamp,
          logDetail: l.stack ? `${l.message}\n${l.stack}` : l.message,
        })),
      }

      const res = await Network.request({
        url: '/api/error-log/submit',
        method: 'POST',
        data: payload,
      })

      const result = res.data as any
      if (result.code === 0) {
        markSubmitted(errorLogs.map((l) => l.id))
        return { success: true, message: `成功提交 ${errorLogs.length} 条错误日志` }
      } else {
        return { success: false, message: result.msg || '提交失败' }
      }
    } catch (err) {
      return { success: false, message: `网络错误: ${err.message || err}` }
    } finally {
      setSubmitting(false)
    }
  }, [logs, markSubmitted])

  return {
    logs,
    errorCount,
    submitting,
    addLog,
    clearLogs,
    submitLogs,
  }
}
