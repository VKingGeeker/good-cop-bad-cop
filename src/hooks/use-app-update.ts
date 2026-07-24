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
const STORAGE_DOWNLOADED_VERSION = 'updateDownloadedVersion' // 记录下载完成时的版本号

/**
 * 检测是否在 Capacitor 原生环境
 */
const isNativePlatform = (): boolean => {
  const capacitor = (typeof window !== 'undefined') ? (window as any).Capacitor : null
  return capacitor?.isNativePlatform?.() === true
}

/**
 * 获取 Capacitor 插件
 */
const getApkInstaller = (): any => {
  const capacitor = (typeof window !== 'undefined') ? (window as any).Capacitor : null
  return capacitor?.Plugins?.ApkInstaller
}

/**
 * 模块级下载状态（不随组件卸载而丢失，同一页面会话内持久）
 */
const downloadState = {
  blob: null as Blob | null,
  xhr: null as XMLHttpRequest | null,
  progressListener: null as any,
  downloadedBytes: 0,
  totalSize: 0,
}

/**
 * APP 更新管理 Hook
 *
 * 功能：
 * - 检查版本更新（支持静默检查，不弹窗不提示）
 * - 下载 APK（支持断点续传）
 * - 实时进度跟踪
 * - 下载状态持久化（localStorage）
 * - 安装 APK（授权后自动重试安装）
 *
 * 下载机制（双模式）：
 * - 原生环境（Capacitor）：通过 ApkInstaller.download() 原生下载（带进度回调），install() 安装
 * - H5 环境：通过 XMLHttpRequest 下载到 Blob，<a download> 安装
 *
 * 安装流程（原生环境）：
 * 1. 用户点击"安装" → 调用 ApkInstaller.install()
 * 2. 若无安装权限 → 跳转设置页，设置 pendingInstall 标记
 * 3. 用户授权后返回 → visibilitychange 事件触发 → 自动重试 install()
 * 4. 若有权限 → 打开系统安装界面
 */
