import { Injectable, Logger } from '@nestjs/common';
import { GameRoomService, PlayerInfo } from './game-room.service';

// ==================== Types ====================
type IdentityType = 'chief' | 'mastermind' | 'loyal' | 'traitor';
type GamePhase = 'identity' | 'playing' | 'result';
type ActionType = 'investigate' | 'equip' | 'gun' | 'shoot';
type Direction = 1 | -1;

interface IdentityCard {
  id: string;
  type: IdentityType;
  faceUp: boolean;
}

interface EquipmentCard {
  id: string;
  name: string;
  description: string;
  iconName: string;
}

interface PlayerState {
  id: string;
  name: string;
  cards: IdentityCard[];
  equipment: EquipmentCard | null;
  hasGun: boolean;
  aimingAt: string | null;
  wounded: boolean;
  eliminated: boolean;
  bannedAction: ActionType | null;
  silenced: boolean;
  isBot: boolean;
}

interface LogEntry {
  round: number;
  message: string;
  type: 'action' | 'info' | 'eliminate' | 'equip' | 'result' | 'bot';
}

interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerIndex: number;
  direction: Direction;
  equipmentDeck: EquipmentCard[];
  equipmentDiscard: EquipmentCard[];
  gunCount: number;
  round: number;
  gameLog: LogEntry[];
  winner: 'loyal' | 'traitor' | 'solo' | null;
  /** 当前正在等待的设备玩家ID */
  currentPlayerDeviceId: string;
  /** 调查结果临时存储 */
  investigationResult: any | null;
}

const EQUIPMENT_LIST = [
  { name: '烟雾弹', description: '游戏方向反转（顺时针变逆时针或反之）', iconName: 'cloud-fog' },
  { name: '禁制令', description: '指定1名玩家，禁止其执行1种行动', iconName: 'ban' },
  { name: '咖啡', description: '立即进行1个额外回合', iconName: 'coffee' },
  { name: '勒索信', description: '与1名其他玩家交换1张底细牌（不可查看）', iconName: 'mail' },
  { name: '防弹衣', description: '取消1次射击伤害', iconName: 'shield' },
  { name: '急救包', description: '移除1名首领的受伤标记', iconName: 'plus' },
  { name: '瞄准镜', description: '查看自己的1张底细牌', iconName: 'eye' },
  { name: '假情报', description: '将1张已翻开的底细牌翻回背面', iconName: 'file-question' },
  { name: '双倍射击', description: '本回合可以射击2次', iconName: 'crosshair' },
  { name: '抢夺', description: '抢走1名持有手枪玩家的手枪', iconName: 'hand' },
  { name: '调换', description: '与1名玩家交换装备牌', iconName: 'repeat' },
  { name: '沉默令', description: '指定玩家下回合不能使用装备牌', iconName: 'volume-x' },
  { name: '侦查令', description: '查看1名玩家的所有底细牌', iconName: 'search' },
  { name: '信号弹', description: '所有玩家翻开1张底细牌', iconName: 'flame' },
  { name: '防弹盾', description: '免疫所有射击直到下个回合', iconName: 'shield-plus' },
  { name: '贿赂', description: '偷取1名玩家的1张装备牌', iconName: 'dollar-sign' },
];

@Injectable()
export class GameLogicService {
  private readonly logger = new Logger(GameLogicService.name);

  constructor(private gameRoomService: GameRoomService) {}

  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** 初始化游戏，生成游戏状态 */
  async startGame(roomCode: string): Promise<GameState> {
    const room = await this.gameRoomService.getRoom(roomCode);
    const playerCount = room.players.length;

    // 生成底细牌
    const identityDeck = this.createIdentityDeck(playerCount);
    const equipDeck = this.createEquipmentDeck();

    // 分配牌给玩家
    const playerStates: PlayerState[] = [];
    const deck = [...identityDeck];

    for (let i = 0; i < playerCount; i++) {
      const cards: IdentityCard[] = [];
      // 每人3张底细牌
      for (let j = 0; j < 3; j++) {
        cards.push(deck.shift()!);
      }
      playerStates.push({
        id: room.players[i].id,
        name: room.players[i].name,
        cards,
        equipment: null,
        hasGun: false,
        aimingAt: null,
        wounded: false,
        eliminated: false,
        bannedAction: null,
        silenced: false,
        isBot: room.players[i].isBot || false,
      });
    }

    // 每人抽1张装备牌
    const remainingEquip = [...equipDeck];
    for (let i = 0; i < playerCount; i++) {
      playerStates[i].equipment = remainingEquip.shift() || null;
    }

    const gameState: GameState = {
      phase: 'identity',
      players: playerStates,
      currentPlayerIndex: 0,
      direction: 1,
      equipmentDeck: remainingEquip,
      equipmentDiscard: [],
      gunCount: 4,
      round: 1,
      gameLog: [{ round: 0, message: `游戏开始！共有 ${playerCount} 名玩家。`, type: 'info' }],
      winner: null,
      currentPlayerDeviceId: playerStates[0].id,
      investigationResult: null,
    };

    // 保存到数据库，状态改为 playing
    await this.gameRoomService.updateRoom(roomCode, {
      status: 'playing',
      gameState,
    });

    return gameState;
  }

