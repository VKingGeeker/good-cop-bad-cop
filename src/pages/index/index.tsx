import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Swords, BookOpen, DoorOpen, LogIn, Target, IdCard, Gamepad2, Zap, Trophy, Undo2, List, Lock, Download } from 'lucide-react-taro'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Network } from '@/network'
import { APP_VERSION } from '@/config/app-version'
import { useAppUpdate } from '@/hooks/use-app-update'
import { UpdateDialog } from '@/components/update/update-dialog'

interface RoomListItem {
  roomCode: string
  hostName: string
  playerCount: number
  maxPlayers: number
  hasPassword: boolean
  createdAt: string
}

const IndexPage = () => {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showRoomList, setShowRoomList] = useState(false)

  // 创建房间
  const [hostName, setHostName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [createPassword, setCreatePassword] = useState('')
  const [creating, setCreating] = useState(false)

  // 加入房间
  const [roomCode, setRoomCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joining, setJoining] = useState(false)

  // 房间列表
  const [roomList, setRoomList] = useState<RoomListItem[]>([])
  const [roomListLoading, setRoomListLoading] = useState(false)

  const [error, setError] = useState('')

  // 检查更新 & 下载安装
  const {
    updateInfo, progress, status, checking, showDialog, installing, hasUpdate,
    checkUpdate, startDownload, installApk, closeDialog,
  } = useAppUpdate()

  // 检查是否有未结束的房间（房主暂退后可返回）
  const [lastRoom, setLastRoom] = useState<string>('')

  useEffect(() => {
    const savedRoom = Taro.getStorageSync('roomCode') || ''
    const savedPlayer = Taro.getStorageSync('playerId') || ''
    if (savedRoom && savedPlayer) {
      // 验证房间是否仍然存在
      Network.request({ url: `/api/game/room/${savedRoom}` })
        .then((res) => {
          const result = res.data as any
          if (result.code === 0 && result.data) {
            setLastRoom(savedRoom)
          } else {
            // 房间已不存在，清除本地记录
            Taro.removeStorageSync('roomCode')
            Taro.removeStorageSync('playerId')
            Taro.removeStorageSync('isHost')
          }
        })
        .catch(() => {
          Taro.removeStorageSync('roomCode')
          Taro.removeStorageSync('playerId')
          Taro.removeStorageSync('isHost')
        })
    }
  }, [])

  const handleCreateRoom = async () => {
    if (creating) return
    if (!hostName.trim()) {
      setError('请输入昵称')
      return
    }
    setError('')
    setCreating(true)
    try {
      const res = await Network.request({
        url: '/api/game/room/create',
        method: 'POST',
        data: { hostName: hostName.trim(), maxPlayers, password: createPassword.trim() || undefined, playerId: Taro.getStorageSync('playerId') || undefined },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.setStorageSync('playerId', result.data.playerId)
        Taro.setStorageSync('roomCode', result.data.roomCode)
        Taro.setStorageSync('isHost', 'true')
        Taro.redirectTo({ url: `/pages/room/index?roomCode=${result.data.roomCode}` })
      } else {
        setError(result.msg || '创建失败')
      }
    } catch (e: any) {
      setError(e.message || '网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async () => {
    if (joining) return
    if (!roomCode.trim() || !joinName.trim()) {
      setError('请填写房间号和昵称')
      return
    }
    setError('')
    setJoining(true)
    try {
      const res = await Network.request({
        url: '/api/game/room/join',
        method: 'POST',
        data: { roomCode: roomCode.trim(), playerName: joinName.trim(), password: joinPassword.trim() || undefined, playerId: Taro.getStorageSync('playerId') || undefined },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.setStorageSync('playerId', result.data.playerId)
        Taro.setStorageSync('roomCode', roomCode.trim())
        Taro.setStorageSync('isHost', 'false')
        Taro.redirectTo({ url: `/pages/room/index?roomCode=${roomCode.trim()}` })
      } else {
        setError(result.msg || '加入失败')
      }
    } catch (e: any) {
      setError(e.message || '网络错误')
    } finally {
      setJoining(false)
    }
  }

  /** 从房间列表加入 */
  const handleJoinFromList = async (room: RoomListItem) => {
    if (room.hasPassword) {
      // 弹出密码输入
      setRoomCode(room.roomCode)
      setJoinPassword('')
      setShowRoomList(false)
      setShowJoin(true)
      return
    }
    // 无密码直接加入（需要昵称）
    if (!joinName.trim()) {
      setRoomCode(room.roomCode)
      setShowRoomList(false)
      setShowJoin(true)
      return
    }
    setJoining(true)
    try {
      const res = await Network.request({
        url: '/api/game/room/join',
        method: 'POST',
        data: { roomCode: room.roomCode, playerName: joinName.trim(), playerId: Taro.getStorageSync('playerId') || undefined },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.setStorageSync('playerId', result.data.playerId)
        Taro.setStorageSync('roomCode', room.roomCode)
        Taro.setStorageSync('isHost', 'false')
        Taro.redirectTo({ url: `/pages/room/index?roomCode=${room.roomCode}` })
      } else {
        setError(result.msg || '加入失败')
        setShowRoomList(false)
        setShowJoin(true)
        setRoomCode(room.roomCode)
      }
    } catch (e: any) {
      setError(e.message || '网络错误')
    } finally {
      setJoining(false)
    }
  }

  /** 获取房间列表 */
  const handleGetRoomList = async () => {
    setRoomListLoading(true)
    setShowRoomList(true)
    try {
      const res = await Network.request({ url: '/api/game/rooms' })
      const result = res.data as any
      if (result.code === 0) {
        setRoomList(result.data || [])
      }
    } catch (e: any) {
      setError(e.message || '获取房间列表失败')
    } finally {
      setRoomListLoading(false)
    }
  }

  return (
    <View className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* 标题 */}
      <View className="mb-8 text-center">
        <View className="mb-4">
          <Swords size={48} color="#3b82f6" />
        </View>
        <Text className="block text-3xl font-bold text-white mb-2">无间疑云</Text>
        <Text className="block text-sm text-gray-400">Good Cop Bad Cop</Text>
        <Text className="block text-xs text-gray-600 mt-2">v{APP_VERSION}</Text>
      </View>

      {/* 主菜单按钮 */}
      <View className="w-full max-w-sm space-y-3">
        {lastRoom && (
          <MenuBtn icon={<Undo2 size={20} color="#22c55e" />}
            label={`返回房间 ${lastRoom}`} desc="回到刚才的房间"
            onClick={() => Taro.redirectTo({ url: `/pages/room/index?roomCode=${lastRoom}` })}
          />
        )}

        <MenuBtn icon={<DoorOpen size={20} color="#3b82f6" />}
          label="创建房间" desc="建立新游戏"
          onClick={() => { setError(''); setShowCreate(true); }}
        />

        <MenuBtn icon={<LogIn size={20} color="#22c55e" />}
          label="加入房间" desc="输入房间号加入"
          onClick={() => { setError(''); setJoinPassword(''); setShowJoin(true); }}
        />

        <MenuBtn icon={<List size={20} color="#f59e0b" />}
          label="房间列表" desc="查看可加入的房间"
          onClick={() => { setError(''); handleGetRoomList(); }}
        />

        <MenuBtn icon={<BookOpen size={20} color="#a855f7" />}
          label="规则说明" desc="查看游戏规则"
          onClick={() => { setError(''); setShowRules(true); }}
        />

        <MenuBtn icon={<Download size={20} color="#06b6d4" />}
          label="检查更新" desc={checking ? '正在检查...' : `当前 v${APP_VERSION}`}
          onClick={() => { checkUpdate(); }}
        >
          {hasUpdate && (
            <View className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
              <Text className="block text-white">有更新</Text>
            </View>
          )}
        </MenuBtn>
      </View>

      {/* 创建房间弹窗 */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); setError(''); }}>
        <DialogContent className="bg-card text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">创建房间</DialogTitle>
          </DialogHeader>
          <View className="mt-2 space-y-3">
            <View className="bg-[#2a2f3e] rounded-xl px-3 py-2">
              <Input
                className="w-full bg-transparent text-white text-sm"
                placeholder="输入你的昵称"
                value={hostName}
                onInput={(e) => setHostName(e.detail.value)}
              />
            </View>
            <View>
              <Text className="block text-sm text-gray-400 mb-2">玩家人数：{maxPlayers}人</Text>
              <View style={{ display: 'flex', flexDirection: 'row', gap: '6px', flexWrap: 'wrap' }}>
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <View key={n} onClick={() => setMaxPlayers(n)}
                    style={{
                      padding: '6px 14px', borderRadius: 8,
                      backgroundColor: maxPlayers === n ? '#3b82f6' : '#2a2f3e',
                      borderWidth: 1,
                      borderColor: maxPlayers === n ? '#3b82f6' : '#374151',
                    }}
                  >
                    <Text className={`block text-sm ${maxPlayers === n ? 'text-white font-bold' : 'text-gray-400'}`}>
                      {n}人
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View>
              <View className="flex flex-row items-center gap-1 mb-2">
                <Lock size={12} color="#6b7280" />
                <Text className="block text-xs text-gray-400">房间密码（可选）</Text>
              </View>
              <View className="bg-[#2a2f3e] rounded-xl px-3 py-2">
                <Input
                  className="w-full bg-transparent text-white text-sm"
                  placeholder="留空则无密码"
                  value={createPassword}
                  onInput={(e) => setCreatePassword(e.detail.value)}
                />
              </View>
            </View>
            {error && <Text className="block text-red-400 text-xs">{error}</Text>}
            <Button className="w-full" onClick={creating ? undefined : handleCreateRoom} disabled={creating}>
              <Text>{creating ? '创建中...' : '创建房间'}</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 加入房间弹窗 */}
      <Dialog open={showJoin} onOpenChange={(o) => { setShowJoin(o); setError(''); }}>
        <DialogContent className="bg-card text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">加入房间</DialogTitle>
          </DialogHeader>
          <View className="mt-2 space-y-3">
            <View className="bg-[#2a2f3e] rounded-xl px-3 py-2">
              <Input
                className="w-full bg-transparent text-white text-sm"
                placeholder="输入房间号"
                value={roomCode}
                onInput={(e) => setRoomCode(e.detail.value)}
              />
            </View>
            <View className="bg-[#2a2f3e] rounded-xl px-3 py-2">
              <Input
                className="w-full bg-transparent text-white text-sm"
                placeholder="输入你的昵称"
                value={joinName}
                onInput={(e) => setJoinName(e.detail.value)}
              />
            </View>
            <View className="bg-[#2a2f3e] rounded-xl px-3 py-2">
              <Input
                className="w-full bg-transparent text-white text-sm"
                placeholder="房间密码（有密码的房间需输入）"
                value={joinPassword}
                onInput={(e) => setJoinPassword(e.detail.value)}
              />
            </View>
            {error && <Text className="block text-red-400 text-xs">{error}</Text>}
            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={joining ? undefined : handleJoinRoom} disabled={joining}>
              <Text>{joining ? '加入中...' : '加入房间'}</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 规则说明弹窗 */}
      <Dialog open={showRules} onOpenChange={(o) => setShowRules(o)}>
        <DialogContent className="bg-card text-white border-gray-700 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <BookOpen size={18} color="#3b82f6" />
              <Text>游戏规则</Text>
            </DialogTitle>
          </DialogHeader>
          <View className="mt-2 space-y-3 text-sm text-gray-300 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <View className="flex items-center gap-2">
              <Target size={14} color="#3b82f6" />
              <Text className="block text-gray-400">目标</Text>
            </View>
            <Text className="block text-xs text-gray-400">
              找出敌方首领并将其淘汰！忠诚警察 vs 变节黑帮，两大阵营的较量。
            </Text>

            <View className="flex items-center gap-2 mt-2">
              <IdCard size={14} color="#3b82f6" />
              <Text className="block text-gray-400">身份判定</Text>
            </View>
            <Text className="block text-xs text-gray-400">
              每人有3张底细牌。持有「探长」= 忠诚阵营首领，持有「主谋」= 变节阵营首领。无首领牌则看多数牌决定阵营。同时持有探长+主谋则独自获胜。
            </Text>

            <View className="flex items-center gap-2 mt-2">
              <Gamepad2 size={14} color="#3b82f6" />
              <Text className="block text-gray-400">回合行动</Text>
            </View>
            <Text className="block text-xs text-gray-400">
              • 调查：查看1名玩家的1张底细牌{'\n'}
              • 取得装备：抽1张装备牌（已有装备则替换）{'\n'}
              • 手枪：拿1把手枪并瞄准目标{'\n'}
              • 射击：向瞄准目标开枪
            </Text>

            <View className="flex items-center gap-2 mt-2">
              <Zap size={14} color="#3b82f6" />
              <Text className="block text-gray-400">中枪处理</Text>
            </View>
            <Text className="block text-xs text-gray-400">
              非首领直接淘汰。首领第一次中枪→受伤+抽装备，第二次中枪→淘汰。淘汰者的装备和手枪放回。
            </Text>

            <View className="flex items-center gap-2 mt-2">
              <Trophy size={14} color="#3b82f6" />
              <Text className="block text-gray-400">胜利条件</Text>
            </View>
            <Text className="block text-xs text-gray-400">
              主谋被淘汰→忠诚阵营获胜。探长被淘汰→变节阵营获胜。一人持有探长+主谋→独自获胜。
            </Text>
          </View>
        </DialogContent>
      </Dialog>

      {/* 房间列表弹窗 */}
      <Dialog open={showRoomList} onOpenChange={(o) => { setShowRoomList(o); if (!o) setRoomList([]); }}>
        <DialogContent className="bg-card text-white border-gray-700 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <List size={18} color="#f59e0b" />
              <Text>房间列表</Text>
            </DialogTitle>
          </DialogHeader>
          <View className="mt-2 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {roomListLoading ? (
              <Text className="block text-gray-400 text-sm text-center py-8">加载中...</Text>
            ) : roomList.length === 0 ? (
              <Text className="block text-gray-400 text-sm text-center py-8">暂无可加入的房间</Text>
            ) : (
              <View className="space-y-2">
                {roomList.map((room) => (
                  <View key={room.roomCode} onClick={() => handleJoinFromList(room)}
                    className="flex flex-row items-center justify-between bg-[#2a2f3e] rounded-xl px-4 py-3 active:opacity-70"
                  >
                    <View className="flex-1">
                      <View className="flex flex-row items-center gap-2">
                        <Text className="block text-white text-sm font-bold">#{room.roomCode}</Text>
                        {room.hasPassword && (
                          <View className="flex flex-row items-center gap-1 px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: '#92400e' }}>
                            <Lock size={10} color="#fbbf24" />
                            <Text className="block text-amber-300 text-xs">密码</Text>
                          </View>
                        )}
                      </View>
                      <Text className="block text-gray-400 text-xs mt-1">
                        房主: {room.hostName} | {room.playerCount}/{room.maxPlayers}人
                      </Text>
                    </View>
                    <Text className="block text-blue-400 text-sm">加入 ›</Text>
                  </View>
                ))}
              </View>
            )}
            {roomList.length > 0 && (
              <View className="mt-3">
                <Button className="w-full" variant="outline" onClick={handleGetRoomList}>
                  <Text className="text-sm">刷新列表</Text>
                </Button>
              </View>
            )}
          </View>
        </DialogContent>
      </Dialog>

      {/* 检查更新弹窗 */}
      <UpdateDialog
        open={showDialog}
        onOpenChange={(o) => { if (!o) closeDialog() }}
        updateInfo={updateInfo}
        progress={progress}
        status={status}
        installing={installing}
        onStartDownload={startDownload}
        onInstall={installApk}
        onClose={closeDialog}
      />
    </View>
  )
}

// Menu Button Component - using View directly for better responsiveness
function MenuBtn({ icon, label, desc, onClick, children }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void; children?: React.ReactNode;
}) {
  return (
    <View onClick={onClick}
      className="hover:opacity-80 active:opacity-70 flex flex-row items-center gap-3 bg-card rounded-xl px-4 py-3 border border-border"
    >
      <View className="w-10 h-10 rounded-lg bg-blue-600 bg-opacity-10 flex items-center justify-center">
        {icon}
      </View>
      <View className="flex-1">
        <View className="flex flex-row items-center">
          <Text className="block text-white text-sm font-bold">{label}</Text>
          {children}
        </View>
        <Text className="block text-gray-400 text-xs mt-1">{desc}</Text>
      </View>
      <Text className="block text-gray-400 text-lg">›</Text>
    </View>
  )
}

export default IndexPage