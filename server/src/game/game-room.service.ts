import { Injectable, Logger } from '@nestjs/common';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface PlayerInfo {
  id: string;       // 玩家唯一 ID (UUID)
  name: string;     // 昵称
  isHost: boolean;  // 是否是房主
  isBot?: boolean;  // 是否是机器人
  joinedAt: string; // 加入时间
}

export interface GameRoom {
  id: string;
  roomCode: string;
  status: 'waiting' | 'playing' | 'ended';
  hostPlayerId: string;
  maxPlayers: number;
  players: PlayerInfo[];
  gameState: any;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GameRoomService {
  private readonly logger = new Logger(GameRoomService.name);

  /** 生成6位数字房间号 */
  private generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** 检查房间号是否唯一 */
  private async isRoomCodeUnique(code: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .select('id')
      .eq('room_code', code)
      .maybeSingle();
    if (error) throw new Error(`查询房间号失败: ${error.message}`);
    return !data;
  }

  /** 创建房间 */
  async createRoom(hostName: string, maxPlayers: number): Promise<{ roomCode: string; playerId: string; room: GameRoom }> {
    const playerId = crypto.randomUUID();
    let roomCode = this.generateRoomCode();

    // 确保房间号唯一
    let attempts = 0;
    while (!(await this.isRoomCodeUnique(roomCode)) && attempts < 10) {
      roomCode = this.generateRoomCode();
      attempts++;
    }

    const player: PlayerInfo = {
      id: playerId,
      name: hostName,
      isHost: true,
      joinedAt: new Date().toISOString(),
    };

    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .insert({
        room_code: roomCode,
        status: 'waiting',
        host_player_id: playerId,
        max_players: maxPlayers,
        players: [player],
        game_state: null,
      })
      .select()
      .single();

    if (error) throw new Error(`创建房间失败: ${error.message}`);
    if (!data) throw new Error('创建房间失败：未返回数据');

    return {
      roomCode,
      playerId,
      room: this.mapRoom(data),
    };
  }

  /** 加入房间 */
  async joinRoom(roomCode: string, playerName: string): Promise<{ playerId: string; room: GameRoom }> {
    // 先查询房间
    const { data: room, error: queryError } = await getSupabaseClient()
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (queryError) throw new Error(`查询房间失败: ${queryError.message}`);
    if (!room) throw new Error('房间不存在');
    if (room.status !== 'waiting') throw new Error('房间已开始或已结束');

    const currentPlayers = room.players as PlayerInfo[] || [];
    if (currentPlayers.length >= room.max_players) {
      throw new Error('房间已满');
    }

    const playerId = crypto.randomUUID();
    const newPlayer: PlayerInfo = {
      id: playerId,
      name: playerName,
      isHost: false,
      joinedAt: new Date().toISOString(),
    };

    const updatedPlayers = [...currentPlayers, newPlayer];

    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .update({
        players: updatedPlayers,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode)
      .select()
      .single();

    if (error) throw new Error(`加入房间失败: ${error.message}`);
    if (!data) throw new Error('加入房间失败：未返回数据');

    return {
      playerId,
      room: this.mapRoom(data),
    };
  }

  /** 获取房间状态 */
  async getRoom(roomCode: string): Promise<GameRoom> {
    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (error) throw new Error(`查询房间失败: ${error.message}`);
    if (!data) throw new Error('房间不存在');

    return this.mapRoom(data);
  }

  /** 填充机器人玩家并开始游戏（单人测试模式） */
  async startSoloGame(roomCode: string, playerId: string): Promise<GameRoom> {
    const room = await this.getRoom(roomCode);
    if (room.hostPlayerId !== playerId) {
      throw new Error('只有房主可以开始游戏');
    }

    const botNames = ['🤖 警探Alpha', '🤖 警探Beta', '🤖 警探Gamma', '🤖 警探Delta', '🤖 警探Epsilon', '🤖 警探Zeta', '🤖 警探Eta'];
    const currentPlayers = [...room.players];
    const targetCount = Math.max(room.maxPlayers, 3);
    const remainingCount = targetCount - currentPlayers.length;

    for (let i = 0; i < remainingCount; i++) {
      currentPlayers.push({
        id: crypto.randomUUID(),
        name: botNames[i % botNames.length],
        isHost: false,
        isBot: true,
        joinedAt: new Date().toISOString(),
      });
    }

    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .update({
        players: currentPlayers,
        max_players: targetCount,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode)
      .select()
      .single();

    if (error) throw new Error(`填充机器人失败: ${error.message}`);
    return this.mapRoom(data);
  }
  async updateRoom(roomCode: string, updates: Partial<GameRoom>): Promise<GameRoom> {
    const dbUpdates: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.status) dbUpdates.status = updates.status;
    if (updates.players) dbUpdates.players = updates.players;
    if (updates.gameState !== undefined) dbUpdates.game_state = updates.gameState;

    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .update(dbUpdates)
      .eq('room_code', roomCode)
      .select()
      .single();

    if (error) throw new Error(`更新房间失败: ${error.message}`);
    if (!data) throw new Error('更新房间失败：未返回数据');

    return this.mapRoom(data);
  }

  /** 删除房间 */
  async deleteRoom(roomCode: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from('game_rooms')
      .delete()
      .eq('room_code', roomCode);

    if (error) throw new Error(`删除房间失败: ${error.message}`);
  }

  private mapRoom(data: any): GameRoom {
    return {
      id: data.id,
      roomCode: data.room_code,
      status: data.status,
      hostPlayerId: data.host_player_id,
      maxPlayers: data.max_players,
      players: data.players || [],
      gameState: data.game_state,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}