export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<DownloadStatus>('idle')
  const [checking, setChecking] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const mountedRef = useRef(true)

  // 安装流程控制 refs
  const pendingInstallRef = useRef(false)    // 是否等待权限授权后自动重试
  const installInProgressRef = useRef(false)  // 防止重复点击

  // 组件挂载时从存储恢复状态 + 静默检查更新
  useEffect(() => {
    mountedRef.current = true
    const isNative = isNativePlatform()
    const savedComplete = Taro.getStorageSync(STORAGE_COMPLETE)
    const savedVersion = Taro.getStorageSync(STORAGE_DOWNLOADED_VERSION) as string

    if (savedComplete) {
      // 已下载完成：检查下载的版本是否与当前 APP 版本一致
      if (!savedVersion || savedVersion === APP_VERSION) {
        // 无版本记录（旧版下载遗留）或下载版本=当前版本（已安装）→ 清理
        Taro.removeStorageSync(STORAGE_COMPLETE)
        Taro.removeStorageSync(STORAGE_PROGRESS)
        Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
        Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
        Taro.removeStorageSync(STORAGE_DOWNLOADED_VERSION)
        setProgress(0)
        setStatus('idle')
      } else {
        // 下载版本 ≠ 当前版本 → 保留状态，用户可能还没安装
        setProgress(100)
        setStatus('completed')
      }
    } else {
      const savedProgress = Taro.getStorageSync(STORAGE_PROGRESS) || 0
      if (savedProgress > 0) {
        if (isNative) {
          setProgress(savedProgress)
          setStatus('paused')
        } else if (downloadState.blob && downloadState.downloadedBytes > 0) {
          setProgress(savedProgress)
          setStatus('paused')
        } else {
          Taro.removeStorageSync(STORAGE_PROGRESS)
          Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
          Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
          setProgress(0)
          setStatus('idle')
        }
      }
    }

    // 静默检查更新（不弹窗、不提示）
    silentCheckUpdate()

    return () => {
      mountedRef.current = false
    }
  }, [])

  /** 静默检查更新（仅设置 hasUpdate 标记，不弹窗不提示） */
  const silentCheckUpdate = useCallback(async () => {
    try {
      const res = await Network.request({ url: '/api/app/version' })
      const result = res.data as any
      if (result.code === 0 && result.data) {
        const info = result.data as UpdateInfo
        setUpdateInfo(info)
        downloadState.totalSize = info.apkSize
        if (info.version && info.version !== APP_VERSION) {
          setHasUpdate(true)
          // 服务器有新版本：检查本地下载的版本是否匹配
          const savedVersion = Taro.getStorageSync(STORAGE_DOWNLOADED_VERSION) as string
          if (!savedVersion || savedVersion !== info.version) {
            // 无版本记录或本地下载的是旧版本 APK → 清理，强制重新下载
            Taro.removeStorageSync(STORAGE_COMPLETE)
            Taro.removeStorageSync(STORAGE_PROGRESS)
            Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
            Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
            Taro.removeStorageSync(STORAGE_DOWNLOADED_VERSION)
            setProgress(0)
            setStatus('idle')
          }
        } else {
          setHasUpdate(false)
        }
      }
    } catch {
      // 静默检查失败，不做任何提示
    }
  }, [])

  /** 检查版本更新（用户手动点击，弹窗+提示） */
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
          setHasUpdate(true)
          // 服务器有新版本：检查本地下载的版本是否匹配
          const savedVersion = Taro.getStorageSync(STORAGE_DOWNLOADED_VERSION) as string
          if (!savedVersion || savedVersion !== info.version) {
            // 无版本记录或本地下载的是旧版本 APK → 清理，强制重新下载
            Taro.removeStorageSync(STORAGE_COMPLETE)
            Taro.removeStorageSync(STORAGE_PROGRESS)
            Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
            Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
            Taro.removeStorageSync(STORAGE_DOWNLOADED_VERSION)
            setProgress(0)
            setStatus('idle')
          }
          setShowDialog(true)
        } else {
          setHasUpdate(false)
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

  /** 原生环境下载：通过 ApkInstaller 插件下载，带进度回调 */
  const startNativeDownload = useCallback(() => {
    if (!updateInfo?.downloadUrl) return
    if (status === 'downloading') return
    if (status === 'completed') return
    const ApkInstaller = getApkInstaller()
    if (!ApkInstaller) {
      Taro.showToast({ title: '下载插件未就绪', icon: 'none' })
      return
    }

    const url = buildDownloadUrl(updateInfo.downloadUrl)

    downloadState.progressListener = ApkInstaller.addListener('apkDownloadProgress', (data: any) => {
      if (!mountedRef.current) return
      const pct = data?.progress ?? 0
      setProgress(pct)
      Taro.setStorageSync(STORAGE_PROGRESS, pct)
      Taro.setStorageSync(STORAGE_DOWNLOADED_BYTES, data?.downloadedBytes ?? 0)
      Taro.setStorageSync(STORAGE_TOTAL_SIZE, data?.totalBytes ?? 0)
    })

    setStatus('downloading')

    ApkInstaller.download({ url }).then((result: any) => {
      if (!mountedRef.current) return
      if (result?.success) {
        setProgress(100)
        setStatus('completed')
        Taro.setStorageSync(STORAGE_COMPLETE, true)
        Taro.setStorageSync(STORAGE_PROGRESS, 100)
        Taro.setStorageSync(STORAGE_DOWNLOADED_VERSION, updateInfo.version)
      }
    }).catch((err: any) => {
      if (!mountedRef.current) return
      const msg = err?.message || ''
      if (msg.includes('取消')) {
        setStatus('paused')
      } else {
        setStatus('error')
      }
    }).finally(() => {
      if (downloadState.progressListener) {
        downloadState.progressListener.remove()
        downloadState.progressListener = null
      }
    })
  }, [updateInfo, status, buildDownloadUrl])

  /** H5 环境下载：通过 XMLHttpRequest 下载到 Blob */
  const startH5Download = useCallback(() => {
    if (!updateInfo?.downloadUrl) return
    if (status === 'downloading') return
    if (status === 'completed') return

    const url = buildDownloadUrl(updateInfo.downloadUrl)

    const canResume = downloadState.blob !== null && downloadState.downloadedBytes > 0
    const startByte = canResume ? downloadState.downloadedBytes : 0

    if (!canResume) {
      downloadState.downloadedBytes = 0
      downloadState.blob = null
      setProgress(0)
      Taro.setStorageSync(STORAGE_PROGRESS, 0)
      Taro.setStorageSync(STORAGE_DOWNLOADED_BYTES, 0)
    }

    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'blob'

    if (canResume && startByte > 0) {
      xhr.setRequestHeader('Range', `bytes=${startByte}-`)
    }

    xhr.onprogress = (event) => {
      if (!mountedRef.current) return
      const loaded = startByte + event.loaded
      const total = downloadState.totalSize || (startByte + event.total)
      if (total > 0) {
        const pct = Math.min(100, Math.round((loaded / total) * 100))
        setProgress(pct)
        Taro.setStorageSync(STORAGE_PROGRESS, pct)
        Taro.setStorageSync(STORAGE_DOWNLOADED_BYTES, loaded)
        Taro.setStorageSync(STORAGE_TOTAL_SIZE, total)
      }
    }

    xhr.onload = () => {
      if (!mountedRef.current) return
      if (xhr.status === 200 || xhr.status === 206) {
        const newChunk = xhr.response as Blob
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
        Taro.setStorageSync(STORAGE_DOWNLOADED_VERSION, updateInfo.version)
      } else {
        setStatus('error')
      }
    }

    xhr.onerror = () => {
      if (!mountedRef.current) return
      setStatus('error')
    }

    xhr.onabort = () => {
      if (!mountedRef.current) return
      setStatus('paused')
    }

    downloadState.xhr = xhr
    setStatus('downloading')
    xhr.send()
  }, [updateInfo, status, buildDownloadUrl])

  /** 开始/恢复下载 */
  const startDownload = useCallback(() => {
    if (isNativePlatform()) {
      startNativeDownload()
    } else {
      startH5Download()
    }
  }, [startNativeDownload, startH5Download])

  /** 取消下载（保存进度） */
  const cancelDownload = useCallback(() => {
    if (isNativePlatform()) {
      const ApkInstaller = getApkInstaller()
      ApkInstaller?.cancelDownload()
      if (downloadState.progressListener) {
        downloadState.progressListener.remove()
        downloadState.progressListener = null
      }
    } else {
      if (downloadState.xhr) {
        downloadState.xhr.abort()
        downloadState.xhr = null
      }
    }
    setStatus('paused')
  }, [])

  /**
   * 内部：执行原生安装（无状态守卫，可被自动重试调用）
   * 处理安装权限：若无权限则跳转设置页，授权后通过 visibilitychange 自动重试
   */
  const doNativeInstall = useCallback(() => {
    const ApkInstaller = getApkInstaller()
    if (!ApkInstaller) {
      Taro.showToast({ title: '安装插件未就绪', icon: 'none' })
      setInstalling(false)
      installInProgressRef.current = false
      return
    }

    ApkInstaller.install().then((result: any) => {
      if (!mountedRef.current) return
      if (result?.needPermission) {
        // 需要授权 → 设置 pendingInstall，授权返回后自动重试
        pendingInstallRef.current = true
        Taro.showToast({ title: '请授权安装权限，返回后自动安装', icon: 'none', duration: 3000 })
        setInstalling(false)
        installInProgressRef.current = false
      } else if (result?.success) {
        pendingInstallRef.current = false
        Taro.showToast({ title: '安装界面已打开', icon: 'none' })
        setInstalling(false)
        installInProgressRef.current = false
      }
    }).catch((err: any) => {
      if (!mountedRef.current) return
      pendingInstallRef.current = false
      const msg = err?.message || '安装失败'
      if (msg.includes('安装包不存在')) {
        Taro.removeStorageSync(STORAGE_COMPLETE)
        Taro.removeStorageSync(STORAGE_DOWNLOADED_VERSION)
        setProgress(0)
        setStatus('idle')
      }
      Taro.showToast({ title: msg, icon: 'none' })
      setInstalling(false)
      installInProgressRef.current = false
    })
  }, [])

  /**
   * 监听应用回到前台：若 pendingInstall 为 true，自动重试安装
   * 场景：用户跳转设置页授权后返回 APP
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pendingInstallRef.current) {
        pendingInstallRef.current = false
        // 延迟 500ms 确保 WebView 完全恢复
        setTimeout(() => {
          if (!mountedRef.current) return
          if (isNativePlatform()) {
            installInProgressRef.current = true
            setInstalling(true)
            doNativeInstall()
          }
        }, 500)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [doNativeInstall])

  /** 安装 APK（用户点击触发） */
  const installApk = useCallback(() => {
    if (!updateInfo?.downloadUrl) return
    if (installInProgressRef.current) return

    installInProgressRef.current = true
    setInstalling(true)

    if (isNativePlatform()) {
      doNativeInstall()
    } else {
      if (!downloadState.blob) {
        Taro.showToast({ title: '安装包未就绪，请重新下载', icon: 'none' })
        Taro.removeStorageSync(STORAGE_COMPLETE)
        setProgress(0)
        setStatus('idle')
        setInstalling(false)
        installInProgressRef.current = false
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
        installInProgressRef.current = false
      }
    }
  }, [updateInfo, doNativeInstall])

  /** 关闭弹窗（如果正在下载，中止并保存进度） */
  const closeDialog = useCallback(() => {
    if (status === 'downloading') {
      cancelDownload()
    }
    setShowDialog(false)
  }, [status, cancelDownload])

  /** 重置下载状态 */
  const resetDownload = useCallback(() => {
    if (isNativePlatform()) {
      const ApkInstaller = getApkInstaller()
      ApkInstaller?.cancelDownload()
      if (downloadState.progressListener) {
        downloadState.progressListener.remove()
        downloadState.progressListener = null
      }
    } else {
      if (downloadState.xhr) {
        downloadState.xhr.abort()
        downloadState.xhr = null
      }
      downloadState.blob = null
      downloadState.downloadedBytes = 0
    }
    Taro.removeStorageSync(STORAGE_COMPLETE)
    Taro.removeStorageSync(STORAGE_PROGRESS)
    Taro.removeStorageSync(STORAGE_DOWNLOADED_BYTES)
    Taro.removeStorageSync(STORAGE_TOTAL_SIZE)
    Taro.removeStorageSync(STORAGE_DOWNLOADED_VERSION)
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
    hasUpdate,
    checkUpdate,
    startDownload,
    cancelDownload,
    installApk,
    closeDialog,
    resetDownload,
    setShowDialog,
  }
}
