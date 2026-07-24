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
  password?: string | null;
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

  /** 从所有房间中移除指定玩家（防止同一玩家同时存在于多个房间） */
  async removePlayerFromAllRooms(playerId: string): Promise<void> {
    // 查询所有包含该玩家的 waiting/playing 房间
    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .select('*')
      .in('status', ['waiting', 'playing'])
      .contains('players', [{ id: playerId }]);

    if (error || !data || data.length === 0) return;

    for (const row of data) {
      const players = (row.players as PlayerInfo[]) || [];
      const player = players.find(p => p.id === playerId);
      if (!player) continue;

      const remainingPlayers = players.filter(p => p.id !== playerId);

      if (player.isHost) {
        if (remainingPlayers.length === 0) {
          // 无人剩余，删除房间
          await getSupabaseClient().from('game_rooms').delete().eq('room_code', row.room_code);
        } else {
          // 转移房主
          remainingPlayers[0] = { ...remainingPlayers[0], isHost: true };
          await getSupabaseClient()
            .from('game_rooms')
            .update({
              players: remainingPlayers,
              host_player_id: remainingPlayers[0].id,
              updated_at: new Date().toISOString(),
            })
            .eq('room_code', row.room_code);
        }
      } else {
        await getSupabaseClient()
          .from('game_rooms')
          .update({
            players: remainingPlayers,
            updated_at: new Date().toISOString(),
          })
          .eq('room_code', row.room_code);
      }
      this.logger.log(`已从房间 ${row.room_code} 移除玩家 ${player.name} (${playerId})`);
    }
  }

  /** 创建房间 */
  async createRoom(hostName: string, maxPlayers: number, password?: string, existingPlayerId?: string): Promise<{ roomCode: string; playerId: string; room: GameRoom }> {
    // 如果已有 playerId，先从其他房间移除
    if (existingPlayerId) {
      await this.removePlayerFromAllRooms(existingPlayerId);
    }
    const playerId = existingPlayerId || crypto.randomUUID();
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
        game_state: password ? { password } : null,
        password: password || null,
      })
      .select()
      .single();

    // 如果 password 列不存在，去掉 password 重试（密码已存入 game_state）
    if (error && error.message && error.message.includes('password')) {
      const { data: retryData, error: retryError } = await getSupabaseClient()
        .from('game_rooms')
        .insert({
          room_code: roomCode,
          status: 'waiting',
          host_player_id: playerId,
          max_players: maxPlayers,
          players: [player],
          game_state: password ? { password } : null,
        })
        .select()
        .single();
      if (retryError) throw new Error(`创建房间失败: ${retryError.message}`);
      if (!retryData) throw new Error('创建房间失败：未返回数据');
      return { roomCode, playerId, room: this.mapRoom(retryData) };
    }

    if (error) throw new Error(`创建房间失败: ${error.message}`);
    if (!data) throw new Error('创建房间失败：未返回数据');

    return {
      roomCode,
      playerId,
      room: this.mapRoom(data),
    };
  }

  /** 加入房间 */
  async joinRoom(roomCode: string, playerName: string, password?: string, existingPlayerId?: string): Promise<{ playerId: string; room: GameRoom }> {
    // 先查询房间
    const { data: room, error: queryError } = await getSupabaseClient()
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (queryError) throw new Error(`查询房间失败: ${queryError.message}`);
    if (!room) throw new Error('房间不存在');
    if (room.status !== 'waiting') throw new Error('房间已开始或已结束');

    const currentPlayers = (room.players as PlayerInfo[]) || [];

    // 检查玩家是否已在该房间中
    if (existingPlayerId) {
      const existingPlayer = currentPlayers.find(p => p.id === existingPlayerId);
      if (existingPlayer) {
        throw new Error('你已在该房间中，请直接返回房间');
      }
    }

    // 检查密码（在移除玩家之前验证）— 兼容 password 列和 game_state 存储
    const roomPassword = room.password || room.game_state?.password;
    if (roomPassword && roomPassword !== (password || '')) {
      throw new Error('房间密码错误');
    }

    if (currentPlayers.length >= room.max_players) {
      throw new Error('房间已满');
    }

    // 密码验证通过后，再从其他房间移除玩家
    if (existingPlayerId) {
      await this.removePlayerFromAllRooms(existingPlayerId);
      // 重新查询房间（可能已被 removePlayerFromAllRooms 修改）
      const { data: freshRoom } = await getSupabaseClient()
        .from('game_rooms')
        .select('*')
        .eq('room_code', roomCode)
        .maybeSingle();
      if (!freshRoom) throw new Error('房间不存在');
      const freshPlayers = (freshRoom.players as PlayerInfo[]) || [];
      if (freshPlayers.length >= freshRoom.max_players) {
        throw new Error('房间已满');
      }
      const playerId = existingPlayerId;
      const newPlayer: PlayerInfo = {
        id: playerId,
        name: playerName,
        isHost: false,
        joinedAt: new Date().toISOString(),
      };
      const updatedPlayers = [...freshPlayers, newPlayer];
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
      return { playerId, room: this.mapRoom(data) };
    }

    // 无 existingPlayerId 的分支
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
    return { playerId, room: this.mapRoom(data) };
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

    const botNames = ['警探Alpha', '警探Beta', '警探Gamma', '警探Delta', '警探Epsilon', '警探Zeta', '警探Eta'];
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

  /** 获取等待中的房间列表 */
  async getRoomList(): Promise<Array<{
    roomCode: string; hostName: string; playerCount: number;
    maxPlayers: number; hasPassword: boolean; createdAt: string;
  }>> {
    // 先清理超时房间
    await this.cleanupInactiveRooms();

    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`获取房间列表失败: ${error.message}`);
    if (!data) return [];

    return data.map((row: any) => {
      const players = row.players as PlayerInfo[] || [];
      const host = players.find(p => p.isHost);
      return {
        roomCode: row.room_code,
        hostName: host?.name || '未知',
        playerCount: players.length,
        maxPlayers: row.max_players,
        hasPassword: !!(row.password || row.game_state?.password),
        createdAt: row.created_at,
      };
    });
  }

  /** 清理 20 分钟内无活动的房间 */
  async cleanupInactiveRooms(): Promise<number> {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .delete()
      .lt('updated_at', twentyMinAgo)
      .select('id');

    if (error) {
      this.logger.error(`清理超时房间失败: ${error.message}`);
      return 0;
    }
    const count = data?.length || 0;
    if (count > 0) {
      this.logger.log(`已清理 ${count} 个超时房间`);
    }
    return count;
  }

  /** 离开房间 */
  async leaveRoom(roomCode: string, playerId: string): Promise<void> {
    const room = await this.getRoom(roomCode);
    const players = room.players;
    const player = players.find(p => p.id === playerId);
    if (!player) throw new Error('玩家不在房间中');

    if (player.isHost) {
      const remainingPlayers = players.filter(p => p.id !== playerId);
      if (remainingPlayers.length === 0) {
        // 没有其他玩家，删除房间
        await this.deleteRoom(roomCode);
      } else {
        // 转移房主给第一个剩余玩家
        remainingPlayers[0] = { ...remainingPlayers[0], isHost: true };
        const { error } = await getSupabaseClient()
          .from('game_rooms')
          .update({
            players: remainingPlayers,
            host_player_id: remainingPlayers[0].id,
            updated_at: new Date().toISOString(),
          })
          .eq('room_code', roomCode);
        if (error) throw new Error(`离开房间失败: ${error.message}`);
      }
    } else {
      const remainingPlayers = players.filter(p => p.id !== playerId);
      const { error } = await getSupabaseClient()
        .from('game_rooms')
        .update({
          players: remainingPlayers,
          updated_at: new Date().toISOString(),
        })
        .eq('room_code', roomCode);
      if (error) throw new Error(`离开房间失败: ${error.message}`);
    }
  }

  /** 踢出玩家（仅房主） */
  async kickPlayer(roomCode: string, hostPlayerId: string, targetPlayerId: string): Promise<GameRoom> {
    const room = await this.getRoom(roomCode);
    if (room.hostPlayerId !== hostPlayerId) {
      throw new Error('只有房主可以踢人');
    }
    if (hostPlayerId === targetPlayerId) {
      throw new Error('不能踢自己');
    }
    const players = room.players;
    const target = players.find(p => p.id === targetPlayerId);
    if (!target) throw new Error('玩家不在房间中');

    const remainingPlayers = players.filter(p => p.id !== targetPlayerId);
    const { data, error } = await getSupabaseClient()
      .from('game_rooms')
      .update({
        players: remainingPlayers,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode)
      .select()
      .single();

    if (error) throw new Error(`踢出玩家失败: ${error.message}`);
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
      password: data.password || data.game_state?.password || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}