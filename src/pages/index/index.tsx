import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Swords, BookOpen, DoorOpen, LogIn } from 'lucide-react-taro'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Network } from '@/network'

const IndexPage = () => {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showRules, setShowRules] = useState(false)

  // 创建房间
  const [hostName, setHostName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [creating, setCreating] = useState(false)

  // 加入房间
  const [roomCode, setRoomCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const [error, setError] = useState('')

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
        data: { hostName: hostName.trim(), maxPlayers },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.setStorageSync('playerId', result.data.playerId)
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
        data: { roomCode: roomCode.trim(), playerName: joinName.trim() },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.setStorageSync('playerId', result.data.playerId)
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

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col items-center justify-center px-6">
      {/* 标题 */}
      <View className="mb-8 text-center">
        <View className="mb-4">
          <Swords size={48} color="#3b82f6" />
        </View>
        <Text className="block text-3xl font-bold text-white mb-2">无间疑云</Text>
        <Text className="block text-sm text-gray-500">Good Cop Bad Cop</Text>
      </View>

      {/* 主菜单按钮 */}
      <View className="w-full max-w-sm space-y-3">
        <MenuBtn icon={<DoorOpen size={20} color="#3b82f6" />}
          label="创建房间" desc="建立新游戏"
          onClick={() => { setError(''); setShowCreate(true); }}
        />

        <MenuBtn icon={<LogIn size={20} color="#22c55e" />}
          label="加入房间" desc="输入房间号加入"
          onClick={() => { setError(''); setShowJoin(true); }}
        />

        <MenuBtn icon={<BookOpen size={20} color="#a855f7" />}
          label="规则说明" desc="查看游戏规则"
          onClick={() => { setError(''); setShowRules(true); }}
        />
      </View>

      {/* 创建房间弹窗 */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); setError(''); }}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
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
                {[2, 3, 4, 5, 6, 7, 8].map(n => (
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
            {error && <Text className="block text-red-400 text-xs">{error}</Text>}
            <View onClick={creating ? undefined : handleCreateRoom}
              style={{
                backgroundColor: creating ? '#1f2937' : '#3b82f6',
                borderRadius: 12, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: creating ? 0.5 : 1,
              }}
            >
              <Text className="block text-white font-bold text-sm">
                {creating ? '创建中...' : '创建房间'}
              </Text>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* 加入房间弹窗 */}
      <Dialog open={showJoin} onOpenChange={(o) => { setShowJoin(o); setError(''); }}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
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
            {error && <Text className="block text-red-400 text-xs">{error}</Text>}
            <View onClick={joining ? undefined : handleJoinRoom}
              style={{
                backgroundColor: joining ? '#1f2937' : '#22c55e',
                borderRadius: 12, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: joining ? 0.5 : 1,
              }}
            >
              <Text className="block text-white font-bold text-sm">
                {joining ? '加入中...' : '加入房间'}
              </Text>
            </View>
          </View>
        </DialogContent>
      </Dialog>

      {/* 规则说明弹窗 */}
      <Dialog open={showRules} onOpenChange={(o) => setShowRules(o)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white">📖 游戏规则</DialogTitle>
          </DialogHeader>
          <View className="mt-2 space-y-3 text-sm text-gray-300 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            <Text className="block text-gray-400">🎯 目标</Text>
            <Text className="block text-xs text-gray-400">
              找出敌方首领并将其淘汰！忠诚警察 vs 变节黑帮，两大阵营的较量。
            </Text>

            <Text className="block text-gray-400 mt-2">🆔 身份判定</Text>
            <Text className="block text-xs text-gray-400">
              每人有3张底细牌。持有「探长」= 忠诚阵营首领，持有「主谋」= 变节阵营首领。无首领牌则看多数牌决定阵营。同时持有探长+主谋则独自获胜。
            </Text>

            <Text className="block text-gray-400 mt-2">🎮 回合行动</Text>
            <Text className="block text-xs text-gray-400">
              • 调查：查看1名玩家的1张底细牌{'\n'}
              • 取得装备：抽1张装备牌（已有装备则替换）{'\n'}
              • 手枪：拿1把手枪并瞄准目标{'\n'}
              • 射击：向瞄准目标开枪
            </Text>

            <Text className="block text-gray-400 mt-2">💥 中枪处理</Text>
            <Text className="block text-xs text-gray-400">
              非首领直接淘汰。首领第一次中枪→受伤+抽装备，第二次中枪→淘汰。淘汰者的装备和手枪放回。
            </Text>

            <Text className="block text-gray-400 mt-2">🏆 胜利条件</Text>
            <Text className="block text-xs text-gray-400">
              主谋被淘汰→忠诚阵营获胜。探长被淘汰→变节阵营获胜。一人持有探长+主谋→独自获胜。
            </Text>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  )
}

// Menu Button Component - using View directly for better responsiveness
function MenuBtn({ icon, label, desc, onClick }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void;
}) {
  return (
    <View onClick={onClick}
      className="hover:opacity-80 active:opacity-70"
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px',
        backgroundColor: '#1a1f2e', borderRadius: 14, padding: '14px 16px',
        borderWidth: 1, borderColor: '#2a2f3e',
      }}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(59,130,246,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text className="block text-white text-sm font-bold">{label}</Text>
        <Text className="block text-gray-500 text-xs mt-1">{desc}</Text>
      </View>
      <Text className="block text-gray-600" style={{ fontSize: '18px' }}>›</Text>
    </View>
  )
}

export default IndexPage