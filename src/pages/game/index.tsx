import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Crosshair, Target, Shield, Swords, Eye, Package, ChevronRight, Backpack, SkipForward, Copy, Download, Menu } from 'lucide-react-taro'
import { useTRTC } from '@/hooks/use-trtc'
import { useAppUpdate } from '@/hooks/use-app-update'
import { UpdateDialog } from '@/components/update/update-dialog'
import { FloatingLogButton } from '@/components/floating-log-button'

// 头像占位图 prompt 列表（后续可替换为实际素材）
const AVATAR_PROMPTS = [
  'stylized detective character avatar, male, fedora hat, serious expression, dark moody background, digital art portrait',
  'stylized detective character avatar, female, short hair, confident expression, dark moody background, digital art portrait',
  'stylized detective character avatar, older male, beard, wise expression, dark moody background, digital art portrait',
  'stylized detective character avatar, young female, glasses, analytical expression, dark moody background, digital art portrait',
  'stylized detective character avatar, male, trench coat, determined expression, dark moody background, digital art portrait',
  'stylized detective character avatar, female, ponytail, alert expression, dark moody background, digital art portrait',
  'stylized detective character avatar, male, sunglasses, cool expression, dark moody background, digital art portrait',
  'stylized detective character avatar, female, scarf, mysterious expression, dark moody background, digital art portrait',
]