  /** 获取下一名存活玩家 */
  private getNextAlivePlayer(players: PlayerState[], currentIndex: number, direction: Direction): number {
    const count = players.length;
    let nextIndex = (currentIndex + direction + count) % count;
    let attempts = 0;
    while (players[nextIndex].eliminated && attempts < count) {
      nextIndex = (nextIndex + direction + count) % count;
      attempts++;
    }
    return nextIndex;
  }

  /** 判断玩家阵营 */
  determineAlignment(cards: IdentityCard[]): 'loyal' | 'traitor' | 'solo' {
    const hasChief = cards.some(c => c.type === 'chief');
    const hasMastermind = cards.some(c => c.type === 'mastermind');
    if (hasChief && hasMastermind) return 'solo';
    if (hasChief) return 'loyal';
    if (hasMastermind) return 'traitor';
    const loyalCount = cards.filter(c => c.type === 'loyal').length;
    const traitorCount = cards.filter(c => c.type === 'traitor').length;
    return loyalCount >= traitorCount ? 'loyal' : 'traitor';
  }

  /** 检查胜负 */
  private checkWin(players: PlayerState[]): { winner: 'loyal' | 'traitor' | 'solo' | null; message: string } {
    for (const player of players) {
      if (!player.eliminated) {
        const hasChief = player.cards.some(c => c.type === 'chief');
        const hasMastermind = player.cards.some(c => c.type === 'mastermind');
        if (hasChief && hasMastermind) {
          return { winner: 'solo', message: `${player.name} 同时持有探长和主谋，独自获胜！` };
        }
      }
    }
    const mastermindPlayer = players.find(p => p.cards.some(c => c.type === 'mastermind'));
    const chiefPlayer = players.find(p => p.cards.some(c => c.type === 'chief'));
    if (mastermindPlayer?.eliminated) return { winner: 'loyal', message: '主谋被淘汰，忠诚阵营获胜！' };
    if (chiefPlayer?.eliminated) return { winner: 'traitor', message: '探长被淘汰，变节阵营获胜！' };
    return { winner: null, message: '' };
  }

  /** 处理玩家行动 */
  async performAction(
    roomCode: string,
    playerId: string,
    action: string,
    payload: any,
  ): Promise<GameState> {
    const room = await this.gameRoomService.getRoom(roomCode);
    const gameState = room.gameState as GameState;
    if (!gameState) throw new Error('游戏未开始');

    // 验证当前行动玩家
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      throw new Error('不是你的回合');
    }

    let newState = { ...gameState, players: [...gameState.players], gameLog: [...gameState.gameLog] };

    switch (action) {
      case 'investigate':
        newState = this.handleInvestigate(newState, payload);
        break;
      case 'equip':
        newState = this.handleEquip(newState, payload);
        break;
      case 'gun':
        newState = this.handleGun(newState, payload);
        break;
      case 'shoot':
        newState = this.handleShoot(newState, payload);
        break;
      case 'aim':
        newState = this.handleAim(newState, payload);
        break;
      case 'endTurn':
        newState = this.handleEndTurn(newState);
        break;
      case 'useEquipment':
        newState = this.handleUseEquipment(newState, payload);
        break;
      default:
        throw new Error(`未知行动: ${action}`);
    }

    // 检查胜负
    if (!newState.winner) {
      const winResult = this.checkWin(newState.players);
      if (winResult.winner) {
        newState.winner = winResult.winner;
        newState.gameLog.push({ round: newState.round, message: winResult.message, type: 'result' });
        newState.phase = 'result';
      }
    }

