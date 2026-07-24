import { Controller, Post, Get, Body, Param, Query, HttpCode } from '@nestjs/common'
import { ErrorLogService, ErrorLogEntry } from './error-log.service'

@Controller('error-log')
export class ErrorLogController {
  constructor(private readonly errorLogService: ErrorLogService) {}

  /** 批量提交错误日志 */
  @Post('submit')
  @HttpCode(200)
  async submitLogs(@Body() body: { logs: ErrorLogEntry[] }) {
    try {
      console.log('[API] submitErrorLogs:', body.logs?.length || 0, '条')
      const result = await this.errorLogService.submitLogs(body.logs || [])
      return { code: 0, msg: 'success', data: result }
    } catch (err) {
      return { code: -1, msg: err.message, data: null }
    }
  }

  /** 获取未修复的错误日志 */
  @Get('unfixed')
  @HttpCode(200)
  async getUnfixedLogs() {
    try {
      const data = await this.errorLogService.getUnfixedLogs()
      return { code: 0, msg: 'success', data }
    } catch (err) {
      return { code: -1, msg: err.message, data: null }
    }
  }

  /** 标记日志为已修复 */
  @Post(':id/fix')
  @HttpCode(200)
  async markFixed(@Param('id') id: string) {
    try {
      const data = await this.errorLogService.markFixed(
        id,
        new Date().toISOString(),
      )
      return { code: 0, msg: 'success', data }
    } catch (err) {
      return { code: -1, msg: err.message, data: null }
    }
  }
}