const getAvatarUrl = (index: number) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(AVATAR_PROMPTS[index % AVATAR_PROMPTS.length])}&image_size=square`

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
  lastActions: Array<{
    actorId: string
    actorName: string
    action: string
    targetId: string
    targetName: string
    round: number
  }>
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
  const [showExitMenu, setShowExitMenu] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const fetchingRef = useRef(false)
  const dismissedInvestRef = useRef<string | null>(null)
  const [linePositions, setLinePositions] = useState<{
    from: { x: number; y: number }
    to: { x: number; y: number }
    label: string
    color: string
    dashed?: boolean
    sourceIndex: number
    targetIndex: number
  }[]>([])

  const isMyTurn = gameState?.currentPlayerDeviceId === playerId
  const myPlayer = gameState?.players.find(p => p.id === playerId)
  const currentPlayer = gameState?.players[gameState.currentPlayerIndex]

  // TRTC 实时语音（狼人杀式：仅当前回合玩家可发言）
  const trtc = useTRTC({
    roomCode,
    playerId,
    isMyTurn,
  })

  // APP 更新检查
  const {
    updateInfo, progress, status, checking, showDialog, installing,
    checkUpdate, startDownload, installApk, closeDialog,
  } = useAppUpdate()

  const fetchGameState = useCallback(async () => {
    // 防止并发请求导致 ERR_ABORTED
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const res = await Network.request({ url: `/api/game/room/${roomCode}/state?playerId=${playerId}` })
      const result = res?.data as any
      if (result?.code === 0) {
        setGameState(result.data)
        if (result.data?.investigationResult) {
          const inv = result.data.investigationResult
          const invKey = `${inv.targetName}-${inv.cardIndex}-${inv.cardType}`
          // 跳过用户已关闭的调查结果，避免轮询重新弹出
          if (invKey !== dismissedInvestRef.current) {
            setInvestResult(inv)
          }
        } else {
          setInvestResult(null)
          dismissedInvestRef.current = null
        }
      }
    } catch {
      // 后端重启/网络抖动时静默处理，轮询会自动恢复
    } finally {
      fetchingRef.current = false
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

  // 测量头像位置，计算连线（瞄准 + 最近行动）
  useEffect(() => {
    if (!gameState) return
    const timer = setTimeout(() => {
      const query = Taro.createSelectorQuery()
      gameState.players.forEach((_, i) => {
        query.select(`#avatar-${i}`).boundingClientRect()
      })
      query.select('#player-grid').boundingClientRect()
      query.exec((rects: any[]) => {
        const containerRect = rects[rects.length - 1]
        if (!containerRect) return

        const centerOf = (i: number) => ({
          x: rects[i].left + rects[i].width / 2 - containerRect.left,
          y: rects[i].top + rects[i].height / 2 - containerRect.top,
        })

        const rawLines: Array<{
          from: { x: number; y: number }
          to: { x: number; y: number }
          label: string
          color: string
          dashed: boolean
          sourceIndex: number
          targetIndex: number
        }> = []

        // 1. 持续瞄准连线（红色虚线）
        gameState.players.forEach((p, i) => {
          if (p.aimingAt) {
            const targetIndex = gameState.players.findIndex(tp => tp.id === p.aimingAt)
            if (targetIndex >= 0 && rects[i] && rects[targetIndex]) {
              rawLines.push({
                from: centerOf(i),
                to: centerOf(targetIndex),
                label: '瞄准',
                color: '#ef4444',
                dashed: true,
                sourceIndex: i,
                targetIndex,
              })
            }
          }
        })

        // 2. 最近行动连线（调查/道具/射击/瞄准）
        ;(gameState.lastActions || []).forEach((action) => {
          // 跳过瞄准/装备手枪行动——如果该玩家仍在瞄准同一目标，已有持续连线
          if (action.action === 'aim' || action.action === 'gun') {
            const actor = gameState.players.find(p => p.id === action.actorId)
            if (actor?.aimingAt === action.targetId) return
          }

          const sourceIndex = gameState.players.findIndex(p => p.id === action.actorId)
          const targetIndex = gameState.players.findIndex(p => p.id === action.targetId)
          if (sourceIndex < 0 || targetIndex < 0 || !rects[sourceIndex] || !rects[targetIndex]) return

          const actionConfig: Record<string, { label: string; color: string }> = {
            investigate: { label: '调查', color: '#60a5fa' },
            useEquipment: { label: '道具', color: '#34d399' },
            shoot: { label: '射击', color: '#f87171' },
            aim: { label: '瞄准', color: '#fbbf24' },
            gun: { label: '手枪', color: '#fbbf24' },
          }
          const cfg = actionConfig[action.action]
          if (!cfg) return

          rawLines.push({
            from: centerOf(sourceIndex),
            to: centerOf(targetIndex),
            label: cfg.label,
            color: cfg.color,
            dashed: false,
            sourceIndex,
            targetIndex,
          })
        })

        // 3. 防重叠：同一对玩家之间多条连线，垂直偏移
        const pairGroups: Record<string, number[]> = {}
        rawLines.forEach((_, i) => {
          const key = `${Math.min(rawLines[i].sourceIndex, rawLines[i].targetIndex)}-${Math.max(rawLines[i].sourceIndex, rawLines[i].targetIndex)}`
          if (!pairGroups[key]) pairGroups[key] = []
          pairGroups[key].push(i)
        })

        const offsetLines = rawLines.map((line, i) => {
          const key = `${Math.min(line.sourceIndex, line.targetIndex)}-${Math.max(line.sourceIndex, line.targetIndex)}`
          const group = pairGroups[key]
          const groupIndex = group.indexOf(i)
          const groupSize = group.length
          // 仅当多条线在同一对玩家之间时偏移
          if (groupSize <= 1) return line

          const offsetStep = 10
          const offset = (groupIndex - (groupSize - 1) / 2) * offsetStep

          const dx = line.to.x - line.from.x
          const dy = line.to.y - line.from.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len === 0) return line

          const perpX = -dy / len * offset
          const perpY = dx / len * offset

          return {
            ...line,
            from: { x: line.from.x + perpX, y: line.from.y + perpY },
            to: { x: line.to.x + perpX, y: line.to.y + perpY },
          }
        })

        setLinePositions(offsetLines)
      })
    }, 100)
    return () => clearTimeout(timer)
  }, [gameState])

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
      const result = res?.data as any
      if (result?.code === 0) {
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
      <View className="flex flex-col h-screen bg-[#0a0e1a] overflow-hidden p-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        {/* 头像行骨架 */}
        <View className="grid grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} className="flex flex-col items-center">
              <Skeleton className="w-14 h-14 rounded-full" />
              <Skeleton className="w-14 h-3 mt-1" />
            </View>
          ))}
        </View>
        {/* 内容区骨架 */}
        <View className="flex-1 flex flex-col gap-3">
          <Skeleton className="w-full h-20 rounded-xl" />
          <Skeleton className="w-full h-16 rounded-xl" />
          <View className="grid grid-cols-2 gap-3">
            <Skeleton className="w-full h-20 rounded-xl" />
            <Skeleton className="w-full h-20 rounded-xl" />
          </View>
        </View>
      </View>
    )
  }

  const alivePlayers = gameState.players.filter(p => !p.eliminated)

  return (
    <View className="h-screen bg-[#0a0e1a] flex flex-col overflow-hidden" style={{ position: 'relative', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* 顶部状态栏 */}
      <View className="flex items-center justify-between px-4 py-2 z-20" style={{
        background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
        borderBottom: '1px solid #374151',
      }}
      >
        <View className="flex items-center gap-2">
          <Text className="block text-gray-300 text-xs font-medium">第{gameState.round}轮</Text>
          <Text className="block text-gray-600 text-xs">|</Text>
          <Text className="block text-gray-400 text-xs">
            {gameState.direction === 1 ? '顺时针' : '逆时针'}
          </Text>
        </View>
        <View className="flex items-center gap-1">
          <Crosshair size={14} color="#ef4444" />
          <Text className="block text-gray-300 text-xs font-medium">{gameState.gunCount}把</Text>
        </View>
        <View className="flex items-center gap-2">
          <View className="flex items-center gap-1">
            {isMyTurn ? (
              <Text className="block text-amber-400 text-xs font-semibold">你的回合</Text>
            ) : (
              <Text className="block text-gray-400 text-xs">
                {currentPlayer?.name}行动中
              </Text>
            )}
          </View>
          {/* 菜单按钮 */}
          <View
            className="flex items-center justify-center rounded-full"
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
            }}
            onClick={() => setShowExitConfirm(true)}
          >
            <Menu size={14} color="#9ca3af" />
          </View>
          {/* 检查更新按钮 */}
          <View
            className="flex items-center justify-center rounded-full"
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
            }}
            onClick={() => checkUpdate()}
          >
            <Download size={14} color={checking ? '#6b7280' : '#06b6d4'} />
          </View>
        </View>
      </View>

      {/* 玩家区域 - 网格布局 + 连线 */}
      <View id="player-grid" className="relative">
        <View className="grid grid-cols-4 gap-3 px-3 pt-2 items-start">
          {gameState.players.map((p, i) => (
            <View key={p.id} id={`avatar-${i}`} className="flex justify-center">
              <PlayerAvatar
                player={p}
                playerIndex={i}
                isCurrent={gameState.currentPlayerIndex === i}
                isMyTurn={isMyTurn}
                isSelf={p.id === playerId}
                myHasGun={myPlayer?.hasGun}
                myHasAimingAt={!!myPlayer?.aimingAt}
                onInvestigate={() => handleInvestigateSelect(p.id)}
                onShoot={() => submitAction('shoot')}
                onAim={() => submitAction('aim', p.id)}
                onShowEquip={() => setEquipDetail(p.equipment)}
              />
            </View>
          ))}
        </View>
        {/* 连线 overlay（瞄准 + 最近行动） */}
        {linePositions.map((line, i) => {
          const dx = line.to.x - line.from.x
          const dy = line.to.y - line.from.y
          const length = Math.sqrt(dx * dx + dy * dy)
          const angle = Math.atan2(dy, dx) * 180 / Math.PI
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${line.from.x}px`,
                top: `${line.from.y}px`,
                width: `${length}px`,
                height: '2px',
                backgroundColor: line.dashed ? 'transparent' : line.color,
                backgroundImage: line.dashed
                  ? `repeating-linear-gradient(90deg, ${line.color} 0px, ${line.color} 6px, transparent 6px, transparent 12px)`
                  : undefined,
                transform: `rotate(${angle}deg)`,
                transformOrigin: '0 50%',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              {/* 箭头 */}
              <View
                style={{
                  position: 'absolute',
                  right: '-8px',
                  top: '-4px',
                  width: '0',
                  height: '0',
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: `8px solid ${line.color}`,
                }}
              />
              {/* 连线标签 */}
              <Text
                style={{
                  position: 'absolute',
                  left: `${length / 2 - 12}px`,
                  top: '-18px',
                  color: line.color,
                  fontSize: '10px',
                  whiteSpace: 'nowrap',
                  transform: `rotate(${-angle}deg)`,
                  transformOrigin: 'center',
                }}
              >
                {line.label}
              </Text>
            </View>
          )
        })}
      </View>

      {/* 行动区域 - 始终显示 */}
      <View className="flex-1 overflow-y-auto px-4 py-2">
        {!isMyTurn && (
          <View className="flex items-center justify-center gap-2 py-2 mb-2 rounded-lg" style={{ background: 'rgba(55, 65, 81, 0.5)' }}>
            <Text className="block text-gray-400 text-xs">{currentPlayer?.name} 行动中，请稍候...</Text>
          </View>
        )}
        <View className="w-full max-w-md mx-auto">
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
                      minHeight: '52px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: card.faceUp
                        ? `linear-gradient(135deg, ${formatCardColor(card.type)}33 0%, ${formatCardColor(card.type)}11 100%)`
                        : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
                      border: `1px solid ${card.faceUp ? formatCardColor(card.type) : '#4b5563'}`,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    <Text className="block text-xs font-semibold" style={{
                      color: card.faceUp ? formatCardColor(card.type) : '#6b7280',
                    }}
                    >
                      {card.faceUp ? formatCardType(card.type) : `底细${ci + 1}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 实时语音面板 */}
            <VoicePanel trtc={trtc} isMyTurn={isMyTurn} currentPlayerName={currentPlayer?.name} />

            {/* 调查结果 */}
            {investResult && (
              <View className="rounded-xl p-3 mb-4" style={{
                background: `linear-gradient(135deg, ${formatCardColor(investResult.cardType)}22 0%, ${formatCardColor(investResult.cardType)}08 100%)`,
                border: `1px solid ${formatCardColor(investResult.cardType)}44`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
              >
                <View className="flex items-center gap-2 mb-2">
                  <Eye size={14} color={formatCardColor(investResult.cardType)} />
                  <Text className="block text-gray-400 text-xs">调查结果</Text>
                </View>
                <Text className="block text-base" style={{ color: formatCardColor(investResult.cardType) }}>
                  {investResult.targetName} 的第{investResult.cardIndex + 1}张底细牌是：
                  <Text className="font-bold text-lg">{formatCardType(investResult.cardType)}</Text>
                </Text>
                <Button
                  className="mt-2 w-full bg-gray-700 text-gray-300 text-xs"
                  onClick={() => {
                    dismissedInvestRef.current = `${investResult.targetName}-${investResult.cardIndex}-${investResult.cardType}`
                    setInvestResult(null)
                  }}
                >
                  关闭
                </Button>
              </View>
            )}

            {/* 行动按钮 - 仅自己回合显示 */}
            {isMyTurn && (
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
                <ActionBtn icon={<SkipForward size={18} color="#9ca3af" />} label="结束回合" onClick={() => submitAction('endTurn')} />
              </View>
            )}

            {/* 装备牌 */}
            {myPlayer?.equipment && (
              <View className="mt-3 bg-gray-800 rounded-xl p-3">
                <View className="flex items-center justify-between">
                  <View className="flex items-center gap-2">
                    <Backpack size={16} color="#34d399" />
                    <Text className="block text-gray-300 text-sm">
                      {myPlayer.equipment?.name || '未知装备'}
                    </Text>
                  </View>
                  {isMyTurn && (
                    <Button
                      className="bg-blue-600 text-white text-xs px-3 py-1"
                      onClick={() => handleUseEquipment(myPlayer.equipment?.iconName || '')}
                    >
                      使用
                    </Button>
                  )}
                </View>
                <Text className="block text-gray-500 text-xs mt-1">
                  {myPlayer.equipment?.description || ''}
                </Text>
              </View>
            )}
          </View>
      </View>

      {/* 游戏日志 - 纵向滚动 + 复制 */}
      <View className="bg-gray-800 border-t border-gray-700 px-4 py-2 z-20">
        <View className="flex items-center justify-between mb-1">
          <Text className="block text-gray-500 text-xs">游戏日志</Text>
          <View
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700"
            onClick={() => {
              const logText = gameState.gameLog.map(l => l.message).join('\n')
              Taro.setClipboardData({ data: logText })
            }}
          >
            <Copy size={12} color="#9ca3af" />
            <Text className="block text-gray-400 text-xs">复制</Text>
          </View>
        </View>
        <ScrollView scrollY style={{ maxHeight: '120px' }}>
          <View className="flex flex-col gap-1">
            {gameState.gameLog.slice(-20).map((log, i) => (
              <Text key={i} className="block text-gray-400 text-xs">
                {log.message}
              </Text>
            ))}
          </View>
        </ScrollView>
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
              选择你想查看的底细牌位置（从上到下）
            </Text>
            {Array.from({ length: gameState.players.find(p => p.id === investigateTarget)?.cards.length || 0 }, (_, i) => i).map(ci => (
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

      {/* 弹窗: 射击确认（向瞄准目标开枪） */}
      <Dialog open={actionModal === 'shoot'} onOpenChange={(v) => { if (!v) setActionModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>射击确认</DialogTitle>
          </DialogHeader>
          {(() => {
            const aimTarget = myPlayer?.aimingAt ? gameState.players.find(p => p.id === myPlayer.aimingAt) : null
            if (aimTarget) {
              return (
                <View className="flex flex-col items-center gap-4 py-4">
                  <View className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-400">
                    <Image src={getAvatarUrl(gameState.players.findIndex(p => p.id === aimTarget.id))} mode="aspectFill" style={{ width: '64px', height: '64px' }} />
                  </View>
                  <Text className="block text-gray-200 text-lg">{aimTarget.name}</Text>
                  <Button
                    className="w-full bg-red-600 text-white"
                    onClick={() => submitAction('shoot')}
                  >
                    确认射击
                  </Button>
                </View>
              )
            }
            return (
              <View className="py-4 text-center">
                <Text className="block text-gray-400">请先瞄准目标后再射击</Text>
              </View>
            )
          })()}
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
                  if (equip) submitAction('useEquipment', p.id, { equipment: equip.iconName })
                }}
              >
                🎯 {p.name}
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* APP 更新弹窗 */}
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

      {/* 退出确认弹窗 */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出游戏</AlertDialogTitle>
            <AlertDialogDescription>
              <Text className="block text-sm text-muted-foreground">确定要退出当前游戏返回主页吗？退出后游戏将继续进行，你可以重新加入。</Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => Taro.redirectTo({ url: '/pages/index/index' })}>
              <Text className="block">退出到主页</Text>
            </AlertDialogAction>
            <AlertDialogCancel>
              <Text className="block">取消</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 悬浮日志按钮 */}
      <FloatingLogButton />
    </View>
  )
}

// 玩家头像渐变色
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #ff9a56 0%, #ff6a88 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
]

// 玩家头像组件
function PlayerAvatar({
  player,
  playerIndex,
  isCurrent,
  isMyTurn,
  isSelf,
  myHasGun,
  myHasAimingAt,
  onInvestigate,
  onShoot,
  onAim,
  onShowEquip,
}: {
  player: PlayerState
  playerIndex: number
  isCurrent: boolean
  isMyTurn: boolean
  isSelf: boolean
  myHasGun?: boolean
  myHasAimingAt?: boolean
  onInvestigate: () => void
  onShoot: () => void
  onAim: () => void
  onShowEquip: () => void
}) {
  const [confirmShoot, setConfirmShoot] = useState(false)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const avatarUrl = getAvatarUrl(playerIndex)

  if (player.eliminated) {
    return (
      <View className="flex flex-col items-center opacity-30">
        <View className="w-14 h-14 rounded-full overflow-hidden" style={{ border: '2px solid #6b7280' }}>
          <Image src={avatarUrl} mode="aspectFill" style={{ width: '56px', height: '56px', filter: 'grayscale(100%)' }} />
        </View>
        <Text className="block text-gray-500 text-xs mt-1" style={{ maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex flex-col items-center">
      {/* 头像容器 - 固定 64px，包含环+头像+角标 */}
      <View style={{ position: 'relative', width: '64px', height: '64px' }}>
        {/* 当前回合旋转环 */}
        {isCurrent && (
          <View
            className="absolute rounded-full animate-spin"
            style={{
              top: '0',
              left: '0',
              width: '64px',
              height: '64px',
              border: '3px solid transparent',
              borderTopColor: '#fbbf24',
              borderRightColor: '#fbbf24',
              boxSizing: 'border-box',
            }}
          />
        )}
        {/* 自己的标识环 */}
        {isSelf && !isCurrent && (
          <View
            className="absolute rounded-full"
            style={{
              top: '0',
              left: '0',
              width: '64px',
              height: '64px',
              border: '2px solid #3b82f6',
              boxSizing: 'border-box',
            }}
          />
        )}
        {/* 头像图片 */}
        <View
          className="rounded-full overflow-hidden"
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            width: '56px',
            height: '56px',
            boxShadow: isCurrent ? '0 0 12px rgba(251, 191, 36, 0.5)' : '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {!avatarLoaded && (
            <View style={{ width: '56px', height: '56px', background: AVATAR_GRADIENTS[playerIndex % AVATAR_GRADIENTS.length] }} />
          )}
          <Image
            src={avatarUrl}
            mode="aspectFill"
            style={{ width: '56px', height: '56px', display: avatarLoaded ? 'block' : 'none' }}
            onLoad={() => setAvatarLoaded(true)}
          />
        </View>

        {/* 手枪标记 */}
        {player.hasGun && (
          <View
            className="absolute bg-red-500 rounded-full flex items-center justify-center z-10"
            style={{ top: '2px', right: '2px', width: '20px', height: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            <Swords size={12} color="white" />
          </View>
        )}

        {/* 受伤标记 */}
        {player.wounded && (
          <View
            className="absolute bg-amber-500 rounded-full flex items-center justify-center z-10"
            style={{ top: '2px', left: '2px', width: '20px', height: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            <Shield size={12} color="white" />
          </View>
        )}

        {/* 装备标记 */}
        {player.equipment && (
          <View
            className="absolute bg-emerald-500 rounded-full flex items-center justify-center z-10"
            style={{ bottom: '2px', right: '2px', width: '20px', height: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
            onClick={onShowEquip}
          >
            <Package size={12} color="white" />
          </View>
        )}
      </View>

      {/* 名字 */}
      <Text className="block text-gray-300 text-xs mt-1 text-center" style={{ maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </Text>

      {/* 行动按钮区域 - 始终占位保证所有头像对齐 */}
      <View className={`flex gap-1 mt-1 ${isMyTurn ? 'min-h-8' : ''}`}>
        {isMyTurn && !isSelf && (
          <>
            <View
              className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center"
              style={{ boxShadow: '0 1px 3px rgba(37,99,235,0.4)' }}
              onClick={onInvestigate}
            >
              <Eye size={13} color="white" />
            </View>
            {myHasGun && (
              <View
                className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center"
                style={{ boxShadow: '0 1px 3px rgba(220,38,38,0.4)' }}
                onClick={() => setConfirmShoot(true)}
              >
                <Crosshair size={13} color="white" />
              </View>
            )}
            {myHasGun && !myHasAimingAt && (
              <View
                className="w-7 h-7 rounded-md bg-amber-600 flex items-center justify-center"
                style={{ boxShadow: '0 1px 3px rgba(217,119,6,0.4)' }}
                onClick={onAim}
              >
                <Target size={13} color="white" />
              </View>
            )}
          </>
        )}
      </View>

      {/* 射击确认弹窗 */}
      <AlertDialog open={confirmShoot} onOpenChange={setConfirmShoot}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认射击</AlertDialogTitle>
            <AlertDialogDescription>
              <Text className="block text-sm text-muted-foreground">确认向瞄准目标开枪吗？</Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onShoot}>
              <Text className="block">确认射击</Text>
            </AlertDialogAction>
            <AlertDialogCancel>
              <Text className="block">取消</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      style={{ border: '1px solid #374151', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
      onClick={onClick}
    >
      {icon}
      <Text className="block text-gray-300 text-sm font-medium">{label}</Text>
    </View>
  )
}

// 实时语音面板组件
function VoicePanel({
  trtc,
  isMyTurn,
  currentPlayerName,
}: {
  trtc: ReturnType<typeof useTRTC>
  isMyTurn: boolean
  currentPlayerName?: string
}) {
  // 小程序环境：不支持实时语音，显示提示
  if (trtc.isWeapp) {
    return (
      <View className="rounded-xl p-3 mb-4 flex items-center gap-2" style={{
        background: 'rgba(55, 65, 81, 0.5)',
        border: '1px solid #4b5563',
      }}>
        <Text className="block text-gray-500 text-xs flex-1">
          小程序环境不支持实时语音，请在安卓 App 中体验
        </Text>
      </View>
    )
  }

  // 未加入房间
  if (!trtc.joined) {
    return (
      <View className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{
        background: 'rgba(55, 65, 81, 0.5)',
        border: '1px solid #4b5563',
      }}>
        <View className="flex items-center gap-2 flex-1">
          <Text className="block text-gray-400 text-xs">
            {trtc.error || '加入语音房间开启实时通话'}
          </Text>
        </View>
        <Button
          className="bg-blue-600 text-white text-xs px-3 py-1"
          onClick={trtc.joinRoom}
          disabled={trtc.connecting}
        >
          {trtc.connecting ? '连接中...' : '加入语音'}
        </Button>
      </View>
    )
  }

  // 已加入房间
  return (
    <View className="rounded-xl p-3 mb-4" style={{
      background: 'rgba(55, 65, 81, 0.7)',
      border: `1px solid ${trtc.micOn && isMyTurn ? '#34d39966' : '#4b5563'}`,
    }}>
      <View className="flex items-center justify-between">
        <View className="flex items-center gap-2 flex-1">
          {/* 连接状态点 */}
          <View
            className="rounded-full"
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: trtc.micOn && isMyTurn ? '#34d399' : '#9ca3af',
              boxShadow: trtc.micOn && isMyTurn ? '0 0 6px rgba(52, 211, 153, 0.8)' : 'none',
            }}
          />
          <View className="flex flex-col">
            {isMyTurn ? (
              <Text className="block text-xs font-medium" style={{
                color: trtc.micOn ? '#34d399' : '#9ca3af',
              }}>
                {trtc.micOn ? '正在发言' : '麦克风已关闭'}
              </Text>
            ) : (
              <Text className="block text-gray-400 text-xs">
                {currentPlayerName} 发言中 · 静音收听
              </Text>
            )}
            <Text className="block text-gray-500 text-xs mt-0.5">
              {trtc.peerCount > 0 ? `${trtc.peerCount + 1} 人在线` : '仅你一人'}
            </Text>
          </View>
        </View>

        {/* 麦克风按钮 - 仅当前回合玩家可操作 */}
        {isMyTurn ? (
          <View
            className="rounded-full flex items-center justify-center"
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: trtc.micOn ? '#dc2626' : '#374151',
              border: `1px solid ${trtc.micOn ? '#ef4444' : '#4b5563'}`,
              boxShadow: trtc.micOn ? '0 2px 8px rgba(220, 38, 38, 0.5)' : 'none',
            }}
            onClick={trtc.toggleMic}
          >
            <Text className="block text-white text-lg">
              {trtc.micOn ? '🎙' : '🔇'}
            </Text>
          </View>
        ) : (
          <View
            className="rounded-full flex items-center justify-center"
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              opacity: 0.5,
            }}
          >
            <Text className="block text-gray-600 text-lg">🔇</Text>
          </View>
        )}
      </View>

      {/* 错误提示 */}
      {trtc.error && (
        <Text className="block text-red-400 text-xs mt-2">{trtc.error}</Text>
      )}
    </View>
  )
}