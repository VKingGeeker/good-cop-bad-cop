import { View, Text } from '@tarojs/components'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, Package, CircleCheck, CircleAlert } from 'lucide-react-taro'
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
 * 交互流程：
 * - 检测到新版本 → 显示更新信息 + "更新"按钮（不自动下载）
 * - 点击"更新" → 开始下载，按钮置灰显示进度
 * - 下载完成 → 按钮切换为"安装"，可点击
 * - 点击"安装" → 开始安装，按钮置灰显示"安装中..."
 *
 * 按钮状态：
 * - idle/paused → "更新" / "继续"（可点击）
 * - downloading → "下载中 XX%"（置灰）
 * - completed → "安装"（可点击）
 * - installing → "安装中..."（置灰）
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
  const isCompleted = status === 'completed' || progress >= 100
  const isDownloading = status === 'downloading'
  const isError = status === 'error'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'

  /** 处理弹窗关闭 */
  const handleClose = () => {
    onClose()
    onOpenChange(false)
  }

  /** 渲染更新日志（按换行符分隔，带序号） */
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
              {i + 1}. {line}
            </Text>
          ))}
        </View>
      </View>
    )
  }

  /** 主按钮：根据状态动态切换 */
  const renderActionButton = () => {
    // 安装中
    if (installing) {
      return (
        <Button className="flex-1" style={{ backgroundColor: '#374151' }} disabled>
          <Text className="block text-sm text-gray-400">安装中...</Text>
        </Button>
      )
    }

    // 下载中：置灰显示进度
    if (isDownloading) {
      return (
        <Button className="flex-1" style={{ backgroundColor: '#374151' }} disabled>
          <Text className="block text-sm text-gray-400">下载中 {progress}%</Text>
        </Button>
      )
    }

    // 下载完成：显示"安装"按钮
    if (isCompleted) {
      return (
        <Button
          className="flex-1"
          style={{ backgroundColor: '#2563eb' }}
          onClick={onInstall}
        >
          <Text className="block text-sm text-white">安装</Text>
        </Button>
      )
    }

    // 暂停：显示"继续"按钮
    if (isPaused) {
      return (
        <Button
          className="flex-1"
          style={{ backgroundColor: '#2563eb' }}
          onClick={onStartDownload}
        >
          <Text className="block text-sm text-white">继续</Text>
        </Button>
      )
    }

    // 错误：显示"重试"按钮
    if (isError) {
      return (
        <Button
          className="flex-1"
          style={{ backgroundColor: '#d97706' }}
          onClick={onStartDownload}
        >
          <Text className="block text-sm text-white">重试</Text>
        </Button>
      )
    }

    // 空闲：显示"更新"按钮
    return (
      <Button
        className="flex-1"
        style={{ backgroundColor: '#2563eb' }}
        onClick={onStartDownload}
      >
        <Text className="block text-sm text-white">更新</Text>
      </Button>
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

          {/* 更新日志（中文，换行分隔，带序号） */}
          {updateInfo?.changelog && renderChangelog(updateInfo.changelog)}

          {/* 下载进度区（仅在下载中/已完成/错误时显示） */}
          {(isDownloading || isCompleted || isPaused || isError) && (
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
                {isPaused && (
                  <Text className="block text-xs text-amber-400">下载已暂停，点击继续从上次进度下载</Text>
                )}
                {isCompleted && (
                  <View className="flex items-center gap-1">
                    <CircleCheck size={12} color="#22c55e" />
                    <Text className="block text-xs text-green-400">下载完成，可以安装</Text>
                  </View>
                )}
                {isError && (
                  <View className="flex items-center gap-1">
                    <CircleAlert size={12} color="#ef4444" />
                    <Text className="block text-xs text-red-400">下载失败，请重试</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 按钮区：关闭按钮 + 主操作按钮 */}
          <View className="flex flex-row gap-3 mt-3">
            {/* 关闭按钮 */}
            <Button
              className="flex-1 bg-gray-700 text-gray-300"
              disabled={installing}
              onClick={handleClose}
            >
              <Text className="text-sm">{isDownloading ? '取消' : '关闭'}</Text>
            </Button>

            {/* 主操作按钮：更新/下载中/安装/安装中 */}
            {renderActionButton()}
          </View>
        </View>
      </DialogContent>
    </Dialog>
  )
}
