import { useState, useEffect, useCallback } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const EQUIPMENT_MAP: Record<string, string> = {
  'smoke': '烟雾弹', 'injunction': '禁制令', 'coffee': '咖啡',
  'blackmail': '勒索信', 'vest': '防弹衣', 'medkit': '急救包',
  'scope': '瞄准镜', 'fakeIntel': '假情报', 'doubleShot': '双倍射击',
  'snatch': '抢夺', 'swap': '调换', 'silence': '沉默令',
  'recon': '侦查令', 'flare': '信号弹', 'shield': '防弹盾', 'bribe': '贿赂',
}

const EQUIPMENT_INFO: Record<string, { name: string; desc: string }> = {
  smoke: { name: '烟雾弹', desc: '游戏方向反转' },
  injunction: { name: '禁制令', desc: '禁止1名玩家执行1种行动' },
  coffee: { name: '咖啡', desc: '立即进行1个额外回合' },
  blackmail: { name: '勒索信', desc: '与1名玩家交换1张底细牌' },
  vest: { name: '防弹衣', desc: '取消1次射击伤害' },
  medkit: { name: '急救包', desc: '移除首领受伤标记' },
  scope: { name: '瞄准镜', desc: '查看自己1张底细牌' },
  fakeIntel: { name: '假情报', desc: '将1张翻开的底细牌翻回' },
  doubleShot: { name: '双倍射击', desc: '本回合可射击2次' },
  snatch: { name: '抢夺', desc: '抢走1名玩家的手枪' },
  swap: { name: '调换', desc: '与1名玩家交换装备' },
  silence: { name: '沉默令', desc: '指定玩家下回合不能用装备' },
  recon: { name: '侦查令', desc: '查看1名玩家所有底细牌' },
  flare: { name: '信号弹', desc: '所有玩家翻开1张底细牌' },
  shield: { name: '防弹盾', desc: '免疫所有射击直到下回合' },
  bribe: { name: '贿赂', desc: '偷取1名玩家的装备牌' },
}

interface ServerPlayer {
  id: string; name: string; alive: boolean; eliminated: boolean; isBot?: boolean;
  hasGun?: boolean; aimingAt?: string; equipment?: any; wounded?: boolean;
  cards?: any[]; faceUpCount?: number;
}

