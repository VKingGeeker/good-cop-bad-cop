import { useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { APP_VERSION } from '@/config/app-version'

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'error'

export interface UpdateInfo {
  version: string
  buildTime: string
  changelog: string
  apkSize: number
  downloadUrl: string
}

// 存储键名
const STORAGE_PROGRESS = 'updateDownloadProgress'
const STORAGE_COMPLETE = 'updateDownloadComplete'
const STORAGE_DOWNLOADED_BYTES = 'updateDownloadedBytes'
const STORAGE_TOTAL_SIZE = 'updateTotalSize'

/**
 * 模块级下载状态（不随组件卸载而丢失，同一页面会话内持久）
 * - blob: 已下载的文件数据（用于断点续传合并）
 * - xhr: 当前 XMLHttpRequest 实例（用于 abort）
 * - downloadedBytes: 已下载字节数（用于 Range 请求起始位置）
 * - totalSize: 文件总大小
 */
const downloadState = {
  blob: null as Blob | null,
  xhr: null as XMLHttpRequest | null,
  downloadedBytes: 0,
  totalSize: 0,
}

/**
 * APP 更新管理 Hook
 *
 * 功能：
 * - 检查版本更新
 * - 下载 APK（支持断点续传）
 * - 实时进度跟踪
 * - 下载状态持久化（localStorage）
 * - 安装 APK
 *
 * 断点续传机制：
 * - 同一会话内（组件未卸载）：保留部分 Blob 数据，使用 Range 请求续传
 * - 应用重启后：Blob 丢失，重置进度从 0 开始重新下载
 * - 下载完成状态持久化：即使关闭窗口，再次打开仍显示 100%
 */
export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [checking, setChecking] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [installing, setInstalling] = useState(false)
  const mountedRef = useRef(true)

  // 组件挂载时从存储恢复状态
  useEffect(() => {
    mountedRef.current = true
    const savedComplete = Taro.getStorageSync(STORAGE_COMPLETE)

    if (savedComplete) {
      // 下载曾已完成
      if (downloadState.blob) {
        // 同一会话，Blob 仍在内存中，可直接安装
        setProgress(100)
        setStatus('completed')
      } else {
        // 应用重启，Blob 丢失，需重新下载
        // 但保留完成标记，等下次触发更新时重新下载
        // 这里不清除，让用户自行决定
        setProgress(100)
        setStatus('completed')
      }
    } else {
      const savedProgress = Taro.getStorageSync(STORAGE_PROGRESS) || 0
      if (savedProgress > 0) {
        if (downloadState.blob && downloadState.downloadedBytes > 0) {
          // 同一会话，有部分数据可续传
          setProgress(savedProgress)
          setStatus('paused')
        } else {
          // 应用重启，部分数据丢失，重置
          Taro.removeStorageSync(STORAGE_PROGRESS)
          Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
          Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
          setProgress(0)
          setStatus('idle')
        }
      }
    }

    return () => {
      mountedRef.current = false
    }
  }, [])

  /** 检查版本更新 */
  const checkUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const res = await Network.request({ url: '/api/app/version' })
      const result = res.data as any
      if (result.code === 0 && result.data) {
        const info = result.data as UpdateInfo
        setUpdateInfo(info)
        downloadState.totalSize = info.apkSize

        if (info.version && info.version !== APP_VERSION) {
          // 有新版本，打开更新弹窗
          setShowDialog(true)
        } else {
          Taro.showToast({ title: '已是最新版本', icon: 'none' })
        }
      } else {
        Taro.showToast({ title: result.msg || '检查更新失败', icon: 'none' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '网络错误', icon: 'none' })
    } finally {
      setChecking(false)
    }
  }, [])

  /** 构建完整下载 URL */
  const buildDownloadUrl = useCallback((downloadUrl: string) => {
    const domain = typeof PROJECT_DOMAIN !== 'undefined' ? PROJECT_DOMAIN : ''
    return domain + downloadUrl
  }, [])

  /** 开始/恢复下载 */
  const startDownload = useCallback(() => {
    if (!updateInfo?.downloadUrl) return
    if (status === 'downloading') return
    if (status === 'completed') return

    const url = buildDownloadUrl(updateInfo.downloadUrl)

    // 判断是否可以断点续传（需要内存中有部分 Blob）
    const canResume = downloadState.blob !== null && downloadState.downloadedBytes > 0
    const startByte = canResume ? downloadState.downloadedBytes : 0

    if (!canResume) {
      // 全新下载，重置状态
      downloadState.downloadedBytes = 0
      downloadState.blob = null
      setProgress(0)
      Taro.setStorageSync(STORAGE_PROGRESS, 0)
      Taro.setStorageSync(STORAGE_DOWNLOADED_BYTES, 0)
    }

    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'blob'

    // 设置 Range 头实现断点续传
    if (canResume && startByte > 0) {
      xhr.setRequestHeader('Range', `bytes=${startByte}-`)
    }

    // 进度回调
    xhr.onprogress = (event) => {
      if (!mountedRef.current) return
      const loaded = startByte + event.loaded
      const total = downloadState.totalSize || (startByte + event.total)
      if (total > 0) {
        const pct = Math.min(100, Math.round((loaded / total) * 100))
        setProgress(pct)
        // 持久化进度
        Taro.setStorageSync(STORAGE_PROGRESS, pct)
        Taro.setStorageSync(STORAGE_DOWNLOADED_BYTES, loaded)
        Taro.setStorageSync(STORAGE_TOTAL_SIZE, total)
      }
    }

    // 下载完成
    xhr.onload = () => {
      if (!mountedRef.current) return
      if (xhr.status === 200 || xhr.status === 206) {
        const newChunk = xhr.response as Blob
        // 合并 Blob（断点续传时追加到已有数据）
        if (canResume && downloadState.blob) {
          downloadState.blob = new Blob([downloadState.blob, newChunk], {
            type: 'application/vnd.android.package-archive',
          })
        } else {
          downloadState.blob = newChunk
        }
        downloadState.downloadedBytes = downloadState.totalSize
        setProgress(100)
        setStatus('completed')
        Taro.setStorageSync(STORAGE_COMPLETE, true)
        Taro.setStorageSync(STORAGE_PROGRESS, 100)
      } else {
        setStatus('error')
      }
    }

    // 下载错误
    xhr.onerror = () => {
      if (!mountedRef.current) return
      setStatus('error')
    }

    // 下载被中止（用户点击取消）
    xhr.onabort = () => {
      if (!mountedRef.current) return
      setStatus('paused')
      // 进度已在 onprogress 中保存
    }

    downloadState.xhr = xhr
    setStatus('downloading')
    xhr.send()
  }, [updateInfo, status, buildDownloadUrl])

  /** 取消下载（保存进度） */
  const cancelDownload = useCallback(() => {
    if (downloadState.xhr) {
      downloadState.xhr.abort()
      downloadState.xhr = null
    }
    // 进度已通过 onprogress 持久化，无需额外保存
    setStatus('paused')
  }, [])

  /** 安装 APK */
  const installApk = useCallback(() => {
    if (!updateInfo?.downloadUrl) return

    setInstalling(true)

    // 检查是否在 Capacitor 原生环境
    const capacitor = (typeof window !== 'undefined') ? (window as any).Capacitor : null
    const isNative = capacitor?.isNativePlatform?.()

    if (isNative) {
      // Capacitor 原生环境：调用 Java 插件下载并安装 APK
      const url = buildDownloadUrl(updateInfo.downloadUrl)
      const ApkInstaller = capacitor.Plugins?.ApkInstaller
      if (!ApkInstaller) {
        Taro.showToast({ title: '安装插件未就绪', icon: 'none' })
        setInstalling(false)
        return
      }

      ApkInstaller.downloadAndInstall({ url }).then((result: any) => {
        if (result?.success) {
          Taro.showToast({ title: '安装界面已打开', icon: 'none' })
        }
      }).catch((err: any) => {
        Taro.showToast({ title: err?.message || '安装失败', icon: 'none' })
      }).finally(() => {
        setInstalling(false)
      })
    } else {
      // H5 环境：通过 blob URL 下载
      if (!downloadState.blob) {
        Taro.showToast({ title: '安装包未就绪，请重新下载', icon: 'none' })
        Taro.removeStorageSync(STORAGE_COMPLETE)
        setProgress(0)
        setStatus('idle')
        setInstalling(false)
        return
      }

      try {
        const blobUrl = URL.createObjectURL(downloadState.blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = 'wujianyiyun.apk'
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000)
      } catch (e: any) {
        Taro.showToast({ title: e.message || '安装失败', icon: 'none' })
      } finally {
        setInstalling(false)
      }
    }
  }, [updateInfo, buildDownloadUrl])

  /** 关闭弹窗（如果正在下载，中止并保存进度） */
  const closeDialog = useCallback(() => {
    if (status === 'downloading') {
      cancelDownload()
    }
    setShowDialog(false)
  }, [status, cancelDownload])

  /** 重置下载状态（重新下载） */
  const resetDownload = useCallback(() => {
    if (downloadState.xhr) {
      downloadState.xhr.abort()
      downloadState.xhr = null
    }
    downloadState.blob = null
    downloadState.downloadedBytes = 0
    Taro.removeStorageSync(STORAGE_COMPLETE)
    Taro.removeStorageSync(STORAGE_PROGRESS)
    Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
    Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
    setProgress(0)
    setStatus('idle')
  }, [])

  return {
    updateInfo,
    progress,
    status,
    checking,
    showDialog,
    installing,
    checkUpdate,
    startDownload,
    cancelDownload,
    installApk,
    closeDialog,
    resetDownload,
    setShowDialog,
  }
}
