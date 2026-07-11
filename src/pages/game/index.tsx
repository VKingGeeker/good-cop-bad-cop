import { useState, useEffect, useCallback } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Crosshair, Target, Shield, Skull, Swords, Eye, Package, ChevronRight } from 'lucide-react-taro'

const EQUIPMENT_MAP: Record<string, string> = {
  'smoke': '烟雾弹', 'injunction': '禁制令', 'coffee': '咖啡',
  'blackmail': '勒索信', 'vest': '防弹衣', 'medkit': '急救包',
  'scope': '瞄准镜', 'fakeIntel': '假情报', 'doubleShot': '双倍射击',
  'snatch': '抢夺', 'swap': '调换', 'silence': '沉默令',
  'recon': '侦查令', 'flare': '信号弹', 'shield': '防弹盾', 'bribe': '贿赂',
}


interface PlayerState {
  id: string
  name: string
  alive: boolean
  hasGun: boolean
  aimingAt: string | null
  wounded: boolean
  eliminated: boolean
  isBot: boolean
  equipment: { id: string; name: string; iconName: string; description: string } | null
  cards: { type: string; faceUp: boolean }[]
  flippedCount: number
}

interface GameState {
  status: string
  phase: string
  players: PlayerState[]
  currentPlayerIndex: number
  currentPlayerDeviceId: string
  direction: number
  gunCount: number
  round: number
  gameLog: { message: string; type: string }[]
  winner: string | null
  investigationResult: { targetName: string; cardIndex: number; cardType: string } | null
}

