import { Injectable, Logger } from '@nestjs/common'
import { getSupabaseClient } from '@/storage/database/supabase-client'

export interface ErrorLogEntry {
  errorTime: string
  logDetail: string
}

export interface ErrorLogRecord {
  id: string
  error_time: string
  log_detail: string
  fix_time: string | null
  is_fixed: boolean
  created_at: string
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name)

  /** 批量提交错误日志 */
  async submitLogs(logs: ErrorLogEntry[]) {
    if (!logs || logs.length === 0) {
      return { submitted: 0 }
    }

    // 数据验证：过滤掉无效条目
    const validLogs = logs.filter(
      (l) => l && l.errorTime && l.logDetail && typeof l.logDetail === 'string',
    )

    if (validLogs.length === 0) {
      throw new Error('没有有效的日志数据')
    }

    const rows = validLogs.map((l) => ({
      error_time: l.errorTime,
      log_detail: l.logDetail.substring(0, 10000), // 限制长度
      fix_time: null,
      is_fixed: false,
    }))

    const { data, error } = await getSupabaseClient()
      .from('error_logs')
      .insert(rows)
      .select()

    if (error) {
      this.logger.error('提交错误日志失败:', error.message)
      throw new Error(`数据库写入失败: ${error.message}`)
    }

    this.logger.log(`成功提交 ${data?.length || 0} 条错误日志`)
    return { submitted: data?.length || 0 }
  }

  /** 获取未修复的错误日志列表 */
  async getUnfixedLogs() {
    const { data, error } = await getSupabaseClient()
      .from('error_logs')
      .select('*')
      .eq('is_fixed', false)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      throw new Error(`查询失败: ${error.message}`)
    }

    return data || []
  }

  /** 标记日志为已修复 */
  async markFixed(id: string, fixTime: string) {
    const { data, error } = await getSupabaseClient()
      .from('error_logs')
      .update({ is_fixed: true, fix_time: fixTime })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`更新失败: ${error.message}`)
    }

    return data
  }
}
