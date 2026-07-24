import { Controller, Get, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const APK_DIR = process.env.APK_DIR || '/home/ubuntu/apks';
const APK_PATH = path.join(APK_DIR, 'app-debug.apk');
const VERSION_PATH = path.join(APK_DIR, 'version.json');

@Controller('app')
export class AppUpdateController {
  private readonly logger = new Logger(AppUpdateController.name);

  /** 获取最新版本信息 */
  @Get('version')
  async getVersion() {
    try {
      const apkExists = fs.existsSync(APK_PATH);
      let versionData = { version: '0.0.0', buildTime: '', changelog: '' };
      if (fs.existsSync(VERSION_PATH)) {
        versionData = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
      }
      return {
        code: 0,
        msg: 'success',
        data: {
          version: versionData.version,
          buildTime: versionData.buildTime,
          changelog: versionData.changelog || '',
          apkSize: apkExists ? fs.statSync(APK_PATH).size : 0,
          downloadUrl: apkExists ? '/api/app/download' : null,
        },
      };
    } catch (error) {
      return { code: -1, msg: error.message || '获取版本失败', data: null };
    }
  }

  /** 下载 APK 文件（支持断点续传） */
  @Get('download')
  async downloadApk(@Req() req: Request, @Res() res: Response) {
    try {
      if (!fs.existsSync(APK_PATH)) {
        res.status(404).json({ code: -1, msg: 'APK 文件不存在' });
        return;
      }
      const stat = fs.statSync(APK_PATH);
      const range = req.headers.range;

      // 公共响应头
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="wujianyiyun.apk"');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

      if (range) {
        // 断点续传：解析 Range 请求头
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

        if (start >= stat.size || end >= stat.size) {
          res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
          res.json({ code: -1, msg: 'Range 越界' });
          return;
        }

        res.status(206); // Partial Content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', end - start + 1);
        this.logger.log(`APK resume download: ${start}-${end}/${stat.size}`);
        const stream = fs.createReadStream(APK_PATH, { start, end });
        stream.pipe(res);
      } else {
        // 完整下载
        res.setHeader('Content-Length', stat.size);
        this.logger.log(`APK full download started, size: ${stat.size}`);
        const stream = fs.createReadStream(APK_PATH);
        stream.pipe(res);
      }
    } catch (error) {
      res.status(500).json({ code: -1, msg: error.message || '下载失败' });
    }
  }
}