export default function GamePage() {
  const router = useRouter()
  const { roomCode: roomCodeParam, playerId: playerIdParam } = router.params || {}
  const roomCode = roomCodeParam || ''
  const playerId = playerIdParam || Taro.getStorageSync('playerId') || ''

  const [gameState, setGameState] = useState<GameState | null>(null)
  const [actionModal, setActionModal] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [investigateTarget, setInvestigateTarget] = useState<string | null>(null)
  const [investResult, setInvestResult] = useState<{ targetName: string; cardIndex: number; cardType: string } | null>(null)
  const [equipDetail, setEquipDetail] = useState<any>(null)

  const isMyTurn = gameState?.currentPlayerDeviceId === playerId
  const myPlayer = gameState?.players.find(p => p.id === playerId)
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex]

  const fetchGameState = useCallback(async () => {
    try {
      const res = await Network.request({ url: `/api/game/room/${roomCode}/state?playerId=${playerId}` })
      const result = res.data as any
      if (result.code === 0) {
        setGameState(result.data)
        // 检查是否有调查结果
        if (result.data.investigationResult) {
          setInvestResult(result.data.investigationResult)
        }
      }
    } catch (e) {
      console.error('fetch state error:', e)
    }
  }, [roomCode, playerId])

  useEffect(() => { fetchGameState() }, [fetchGameState])

  // 轮询
  useEffect(() => {
    const timer = setInterval(fetchGameState, 2000)
    return () => clearInterval(timer)
  }, [fetchGameState])

  // 检查是否结束
  useEffect(() => {
    if (gameState?.winner) {
      Taro.redirectTo({ url: `/pages/result/index?roomCode=${roomCode}&playerId=${playerId}` })
    }
  }, [gameState?.winner, roomCode, playerId])

  const submitAction = async (action: string, target?: string, payload?: any) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const body: any = { playerId, action, payload: payload || {} }
      if (target) body.target = target
      const res = await Network.request({
        url: `/api/game/room/${roomCode}/action`,
        method: 'POST',
        data: body,
      })
      const result = res.data as any
      if (result.code === 0) {
        await fetchGameState()
        setActionModal(null)
        setInvestigateTarget(null)
      } else {
        Taro.showToast({ title: result.msg || '操作失败', icon: 'none' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '操作失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleUseEquipment = (equip: string) => {
    if (equip === 'coffee') {
      submitAction('useEquipment', '', { equipment: equip })
    } else if (['vest', 'shield'].includes(equip)) {
      submitAction('useEquipment', '', { equipment: equip })
    } else {
      setActionModal('equip_use')
    }
  }

  const handleInvestigateSelect = (targetId: string) => {
    setInvestigateTarget(targetId)
    setActionModal('investigate_card')
  }

  const formatCardType = (type: string) => {
    const map: Record<string, string> = { loyal: '忠诚', traitor: '变节', chief: '探长', mastermind: '主谋' }
    return map[type] || type
  }

  const formatCardColor = (type: string) => {
    const map: Record<string, string> = { loyal: '#3b82f6', traitor: '#ef4444', chief: '#2563eb', mastermind: '#dc2626' }
    return map[type] || '#888'
  }

  const getIdentityText = () => {
    if (!myPlayer) return '加载中...'
    const cards = myPlayer.cards.map(c => c.type)
    const hasChief = cards.includes('chief')
    const hasMastermind = cards.includes('mastermind')
    if (hasChief && hasMastermind) return '独自获胜！'
    if (hasChief) return '探长（忠诚阵营首领）'
    if (hasMastermind) return '主谋（变节阵营首领）'
    const faceUpCards = myPlayer.cards.filter(c => c.faceUp).map(c => c.type)
    if (faceUpCards.length === 0) return '身份待定（底细未翻开）'
    const loyalCount = faceUpCards.filter(t => t === 'loyal' || t === 'chief').length
    const traitorCount = faceUpCards.filter(t => t === 'traitor' || t === 'mastermind').length
    if (loyalCount > traitorCount) return '忠诚阵营'
    if (traitorCount > loyalCount) return '变节阵营'
    return '身份待定'
  }

  const getIdentityColor = () => {
    const text = getIdentityText()
    if (text.includes('独自获胜')) return '#f59e0b'
    if (text.includes('探长') || text.includes('忠诚')) return '#3b82f6'
    if (text.includes('主谋') || text.includes('变节')) return '#ef4444'
    return '#9ca3af'
  }

  if (!gameState) {
    return (
      <View className="flex items-center justify-center h-screen bg-gray-900">
        <Text className="block text-gray-400 text-lg">加载中...</Text>
      </View>
    )
  }

  const alivePlayers = gameState.players.filter(p => p.alive)

  return (
    <View className="h-screen bg-gray-900 flex flex-col overflow-hidden" style={{ position: 'relative' }}>
      {/* 瞄准线区域 */}
      <View className="absolute inset-0 z-10 pointer-events-none"></View>

      {/* 顶部状态栏 */}
      <View className="flex items-center justify-between px-4 py-2 bg-gray-800 z-20">
        <View className="flex items-center gap-2">
          <Text className="block text-gray-300 text-xs">第{gameState.round}轮</Text>
          <Text className="block text-gray-500 text-xs">|</Text>
          <Text className="block text-gray-300 text-xs">
            {gameState.direction === 1 ? '顺时针' : '逆时针'}
          </Text>
        </View>
        <View className="flex items-center gap-2">
          <Crosshair size={14} color="#ef4444" />
          <Text className="block text-gray-300 text-xs">{gameState.gunCount}把</Text>
        </View>
        <View className="flex items-center gap-1">
          <Text className="block text-gray-400 text-xs">
            {!isMyTurn && currentPlayer ? `${currentPlayer.name}行动中` : '你的回合'}
          </Text>
        </View>
      </View>

      {/* 玩家区域 - 顶部单行 */}
      <View className="flex justify-around items-start px-2 pt-2 overflow-x-auto" style={{ minHeight: '80px' }}>
        {gameState.players.map((p, i) => (
          <PlayerAvatar
            key={p.id}
            player={p}
            isCurrent={isMyTurn && gameState.currentPlayerIndex === i}
            isMyTurn={isMyTurn}
            isSelf={p.id === playerId}
            onInvestigate={() => handleInvestigateSelect(p.id)}
            onShoot={() => submitAction('shoot', p.id)}
            onAim={() => submitAction('aim', p.id)}
            onEquipUse={() => handleUseEquipment(p.id)}
            onShowEquip={() => setEquipDetail(p.equipment)}
          />
        ))}
      </View>

      {/* 中央区域 - 行动提示（可滚动） */}
      <View className="flex-1 flex items-center justify-center px-4 overflow-y-auto">
        {!isMyTurn ? (
          <View className="text-center">
            <Text className="block text-gray-400 text-lg">
              {currentPlayer?.isBot ? '🤖' : '👤'} {currentPlayer?.name || '未知'} 行动中...
            </Text>
            <Text className="block text-gray-500 text-sm mt-2">请稍候</Text>
          </View>
        ) : (
          <View className="w-full max-w-md">
            {/* 身份显示 - 始终可见 */}
            <View className="bg-gray-800 rounded-xl p-3 mb-4">
              <View className="flex items-center gap-2 mb-2">
                <Text className="block text-gray-400 text-xs">你的身份</Text>
                <Text className="block text-xs px-2 py-1 rounded-full" style={{
                  backgroundColor: `${getIdentityColor()}22`,
                  color: getIdentityColor(),
                  border: `1px solid ${getIdentityColor()}44`,
                }}
                >
                  {getIdentityText()}
                </Text>
              </View>
              <View className="flex gap-2">
                {myPlayer?.cards.map((card, ci) => (
                  <View
                    key={ci}
                    className="flex-1 rounded-lg p-2 text-center"
                    style={{
                      backgroundColor: card.faceUp ? `${formatCardColor(card.type)}33` : '#374151',
                      border: `1px solid ${card.faceUp ? formatCardColor(card.type) : '#4b5563'}`,
                    }}
                  >
                    <Text className="block text-xs" style={{
                      color: card.faceUp ? formatCardColor(card.type) : '#9ca3af',
                    }}
                    >
                      {card.faceUp ? formatCardType(card.type) : `底细${ci + 1}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 调查结果 */}
            {investResult && (
              <View className="bg-gray-800 rounded-xl p-3 mb-4">
                <Text className="block text-gray-400 text-xs mb-2">调查结果</Text>
                <Text className="block text-lg" style={{ color: formatCardColor(investResult.cardType) }}>
                  {investResult.targetName} 的第{investResult.cardIndex + 1}张底细牌是：
                  <Text className="font-bold">{formatCardType(investResult.cardType)}</Text>
                </Text>
                <Button
                  className="mt-2 w-full bg-gray-700 text-gray-300 text-xs"
                  onClick={() => setInvestResult(null)}
                >
                  关闭
                </Button>
              </View>
            )}

            {/* 行动按钮 */}
            <View className="grid grid-cols-2 gap-3">
              <ActionBtn icon={<Eye size={18} color="#60a5fa" />} label="调查" onClick={() => setActionModal('investigate')} />
              <ActionBtn icon={<Package size={18} color="#34d399" />} label="取得装备" onClick={() => submitAction('equip')} />
              {myPlayer?.hasGun ? (
                <ActionBtn icon={<Crosshair size={18} color="#f87171" />} label="射击" onClick={() => setActionModal('shoot')} />
              ) : gameState.gunCount > 0 ? (
                <ActionBtn icon={<Swords size={18} color="#fbbf24" />} label="装备手枪" onClick={() => setActionModal('aim')} />
              ) : null}
              {myPlayer?.hasGun && (
                <ActionBtn icon={<Target size={18} color="#f472b6" />} label="瞄准" onClick={() => setActionModal('aim')} />
              )}
            </View>

            {/* 装备牌 */}
            {myPlayer?.equipment && (
              <View className="mt-3 bg-gray-800 rounded-xl p-3">
                <View className="flex items-center justify-between">
                  <Text className="block text-gray-300 text-sm">
                    🎒 {myPlayer.equipment?.name || '未知装备'}
                  </Text>
                  <Button
                    className="bg-blue-600 text-white text-xs px-3 py-1"
                    onClick={() => handleUseEquipment(myPlayer.equipment?.name || '')}
                  >
                    使用
                  </Button>
                </View>
                <Text className="block text-gray-500 text-xs mt-1">
                  {myPlayer.equipment?.description || ''}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 游戏日志 - 底部滚动条 */}
      <View className="bg-gray-800 border-t border-gray-700 px-4 py-2 z-20" style={{ maxHeight: '80px' }}>
        <View className="flex overflow-x-auto gap-3" style={{ whiteSpace: 'nowrap' }}>
          {gameState.gameLog.slice(-8).map((log, i) => (
            <Text key={i} className="block text-gray-400 text-xs flex-shrink-0">
              {log.message}
            </Text>
          ))}
        </View>
      </View>

      {/* 弹窗: 选择调查目标 */}
      <Dialog open={actionModal === 'investigate'} onOpenChange={(v) => { if (!v) setActionModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择调查目标</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            {alivePlayers.filter(p => p.id !== playerId).map(p => (
              <Button
                key={p.id}
                className="w-full bg-gray-700 text-gray-200 justify-between"
                onClick={() => handleInvestigateSelect(p.id)}
              >
                <Text>{p.name}</Text>
                <ChevronRight size={16} color="#9ca3af" />
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 弹窗: 选择调查的底细牌位置 */}
      <Dialog open={actionModal === 'investigate_card'} onOpenChange={(v) => { if (!v) { setActionModal(null); setInvestigateTarget(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择要调查的底细牌</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            <Text className="block text-gray-400 text-sm">
              选择你想查看的底细牌位置（1-3，从上到下）
            </Text>
            {[0, 1, 2].map(ci => (
              <Button
                key={ci}
                className="w-full bg-gray-700 text-gray-200"
                onClick={() => {
                  submitAction('investigate', investigateTarget!, { cardIndex: ci })
                }}
              >
                第{ci + 1}张底细牌
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 弹窗: 选择射击目标 */}
      <Dialog open={actionModal === 'shoot'} onOpenChange={(v) => { if (!v) setActionModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择射击目标</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            {alivePlayers.filter(p => p.id !== playerId).map(p => (
              <Button
                key={p.id}
                className="w-full bg-gray-700 text-gray-200"
                onClick={() => submitAction('shoot', p.id)}
              >
                🔫 {p.name}
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 弹窗: 瞄准目标（拿手枪或切换瞄准目标） */}
      <Dialog open={actionModal === 'aim'} onOpenChange={(v) => { if (!v) setActionModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{myPlayer?.hasGun ? '切换瞄准目标' : '选择手枪瞄准目标'}</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            {alivePlayers.filter(p => p.id !== playerId).map(p => (
              <Button
                key={p.id}
                className="w-full bg-gray-700 text-gray-200"
                onClick={() => submitAction(myPlayer?.hasGun ? 'aim' : 'gun', p.id)}
              >
                🎯 {p.name}
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 弹窗: 装备详情 */}
      <Dialog open={!!equipDetail} onOpenChange={(v) => { if (!v) setEquipDetail(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>装备详情</DialogTitle>
          </DialogHeader>
          {equipDetail && (
            <View className="p-4 text-center">
              <Text className="block text-2xl mb-2">{EQUIPMENT_MAP[equipDetail.iconName] || equipDetail.name}</Text>
              <Text className="block text-gray-400">{equipDetail.description || ''}</Text>
            </View>
          )}
        </DialogContent>
      </Dialog>

      {/* 弹窗: 选择装备使用目标 */}
      <Dialog open={actionModal === 'equip_use'} onOpenChange={(v) => { if (!v) setActionModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择装备使用目标</DialogTitle>
          </DialogHeader>
          <View className="flex flex-col gap-3">
            {alivePlayers.filter(p => p.id !== playerId).map(p => (
              <Button
                key={p.id}
                className="w-full bg-gray-700 text-gray-200"
                onClick={() => {
                  const equip = myPlayer?.equipment
                  if (equip) submitAction('useEquipment', p.id, { equipment: equip })
                }}
              >
                🎯 {p.name}
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>
    </View>
  )
}

// 玩家头像组件
function PlayerAvatar({
  player,
  isCurrent,
  isMyTurn,
  isSelf,
  onInvestigate,
  onShoot,
  onAim,
  onShowEquip,
}: {
  player: PlayerState
  isCurrent: boolean
  isMyTurn: boolean
  isSelf: boolean
  onInvestigate: () => void
  onShoot: () => void
  onAim: () => void
  onEquipUse: () => void
  onShowEquip: () => void
}) {
  if (!player.alive) {
    return (
      <View className="flex flex-col items-center opacity-40">
        <View className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
          <Skull size={20} color="#6b7280" />
        </View>
        <Text className="block text-gray-500 text-xs mt-1">{player.name}</Text>
        <Text className="block text-gray-600 text-xs">已淘汰</Text>
      </View>
    )
  }

  return (
    <View className="flex flex-col items-center" style={{ maxWidth: '80px' }}>
      {/* 头像 */}
      <View
        className="w-12 h-12 rounded-full flex items-center justify-center relative"
        style={{
          backgroundColor: isCurrent ? '#f59e0b' : '#374151',
          border: isCurrent ? '3px solid #fbbf24' : '2px solid #4b5563',
          ...(isSelf ? { borderColor: '#3b82f6' } : {}),
        }}
      >
        <Text className="block text-white font-bold text-lg">{player.name[0]}</Text>

        {/* 手枪标记 */}
        {player.hasGun && (
          <View className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <Swords size={10} color="white" />
          </View>
        )}

        {/* 受伤标记 */}
        {player.wounded && (
          <View className="absolute -top-1 -left-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
            <Shield size={10} color="white" />
          </View>
        )}

        {/* 装备标记 */}
        {player.equipment && (
          <View className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center" onClick={onShowEquip}>
            <Package size={10} color="white" />
          </View>
        )}
      </View>

      {/* 名字 */}
      <Text className="block text-gray-300 text-xs mt-1 text-center" style={{ maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {player.name}
      </Text>

      {/* 瞄准指示 */}
      <View className="flex items-center gap-1 mt-1">
        {player.aimingAt && (
          <Text className="block text-red-400 text-xs">→ {player.aimingAt.slice(0, 4)}</Text>
        )}
      </View>

      {/* 行动按钮 (仅当前回合玩家可用) */}
      {isMyTurn && !isSelf && (
        <View className="flex gap-1 mt-1">
          <View className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center" onClick={onInvestigate}>
            <Eye size={12} color="white" />
          </View>
          <View className="w-6 h-6 rounded bg-red-600 flex items-center justify-center" onClick={onShoot}>
            <Crosshair size={12} color="white" />
          </View>
          <View className="w-6 h-6 rounded bg-yellow-600 flex items-center justify-center" onClick={onAim}>
            <Target size={12} color="white" />
          </View>
        </View>
      )}
    </View>
  )
}

// 行动按钮组件
function ActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <View
      className="bg-gray-800 rounded-xl py-4 px-3 flex flex-col items-center justify-center gap-2"
      style={{ border: '1px solid #374151' }}
      onClick={onClick}
    >
      {icon}
      <Text className="block text-gray-300 text-sm">{label}</Text>
    </View>
  )
}