    // 自动结束回合（investigate/equip/gun/shoot/use_equipment 后自动结束）
    const autoEndActions = ['investigate', 'equip', 'gun', 'shoot', 'use_equipment'];
    if (autoEndActions.includes(action) && !newState.winner) {
      newState = this.handleEndTurn(newState);
    }

    // 保存到数据库
    await this.gameRoomService.updateRoom(roomCode, { gameState: newState });

    // 自动处理后续机器人的回合（processBotTurns 内部会自己保存到数据库）
    if (!newState.winner) {
      newState = await this.processBotTurns(roomCode, newState);
    }

    return newState;
  }

  /** 自动处理机器人回合 */
  private async processBotTurns(roomCode: string, state: GameState): Promise<GameState> {
    let currentState = { ...state, players: [...state.players], gameLog: [...state.gameLog] };
    const maxBots = 10; // 防止无限循环

    for (let i = 0; i < maxBots; i++) {
      const currentPlayer = currentState.players[currentState.currentPlayerIndex];
      if (!currentPlayer.isBot || currentState.winner) break;

      // 机器人随机选择行动
      const actions = this.getBotActions(currentState, currentPlayer);
      if (actions.length === 0) break;

      const pickedAction = actions[Math.floor(Math.random() * actions.length)];
      let newState = { ...currentState, players: [...currentState.players], gameLog: [...currentState.gameLog] };

      switch (pickedAction.type) {
        case 'investigate': {
          newState = this.handleInvestigate(newState, pickedAction.payload);
          this.addBotLog(newState, currentPlayer.name, `调查了 ${pickedAction.payload.targetName}`);
          break;
        }
        case 'equip': {
          newState = this.handleEquip(newState, pickedAction.payload);
          this.addBotLog(newState, currentPlayer.name, '抽取了装备');
          break;
        }
        case 'gun': {
          newState = this.handleGun(newState, pickedAction.payload);
          this.addBotLog(newState, currentPlayer.name, '装备了手枪');
          break;
        }
        case 'shoot': {
          newState = this.handleShoot(newState, {});
          this.addBotLog(newState, currentPlayer.name, '开枪射击！');
          break;
        }
        case 'aim': {
          newState = this.handleAim(newState, pickedAction.payload);
          break;
        }
        case 'useEquipment': {
          newState = this.handleUseEquipment(newState, pickedAction.payload);
          this.addBotLog(newState, currentPlayer.name, `使用了 ${pickedAction.payload.effect}`);
          break;
        }
      }

      // 检查胜负
      if (!newState.winner) {
        const winResult = this.checkWin(newState.players);
        if (winResult.winner) {
          newState.winner = winResult.winner;
          newState.gameLog.push({ round: newState.round, message: winResult.message, type: 'result' });
          newState.phase = 'result';
          currentState = newState;
          break;
        }
      }

      // 结束机器人回合
      currentState = this.handleEndTurn(newState);
      await this.gameRoomService.updateRoom(roomCode, { gameState: currentState });

      if (currentState.winner) break;
    }

    return currentState;
  }

  private addBotLog(state: GameState, botName: string, action: string) {
    state.gameLog.push({
      round: state.round,
      message: `🤖 ${botName} ${action}`,
      type: 'bot',
    });
  }

  /** 获取机器人可用的行动列表 */
  private getBotActions(state: GameState, player: any): Array<{ type: string; payload: any; targetName?: string }> {
    const actions: Array<{ type: string; payload: any }> = [];
    const aliveOthers = state.players.filter(p => p.id !== player.id && !p.eliminated);
    const aliveEnemies = aliveOthers.filter(p => !p.isBot);

    // 如果有装备未使用，随机使用
    if (player.equipment && !player.silenced) {
      actions.push({ type: 'useEquipment', payload: { effect: player.equipment.name, data: {} } });
    }

    // 调查行动
    if (aliveOthers.length > 0) {
      const target = aliveEnemies.length > 0
        ? aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
        : aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
      const cardIndex = Math.floor(Math.random() * 3);
      actions.push({ type: 'investigate', payload: { targetId: target.id, cardIndex, targetName: target.name } });
    }

    // 装备行动
    actions.push({ type: 'equip', payload: {} });

    // 手枪行动
    if (state.gunCount > 0) {
      const aimTarget = aliveEnemies.length > 0
        ? aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
        : aliveOthers.length > 0 ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)] : null;
      actions.push({ type: 'gun', payload: { flipCardIndex: Math.floor(Math.random() * 3), aimTargetId: aimTarget?.id } });
    }

    // 射击行动
    if (player.hasGun && player.aimingAt) {
      actions.push({ type: 'shoot', payload: {} });
    }

    // 瞄准行动
    if (player.hasGun && !player.aimingAt && aliveOthers.length > 0) {
      const target = aliveEnemies.length > 0
        ? aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
        : aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
      actions.push({ type: 'aim', payload: { targetId: target.id } });
    }

    return actions;
  }

  private handleInvestigate(state: GameState, payload: any): GameState {
    const { targetId, cardIndex } = payload;
    const players = [...state.players];
    const target = players.find(p => p.id === targetId);
    if (!target) throw new Error('目标玩家不存在');

    const card = target.cards[cardIndex];
    if (!card) throw new Error('底细牌不存在');

    const cardTypeName = card.type === 'loyal' ? '忠诚' : card.type === 'traitor' ? '变节' : card.type === 'chief' ? '探长' : '主谋';

    state.gameLog.push({
      round: state.round,
      message: `🔍 调查 ${target.name} 的第 ${cardIndex + 1} 张底细牌`,
      type: 'action',
    });

    // 存储调查结果（仅调查者可见）
    state.investigationResult = {
      targetName: target.name,
      cardIndex,
      cardType: card.type,
      cardTypeName,
    };

    return state;
  }

  private handleEquip(state: GameState, payload: any): GameState {
    const players = [...state.players];
    const player = { ...players[state.currentPlayerIndex] };

    // 抽装备牌
    const deck = [...state.equipmentDeck];
    const drawnCard = deck.shift();
    if (!drawnCard) throw new Error('装备牌库已空');

    // 如果有旧装备就弃掉
    if (player.equipment) {
      state.equipmentDiscard = [...state.equipmentDiscard, player.equipment];
    }
    player.equipment = drawnCard;

    players[state.currentPlayerIndex] = player;
    state.players = players;
    state.equipmentDeck = deck;
    state.gameLog.push({
      round: state.round,
      message: `🎴 ${player.name} 获得了装备牌【${drawnCard.name}】`,
      type: 'action',
    });

    return state;
  }

  private handleGun(state: GameState, payload: any): GameState {
    const { aimTargetId } = payload;
    if (state.gunCount <= 0) throw new Error('没有手枪可用');

    const players = [...state.players];
    const player = { ...players[state.currentPlayerIndex] };

    player.hasGun = true;

    // 瞄准目标
    if (aimTargetId) {
      player.aimingAt = aimTargetId;
    }

    players[state.currentPlayerIndex] = player;
    state.players = players;
    state.gunCount--;
    state.gameLog.push({
      round: state.round,
      message: `🔫 ${player.name} 装备了手枪`,
      type: 'action',
    });

    return state;
  }

  private handleAim(state: GameState, payload: any): GameState {
    const { targetId } = payload;
    const players = [...state.players];
    const player = { ...players[state.currentPlayerIndex] };
    player.aimingAt = targetId;
    players[state.currentPlayerIndex] = player;
    state.players = players;
    return state;
  }

  private handleShoot(state: GameState, payload: any): GameState {
    const players = [...state.players];
    const shooter = players[state.currentPlayerIndex];
    const targetId = shooter.aimingAt;
    if (!targetId) throw new Error('没有瞄准目标');

    const targetIndex = players.findIndex(p => p.id === targetId);
    const target = { ...players[targetIndex] };

    // 枪放回中央
    shooter.hasGun = false;
    shooter.aimingAt = null;
    state.gunCount++;

    state.gameLog.push({
      round: state.round,
      message: `💥 ${shooter.name} 向 ${target.name} 射击！`,
      type: 'action',
    });

    // 处理伤害
    const isLeader = target.cards.some(c => c.type === 'chief' || c.type === 'mastermind');

    if (!isLeader) {
      // 非首领直接淘汰
      target.eliminated = true;
      target.cards = target.cards.map(c => ({ ...c, faceUp: true }));
      target.hasGun = false;
      target.equipment = null;
      if (target.hasGun) state.gunCount++;
      state.gameLog.push({
        round: state.round,
        message: `☠️ ${target.name} 被淘汰！`,
        type: 'eliminate',
      });
    } else {
      if (target.wounded) {
        // 第二次中枪
        target.eliminated = true;
        target.cards = target.cards.map(c => ({ ...c, faceUp: true }));
        target.hasGun = false;
        state.gameLog.push({
          round: state.round,
          message: `☠️ 首领 ${target.name} 被淘汰！`,
          type: 'eliminate',
        });
      } else {
        // 第一次中枪
        target.wounded = true;
        const deck = [...state.equipmentDeck];
        const equip = deck.shift();
        if (equip) {
          target.equipment = equip;
          state.equipmentDeck = deck;
        }
        state.gameLog.push({
          round: state.round,
          message: `🩸 首领 ${target.name} 受伤了！获得1张装备牌`,
          type: 'info',
        });
      }
    }

    players[state.currentPlayerIndex] = { ...shooter };
    players[targetIndex] = target;
    state.players = players;

    return state;
  }

  private handleEndTurn(state: GameState): GameState {
    const nextIndex = this.getNextAlivePlayer(state.players, state.currentPlayerIndex, state.direction);
    const newRound = nextIndex <= state.currentPlayerIndex && state.direction === 1
      ? state.round + 1
      : nextIndex >= state.currentPlayerIndex && state.direction === -1
        ? state.round + 1
        : state.round;

    // 重置沉默状态
    const players = state.players.map((p, i) => {
      if (i === nextIndex) return { ...p, silenced: false };
      return p;
    });

    state.currentPlayerIndex = nextIndex;
    state.round = newRound;
    state.players = players;
    state.currentPlayerDeviceId = players[nextIndex].id;

    state.gameLog.push({
      round: state.round,
      message: `👉 轮到 ${players[nextIndex].name} 行动`,
      type: 'info',
    });

    return state;
  }

  private handleUseEquipment(state: GameState, payload: any): GameState {
    const { effect, data } = payload;
    const players = [...state.players];
    const player = { ...players[state.currentPlayerIndex] };
    const equip = player.equipment;
    if (!equip) throw new Error('没有装备牌');

    // 弃掉装备
    state.equipmentDiscard = [...state.equipmentDiscard, equip];
    player.equipment = null;

    state.gameLog.push({
      round: state.round,
      message: `🎴 ${player.name} 使用了【${equip.name}】`,
      type: 'equip',
    });

    // 处理不同装备效果
    switch (effect) {
      case 'smoke': {
        state.direction = (state.direction * -1) as Direction;
        state.gameLog.push({
          round: state.round,
          message: `🔄 游戏方向反转（${state.direction === 1 ? '顺时针' : '逆时针'}）`,
          type: 'info',
        });
        break;
      }
      case 'injunction': {
        if (data?.targetId && data?.action) {
          const target = players.find(p => p.id === data.targetId);
          if (target) {
            target.bannedAction = data.action;
            state.gameLog.push({
              round: state.round,
              message: `🚫 禁止 ${target.name} 执行【${data.action}】行动`,
              type: 'info',
            });
          }
        }
        break;
      }
      case 'coffee': {
        // 当前玩家再行动一次 - 不改变currentPlayerIndex
        state.gameLog.push({
          round: state.round,
          message: `☕ ${player.name} 获得额外回合！`,
          type: 'info',
        });
        break;
      }
      case 'vest': {
        state.gameLog.push({
          round: state.round,
          message: `🛡️ ${player.name} 穿上防弹衣`,
          type: 'info',
        });
        break;
      }
      case 'doubleShot': {
        state.gameLog.push({
          round: state.round,
          message: `🎯 ${player.name} 本回合可以射击2次`,
          type: 'info',
        });
        break;
      }
      case 'steal': {
        if (data?.targetId) {
          const target = players.find(p => p.id === data.targetId);
          if (target?.hasGun) {
            target.hasGun = false;
            player.hasGun = true;
            state.gameLog.push({
              round: state.round,
              message: `🤚 ${player.name} 抢走了 ${target.name} 的手枪！`,
              type: 'info',
            });
          }
        }
        break;
      }
      case 'signal': {
        for (const p of players) {
          if (!p.eliminated) {
            const faceDownIndex = p.cards.findIndex(c => !c.faceUp);
            if (faceDownIndex >= 0) {
              p.cards[faceDownIndex] = { ...p.cards[faceDownIndex], faceUp: true };
            }
          }
        }
        state.gameLog.push({
          round: state.round,
          message: `🚨 信号弹！所有玩家翻开1张底细牌！`,
          type: 'info',
        });
        break;
      }
      case 'medkit': {
        if (data?.targetId) {
          const target = players.find(p => p.id === data.targetId);
          if (target) {
            target.wounded = false;
            state.gameLog.push({
              round: state.round,
              message: `💊 移除了 ${target.name} 的受伤标记`,
              type: 'info',
            });
          }
        }
        break;
      }
      case 'silence': {
        if (data?.targetId) {
          const target = players.find(p => p.id === data.targetId);
          if (target) {
            target.silenced = true;
            state.gameLog.push({
              round: state.round,
              message: `🤐 ${target.name} 下回合不能使用装备牌`,
              type: 'info',
            });
          }
        }
        break;
      }
      case 'falseIntel': {
        if (data?.cardIndex !== undefined) {
          if (player.cards[data.cardIndex]?.faceUp) {
            player.cards[data.cardIndex] = { ...player.cards[data.cardIndex], faceUp: false };
            state.gameLog.push({
              round: state.round,
              message: `🃏 将1张已翻开的底细牌翻回背面`,
              type: 'info',
            });
          }
        }
        break;
      }
      case 'bribe': {
        if (data?.targetId) {
          const target = players.find(p => p.id === data.targetId);
          if (target?.equipment) {
            player.equipment = target.equipment;
            target.equipment = null;
            state.gameLog.push({
              round: state.round,
              message: `💰 贿赂了 ${target.name}，偷取了装备牌`,
              type: 'info',
            });
          }
        }
        break;
      }
    }

    players[state.currentPlayerIndex] = player;
    state.players = players;

    return state;
  }

  /** 获取玩家可见的游戏状态（过滤隐私信息） */
  getVisibleGameState(gameState: GameState, viewerPlayerId: string): any {
    const players = gameState.players.map(p => {
      const isSelf = p.id === viewerPlayerId;
      return {
        id: p.id,
        name: p.name,
        // 自己能看到自己的所有牌，别人只能看到已翻开的牌
        cards: isSelf
          ? p.cards
          : p.cards.map(c => c.faceUp ? c : { id: c.id, type: 'unknown' as any, faceUp: false }),
        equipment: p.equipment,
        hasGun: p.hasGun,
        aimingAt: p.aimingAt,
        wounded: p.wounded,
        eliminated: p.eliminated,
        bannedAction: p.bannedAction,
      };
    });

    return {
      phase: gameState.phase,
      players,
      currentPlayerIndex: gameState.currentPlayerIndex,
      currentPlayerDeviceId: gameState.currentPlayerDeviceId,
      direction: gameState.direction,
      gunCount: gameState.gunCount,
      round: gameState.round,
      gameLog: gameState.gameLog,
      winner: gameState.winner,
      // 调查结果仅当前行动者可见
      investigationResult: gameState.currentPlayerDeviceId === viewerPlayerId
        ? gameState.investigationResult
        : null,
    };
  }

  private createIdentityDeck(playerCount: number): IdentityCard[] {
    const cards: IdentityType[] = ['chief', 'mastermind'];
    const totalCards = playerCount * 3;
    const regularCards = totalCards - 2;
    const ratios: Record<number, number> = { 2: 0.5, 3: 0.55, 4: 0.55, 5: 0.53, 6: 0.5, 7: 0.52, 8: 0.55 };
    const loyalRatio = ratios[playerCount] || 0.5;
    const loyalCount = Math.round(regularCards * loyalRatio);
    const traitorCount = regularCards - loyalCount;

    for (let i = 0; i < loyalCount; i++) cards.push('loyal');
    for (let i = 0; i < traitorCount; i++) cards.push('traitor');

    return this.shuffle(cards).map((type, i) => ({
      id: `id-${i}`,
      type,
      faceUp: false,
    }));
  }

  private createEquipmentDeck(): EquipmentCard[] {
    return this.shuffle(EQUIPMENT_LIST).map((e, i) => ({
      id: `eq-${i}`,
      name: e.name,
      description: e.description,
      iconName: e.iconName,
    }));
  }
}