const GAME_PAGE = () => {
  const router = useRouter()
  const roomCode = router.params.roomCode || ''
  const playerId = router.params.playerId || Taro.getStorageSync('playerId') || ''

  const [serverState, setServerState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionModal, setActionModal] = useState<string | null>(null)
  const [equipmentResult, setEquipmentResult] = useState<{ name: string; desc: string } | null>(null)
  const [investigateResult, setInvestigateResult] = useState<{ card: string; cardTypeName: string; targetName: string } | null>(null)
  const [notification, setNotification] = useState<{ title: string; msg: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchGameState = useCallback(async () => {
    try {
      const res = await Network.request({ url: `/api/game/room/${roomCode}/state?playerId=${playerId}` })
      const result = res.data as any
      if (result.code === 0) {
        const state = result.data
        setServerState(state)
        if (state.status === 'ended') {
          setTimeout(() => {
            Taro.redirectTo({ url: `/pages/result/index?roomCode=${roomCode}&winner=${state.winner || ''}` })
          }, 1500)
          return
        }
      }
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false)
    }
  }, [roomCode, playerId])

  useEffect(() => {
    fetchGameState()
    const timer = setInterval(fetchGameState, 2500)
    return () => clearInterval(timer)
  }, [fetchGameState])

  const showNotification = (title: string, msg: string) => {
    setNotification({ title, msg })
    setTimeout(() => setNotification(null), 3000)
  }

  const allPlayers: ServerPlayer[] = serverState?.players || []
  const me = allPlayers.find(p => p.id === playerId)
  const currentPlayerDeviceId = serverState?.currentPlayerDeviceId || ''
  const isMyTurn = currentPlayerDeviceId === playerId && me && !me.eliminated
  const currentPlayerName = allPlayers.find(p => p.id === currentPlayerDeviceId)?.name || '未知'
  const alivePlayers = allPlayers.filter(p => !p.eliminated)
  const enemyPlayers = alivePlayers.filter(p => p.id !== playerId)

  const getEquipKey = (equip: any): string | null => {
    if (!equip) return null
    const name = typeof equip === 'string' ? equip : equip.name
    return EQUIPMENT_MAP[name] || name
  }

  const myEquipmentKey = me?.equipment ? getEquipKey(me.equipment) : null

  const submitAction = async (action: string, target: string = '', extra: any = {}) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const data: any = { playerId, action }
      if (target) data.target = target
      Object.assign(data, extra)
      const res = await Network.request({
        url: `/api/game/room/${roomCode}/action`,
        method: 'POST',
        data,
      })
      const result = res.data as any
      if (result.code === 0) {
        const rd = result.data || {}
        if (rd.result) setInvestigateResult(rd.result)
        if (rd.equipment) setEquipmentResult(rd.equipment)
        if (rd.notification) showNotification(rd.notification.title, rd.notification.msg)
        setActionModal(null)
        await fetchGameState()
      } else {
        Taro.showToast({ title: result.msg || '操作失败', icon: 'none' })
      }
    } catch (err: any) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const getEquipmentName = (equip: any): string => {
    if (!equip) return ''
    const key = typeof equip === 'string' ? equip : equip.name
    return EQUIPMENT_INFO[key]?.name || EQUIPMENT_MAP[key] || key
  }

  const getEquipmentDesc = (equip: any): string => {
    if (!equip) return ''
    const key = typeof equip === 'string' ? equip : equip.name
    return EQUIPMENT_INFO[key]?.desc || ''
  }

  const getMyIdentityText = (): string => {
    if (!me) return ''
    const cards = me.cards || []
    const flipped = cards.filter(c => c.faceUp)
    const allTypes = cards.map(c => c.identity)
    if (allTypes.includes('chief') && allTypes.includes('mastermind')) return '☠️ 双面间谍（独自获胜）'
    if (allTypes.includes('chief')) return '🔍 探长 / 忠诚阵营首领'
    if (allTypes.includes('mastermind')) return '💀 主谋 / 变节阵营首领'
    const flippedTypes = flipped.map(c => c.identity)
    const loyalCount = flippedTypes.filter(t => t === 'loyal').length
    const traitorCount = flippedTypes.filter(t => t === 'traitor').length
    if (flipped.length === 0) return '❓ 身份待定'
    if (loyalCount > traitorCount) return '🔵 忠诚阵营'
    if (traitorCount > loyalCount) return '🔴 变节阵营'
    return '❓ 身份待定'
  }

  const getPlayerBorderColor = (p: ServerPlayer): string => {
    if (p.eliminated) return '#1f2937'
    if (currentPlayerDeviceId === p.id) return '#22c55e'
    if (p.id === playerId) return '#3b82f6'
    return '#374151'
  }

  // Distribute players around the border
  const total = allPlayers.length
  const topRow = allPlayers.slice(0, Math.ceil(total / 2))
  const bottomRow = allPlayers.slice(Math.ceil(total / 2))

  if (!serverState) {
    return (
      <View className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <View className="text-center">
          {loading ? (
            <>
              <Text className="block text-3xl mb-4">🔍</Text>
              <Text className="block text-gray-400 text-sm">正在加载游戏...</Text>
            </>
          ) : (
            <>
              <Text className="block text-3xl mb-4">⚠️</Text>
              <Text className="block text-gray-400 text-sm mb-4">无法加载游戏状态</Text>
              <Button className="bg-blue-600 text-white rounded-xl px-6 py-2" onClick={fetchGameState}>
                <Text>重试</Text>
              </Button>
            </>
          )}
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* 通知横幅 */}
      {notification && (
        <View style={{
          position: 'absolute', top: 10, left: 10, right: 10, zIndex: 100,
          backgroundColor: 'rgba(59,130,246,0.9)', borderRadius: 12, padding: '12px 16px',
        }}
        >
          <Text className="block text-white text-sm font-bold">{notification.title}</Text>
          <Text className="block text-blue-100 text-xs mt-1">{notification.msg}</Text>
        </View>
      )}

      {/* 顶部状态栏 */}
      <View style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', backgroundColor: '#111827',
      }}
      >
        <Text className="block text-xs text-gray-400">房间 {roomCode}</Text>
        <Text className="block text-xs text-gray-400">第{serverState.round || 1}轮</Text>
        <Text className="block text-xs text-gray-400">手枪×{serverState.gunCount || 0}</Text>
      </View>

      {/* 玩家布局 - 边框围一圈 */}
      <View className="flex-1" style={{ position: 'relative', padding: 0 }}>
        {/* 身份提示 */}
        {me && !me.eliminated && (
          <View style={{
            position: 'absolute', top: 8, left: 0, right: 0, zIndex: 10,
            display: 'flex', justifyContent: 'center',
          }}
          >
            <View style={{
              backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 20,
              padding: '4px 16px', borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
            }}
            >
              <Text className="block text-xs text-blue-300">{getMyIdentityText()}</Text>
            </View>
          </View>
        )}

        {/* 当前回合提示 */}
        <View style={{
          position: 'absolute', top: 38, left: 0, right: 0, zIndex: 10,
          display: 'flex', justifyContent: 'center',
        }}
        >
          <Text className={`block text-xs font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
            {isMyTurn ? '🎯 轮到你了！' : `⏳ ${currentPlayerName} 行动中...`}
          </Text>
        </View>

        {/* Top Row Players */}
        <View style={{
          position: 'absolute', top: 58, left: 0, right: 0, zIndex: 5,
          display: 'flex', justifyContent: 'center', gap: '8px', padding: '0 8px',
        }}
        >
          {topRow.map((p) => (
            <PlayerAvatar
              key={p.id}
              player={p}
              isMe={p.id === playerId}
              isCurrent={currentPlayerDeviceId === p.id && !isMyTurn}
              borderColor={getPlayerBorderColor(p)}
              allPlayers={allPlayers}
              onShowEquipment={(pl) => {
                if (pl.equipment) {
                  showNotification(`🎒 ${pl.name}的装备`, getEquipmentName(pl.equipment) + ' - ' + getEquipmentDesc(pl.equipment))
                }
              }}
            />
          ))}
        </View>

        {/* Bottom Row Players */}
        {bottomRow.length > 0 && (
          <View style={{
            position: 'absolute', bottom: 140, left: 0, right: 0, zIndex: 5,
            display: 'flex', justifyContent: 'center', gap: '8px', padding: '0 8px',
          }}
          >
            {bottomRow.map((p) => (
              <PlayerAvatar
                key={p.id}
                player={p}
                isMe={p.id === playerId}
                isCurrent={currentPlayerDeviceId === p.id && !isMyTurn}
                borderColor={getPlayerBorderColor(p)}
                allPlayers={allPlayers}
                onShowEquipment={(pl) => {
                  if (pl.equipment) {
                    showNotification(`🎒 ${pl.name}的装备`, getEquipmentName(pl.equipment) + ' - ' + getEquipmentDesc(pl.equipment))
                  }
                }}
              />
            ))}
          </View>
        )}

        {/* 瞄准线/箭头 - 简化版：直接用文字表示 */}
        {allPlayers.filter(p => p.hasGun && p.aimingAt && !p.eliminated).map(shooter => {
          const target = allPlayers.find(p => p.id === shooter.aimingAt)
          if (!target) return null
          return (
            <View key={`aim-${shooter.id}`} style={{
              position: 'absolute', top: '50%', left: 0, right: 0, zIndex: 3,
              display: 'flex', justifyContent: 'center',
            }}
            >
              <View style={{
                backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 12,
                padding: '2px 12px', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
              }}
              >
                <Text className="block text-xs text-red-400">
                  🔫 {shooter.name} → {target.name}
                </Text>
              </View>
            </View>
          )
        })}

        {/* 调查结果显示 */}
        {investigateResult && (
          <View style={{
            position: 'absolute', top: '35%', left: 0, right: 0, zIndex: 50,
            display: 'flex', justifyContent: 'center',
          }}
          >
            <View style={{
              backgroundColor: 'rgba(17,24,39,0.95)', borderRadius: 16,
              padding: '16px 24px', borderWidth: 1, borderColor: 'rgba(59,130,246,0.5)',
              margin: '0 32px',
            }}
            >
              <Text className="block text-sm text-blue-300 mb-2">🔍 调查结果</Text>
              <Text className="block text-base text-white font-bold">
                {investigateResult.targetName} 的第{investigateResult.card}张底细牌是:
              </Text>
              <View style={{
                backgroundColor: investigateResult.cardTypeName === '变节' || investigateResult.cardTypeName === '主谋'
                  ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                borderRadius: 8, padding: '8px 16px', marginTop: 8,
                borderWidth: 1,
                borderColor: investigateResult.cardTypeName === '变节' || investigateResult.cardTypeName === '主谋'
                  ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)',
              }}
              >
                <Text className={`block text-center font-bold text-lg ${
                  investigateResult.cardTypeName === '变节' || investigateResult.cardTypeName === '主谋'
                    ? 'text-red-400' : 'text-blue-400'
                }`}
                >
                  {investigateResult.cardTypeName}
                </Text>
              </View>
              <Button className="bg-blue-600 text-white rounded-xl px-4 py-1 mt-3"
                onClick={() => setInvestigateResult(null)}
              >
                <Text>确认</Text>
              </Button>
            </View>
          </View>
        )}

        {/* 装备获取结果显示 */}
        {equipmentResult && (
          <View style={{
            position: 'absolute', top: '35%', left: 0, right: 0, zIndex: 50,
            display: 'flex', justifyContent: 'center',
          }}
          >
            <View style={{
              backgroundColor: 'rgba(17,24,39,0.95)', borderRadius: 16,
              padding: '16px 24px', borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)',
              margin: '0 32px',
            }}
            >
              <Text className="block text-sm text-yellow-300 mb-2">🎒 获得装备</Text>
              <Text className="block text-white font-bold text-lg">{equipmentResult.name}</Text>
              <Text className="block text-gray-400 text-xs mt-1">{equipmentResult.desc}</Text>
              <Button className="bg-yellow-600 text-white rounded-xl px-4 py-1 mt-3"
                onClick={() => setEquipmentResult(null)}
              >
                <Text>确认</Text>
              </Button>
            </View>
          </View>
        )}
      </View>

      {/* 底部行动区 */}
      <View style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
        backgroundColor: '#111827', borderTopWidth: 1, borderTopColor: '#1f2937',
        padding: '8px 12px', paddingBottom: '12px',
      }}
      >
        {isMyTurn ? (
          <>
            {/* 行动按钮网格 */}
            <View style={{ display: 'flex', flexDirection: 'row', gap: '6px', marginBottom: '8px' }}>
              <ActionBtn icon="🔍" label="调查" desc="查看底细牌"
                onClick={() => setActionModal('investigate')}
              />
              <ActionBtn icon="🎒" label="取得装备" desc="抽1张装备"
                onClick={() => setActionModal('equip')}
              />
              <ActionBtn icon="🔫" label="手枪" desc="拿手枪+瞄准"
                onClick={() => setActionModal('gun')} disabled={!serverState.gunCount}
              />
              <ActionBtn icon="💥" label="射击" desc="开枪"
                onClick={() => setActionModal('shoot')}
                disabled={!(me?.hasGun && me?.aimingAt)}
              />
            </View>

            {/* 装备使用（如果有装备） */}
            {myEquipmentKey && (
              <View style={{ display: 'flex', flexDirection: 'row', gap: '6px' }}>
                <ActionBtn icon="⚡" label={`使用 ${getEquipmentName(me?.equipment)}`}
                  desc={getEquipmentDesc(me?.equipment)}
                  onClick={() => setActionModal('useEquipment')}
                />
              </View>
            )}
          </>
        ) : (
          <Text className="block text-center text-gray-500 text-xs py-3">
            ⏳ 等待 {currentPlayerName} 行动...
          </Text>
        )}
      </View>

      {/* 行动弹窗: 调查 */}
      <Dialog open={actionModal === 'investigate'} onOpenChange={(o) => !o && setActionModal(null)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">🔍 调查目标</DialogTitle>
          </DialogHeader>
          <View className="space-y-2 mt-2">
            {enemyPlayers.map(p => (
              <Button key={p.id}
                className="bg-[#2a2f3e] text-white rounded-xl py-3 w-full text-left"
                onClick={() => {
                  submitAction('investigate', p.id)
                }}
              >
                <Text>{p.name}</Text>
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 行动弹窗: 装备 */}
      <Dialog open={actionModal === 'equip'} onOpenChange={(o) => !o && setActionModal(null)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">🎒 取得装备</DialogTitle>
          </DialogHeader>
          <Text className="block text-gray-400 text-xs mt-2 mb-3">
            {me?.equipment ? '已有装备将被放回牌库' : ''}
          </Text>
          <Button className="bg-yellow-600 text-white rounded-xl py-3 w-full"
            onClick={() => submitAction('equip')}
          >
            <Text>抽装备牌</Text>
          </Button>
        </DialogContent>
      </Dialog>

      {/* 行动弹窗: 手枪 */}
      <Dialog open={actionModal === 'gun'} onOpenChange={(o) => !o && setActionModal(null)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">🔫 拿手枪</DialogTitle>
          </DialogHeader>
          <Text className="block text-gray-400 text-xs mt-2 mb-3">选择瞄准目标：</Text>
          <View className="space-y-2">
            {enemyPlayers.map(p => (
              <Button key={p.id}
                className="bg-[#2a2f3e] text-white rounded-xl py-3 w-full text-left"
                onClick={() => submitAction('gun', p.id)}
              >
                <Text>🎯 {p.name}</Text>
              </Button>
            ))}
          </View>
        </DialogContent>
      </Dialog>

      {/* 行动弹窗: 射击 */}
      <Dialog open={actionModal === 'shoot'} onOpenChange={(o) => !o && setActionModal(null)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-red-400">💥 确认射击</DialogTitle>
          </DialogHeader>
          <Text className="block text-gray-300 text-sm mt-2 mb-3">
            你当前瞄准了：{allPlayers.find(p => p.id === me?.aimingAt)?.name || '无人'}
          </Text>
          <View style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
            <Button className="bg-red-600 text-white rounded-xl py-3 flex-1"
              onClick={() => submitAction('shoot')}
            >
              <Text>💥 开枪</Text>
            </Button>
            <Button className="bg-gray-600 text-white rounded-xl py-3 flex-1"
              onClick={() => setActionModal(null)}
            >
              <Text>取消</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 装备使用弹窗 */}
      <Dialog open={actionModal === 'useEquipment'} onOpenChange={(o) => !o && setActionModal(null)}>
        <DialogContent className="bg-[#1a1f2e] text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-yellow-400">⚡ 使用装备</DialogTitle>
          </DialogHeader>
          <Text className="block text-white text-sm mt-2 mb-1 font-bold">
            {myEquipmentKey ? getEquipmentName(me?.equipment) : ''}
          </Text>
          <Text className="block text-gray-400 text-xs mb-3">
            {myEquipmentKey ? getEquipmentDesc(me?.equipment) : ''}
          </Text>
          <View className="space-y-2">
            <Button className="bg-yellow-600 text-white rounded-xl py-3 w-full"
              onClick={() => { submitAction('useEquipment') }}
            >
              <Text>使用</Text>
            </Button>
            <Button className="bg-gray-600 text-white rounded-xl py-3 w-full"
              onClick={() => setActionModal(null)}
            >
              <Text>取消</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 安全区域 */}
      <View style={{ height: '110px' }} />
    </View>
  )
}

// Player Avatar Component
function PlayerAvatar({ player, isMe, isCurrent, borderColor, allPlayers, onShowEquipment }: {
  player: ServerPlayer; isMe: boolean; isCurrent: boolean;
  borderColor: string; allPlayers: ServerPlayer[];
  onShowEquipment: (p: ServerPlayer) => void;
}) {
  const initials = player.name.slice(0, 2)
  const targetName = player.hasGun && player.aimingAt
    ? allPlayers.find(p => p.id === player.aimingAt)?.name || '' : ''

  return (
    <View style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
      width: player.eliminated ? '64px' : '64px',
      opacity: player.eliminated ? 0.4 : 1,
    }}
    >
      {/* Avatar circle */}
      <View style={{
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: player.eliminated ? '#1f2937' : isMe ? '#1e40af' : '#1a1f2e',
        borderWidth: 2, borderColor: borderColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
      >
        <Text className={`block font-bold ${player.eliminated ? 'text-gray-600' : 'text-white'}`}
          style={{ fontSize: '16px' }}
        >{initials}</Text>

        {/* Status icons around avatar */}
        {player.hasGun && !player.eliminated && (
          <View style={{ position: 'absolute', top: -6, right: -6 }}>
            <Text className="block" style={{ fontSize: '14px' }}>🔫</Text>
          </View>
        )}
        {player.equipment && !player.eliminated && (
          <View style={{ position: 'absolute', bottom: -4, right: -8 }}>
            <Text className="block" style={{ fontSize: '12px' }}
              onClick={() => onShowEquipment(player)}
            >🎒</Text>
          </View>
        )}
        {player.wounded && !player.eliminated && (
          <View style={{ position: 'absolute', top: -4, left: -6 }}>
            <Text className="block" style={{ fontSize: '12px' }}>🩹</Text>
          </View>
        )}
      </View>

      {/* Player name */}
      <Text className={`block text-xs text-center truncate ${player.eliminated ? 'text-gray-500' : 'text-gray-300'}`}
        style={{ maxWidth: '64px', fontSize: '11px', lineHeight: '14px' }}
      >
        {player.name}
      </Text>

      {/* Status */}
      {player.eliminated && (
        <Text className="block text-gray-600 text-xs">💀</Text>
      )}

      {/* Aiming indicator */}
      {player.hasGun && player.aimingAt && targetName && !player.eliminated && (
        <View style={{
          backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 4,
          padding: '1px 6px', marginTop: 1,
        }}
        >
          <Text className="block text-red-400 text-xs" style={{ fontSize: '9px', lineHeight: '12px' }}>
            → {targetName.slice(0, 3)}
          </Text>
        </View>
      )}

      {/* Current turn indicator */}
      {isCurrent && (
        <View style={{
          width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginTop: 1,
        }}
        />
      )}
    </View>
  )
}

// Action Button Component
function ActionBtn({ icon, label, desc, onClick, disabled }: {
  icon: string; label: string; desc: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <View style={{
      flex: 1, backgroundColor: disabled ? '#1a1f2e' : '#1e3a5f',
      borderRadius: 10, padding: '8px 4px',
      borderWidth: 1, borderColor: disabled ? '#1f2937' : 'rgba(59,130,246,0.3)',
      opacity: disabled ? 0.5 : 1,
    }} onClick={disabled ? undefined : onClick}
    >
      <Text className={`block text-center ${disabled ? 'text-gray-600' : 'text-white'}`}
        style={{ fontSize: '18px' }}
      >{icon}</Text>
      <Text className={`block text-center text-xs mt-1 ${disabled ? 'text-gray-600' : 'text-gray-300'}`}
        style={{ fontSize: '11px', lineHeight: '14px' }}
      >{label}</Text>
      <Text className={`block text-center ${disabled ? 'text-gray-700' : 'text-gray-500'}`}
        style={{ fontSize: '9px', lineHeight: '12px' }}
      >{desc}</Text>
    </View>
  )
}

export default GAME_PAGE