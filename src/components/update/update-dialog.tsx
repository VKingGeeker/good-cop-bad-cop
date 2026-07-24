import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, Package, CheckCircle, AlertCircle } from 'lucide-react-taro'
import { APP_VERSION } from '@/config/app-version'
import type { UpdateInfo, DownloadStatus } from '@/hooks/use-app-update'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  updateInfo: UpdateInfo | null
  progress: number
  status: DownloadStatus
  installing: boolean
  onStartDownload: () => void
  onInstall: () => void
  onClose: () => void
}

/**
 * 更新下载弹窗组件
 *
 * 功能：
 * - 显示版本信息和中文更新日志（换行分隔）
 * - 实时下载进度条（精确到百分比）
 * - 安装按钮（进度达 100% 时可用，否则置灰）
 * - 取消按钮（中断下载并保存进度）
 *
 * 按钮状态控制：
 * - 进度 < 100%：安装按钮禁用（置灰），取消按钮可用
 * - 进度 = 100%：安装按钮可用，取消按钮置灰
 * - 下载完成关闭后重开：进度条显示 100%，安装按钮可用
 */
export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  progress,
  status,
  installing,
  onStartDownload,
  onInstall,
  onClose,
}: UpdateDialogProps) {
  // 弹窗打开时自动开始/恢复下载（未完成时）
  useEffect(() => {
    if (open && updateInfo && status !== 'completed' && status !== 'downloading') {
      onStartDownload()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCompleted = status === 'completed' || progress >= 100
  const isDownloading = status === 'downloading'
  const isError = status === 'error'

  /** 处理弹窗关闭 */
  const handleClose = () => {
    onClose()
    onOpenChange(false)
  }

  /** 渲染更新日志（按换行符分隔） */
  const renderChangelog = (changelog: string) => {
    const lines = changelog.split('\n').filter((line) => line.trim())
    if (lines.length === 0) return null
    return (
      <View className="bg-[#2a2f3e] rounded-xl p-3 mt-2">
        <View className="flex items-center gap-1 mb-2">
          <Package size={12} color="#6b7280" />
          <Text className="block text-xs text-gray-400">更新内容</Text>
        </View>
        <View className="flex flex-col gap-1">
          {lines.map((line, i) => (
            <Text key={i} className="block text-sm text-gray-200">
              {line}
            </Text>
          ))}
        </View>
      </View>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="bg-card text-white border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Download size={18} color="#3b82f6" />
            <Text>发现新版本</Text>
          </DialogTitle>
        </DialogHeader>

        <View className="mt-2 space-y-3">
          {/* 版本信息 */}
          <View className="flex flex-row items-center justify-between">
            <Text className="block text-sm text-gray-400">当前版本</Text>
            <Text className="block text-sm text-white">v{APP_VERSION}</Text>
          </View>
          <View className="flex flex-row items-center justify-between">
            <Text className="block text-sm text-gray-400">最新版本</Text>
            <Text className="block text-sm text-green-400 font-bold">
              v{updateInfo?.version || '未知'}
            </Text>
          </View>
          {updateInfo?.buildTime && (
            <View className="flex flex-row items-center justify-between">
              <Text className="block text-sm text-gray-400">构建时间</Text>
              <Text className="block text-sm text-white">{updateInfo.buildTime}</Text>
            </View>
          )}
          {updateInfo?.apkSize > 0 && (
            <View className="flex flex-row items-center justify-between">
              <Text className="block text-sm text-gray-400">安装包大小</Text>
              <Text className="block text-sm text-white">
                {(updateInfo.apkSize / 1024 / 1024).toFixed(1)} MB
              </Text>
            </View>
          )}

          {/* 更新日志（中文，换行分隔） */}
          {updateInfo?.changelog && renderChangelog(updateInfo.changelog)}

          {/* 下载进度区 */}
          <View className="mt-2">
            <View className="flex flex-row items-center justify-between mb-2">
              <Text className="block text-xs text-gray-400">下载进度</Text>
              <Text
                className="block text-xs font-bold"
                style={{ color: isCompleted ? '#22c55e' : '#3b82f6' }}
              >
                {progress}%
              </Text>
            </View>
            <Progress
              value={progress}
              className="h-2"
              style={{ backgroundColor: '#2a2f3e' }}
            />
            {/* 状态提示 */}
            <View className="mt-2">
              {isDownloading && (
                <Text className="block text-xs text-blue-400">正在下载...</Text>
              )}
              {status === 'paused' && (
                <Text className="block text-xs text-amber-400">下载已暂停，将继续上次进度</Text>
              )}
              {isCompleted && (
                <View className="flex items-center gap-1">
                  <CheckCircle size={12} color="#22c55e" />
                  <Text className="block text-xs text-green-400">下载完成，可以安装</Text>
                </View>
              )}
              {isError && (
                <View className="flex items-center gap-1">
                  <AlertCircle size={12} color="#ef4444" />
                  <Text className="block text-xs text-red-400">下载失败，请重试</Text>
                </View>
              )}
            </View>
          </View>

          {/* 按钮区：取消按钮 + 安装按钮 */}
          <View className="flex flex-row gap-3 mt-3">
            {/* 取消按钮：下载中点击则中断并保存进度，完成后点击则关闭窗口 */}
            <Button
              className="flex-1 bg-gray-700 text-gray-300"
              disabled={installing}
              onClick={handleClose}
            >
              <Text className="text-sm">{isDownloading ? '取消' : '关闭'}</Text>
            </Button>

            {/* 安装按钮：进度达 100% 时可用，否则置灰（disabled） */}
            <Button
              className="flex-1"
              style={{
                backgroundColor: isCompleted ? '#2563eb' : '#374151',
              }}
              disabled={!isCompleted || installing}
              onClick={onInstall}
            >
              <Text className="text-sm text-white">
                {installing ? '安装中...' : '安装'}
              </Text>
            </Button>
          </View>

          {/* 错误重试 */}
          {isError && (
            <Button
              className="w-full bg-amber-600 text-white mt-2"
              onClick={onStartDownload}
            >
              <Text className="text-sm">重新下载</Text>
            </Button>
          )}
        </View>
      </DialogContent>
    </Dialog>
  )
}
