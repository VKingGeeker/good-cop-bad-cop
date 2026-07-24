import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const APK_DIR = process.env.APK_DIR || '/home/ubuntu/apks';
const APK_PATH = path.join(APK_DIR, 'app-debug.apk');
const VERSION_PATH = path.join(APK_DIR, 'version.json');

interface VersionEntry {
  version: string;
  buildTime: string;
  changelog: string;
}

/**
 * 比较语义版本号：返回 1 表示 a > b，-1 表示 a < b，0 表示相等
 */
function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

@Controller('app')
export class AppUpdateController {
  private readonly logger = new Logger(AppUpdateController.name);

  /** 读取版本历史数组 */
  private readVersionHistory(): VersionEntry[] {
    if (!fs.existsSync(VERSION_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf-8'));
    // 兼容旧格式（单个对象）
    if (Array.isArray(raw)) return raw as VersionEntry[];
    return [raw as VersionEntry];
  }

  /**
   * 获取最新版本信息
   * 支持 fromVersion 查询参数，返回从该版本之后所有版本的更新日志
   * 如 GET /api/app/version?fromVersion=1.0.9
   */
  @Get('version')
  async getVersion(@Query('fromVersion') fromVersion?: string) {
    try {
      const apkExists = fs.existsSync(APK_PATH);
      const history = this.readVersionHistory();

      if (history.length === 0) {
        return {
          code: 0,
          msg: 'success',
          data: {
            version: '0.0.0',
            buildTime: '',
            changelog: '',
            versions: [],
            apkSize: apkExists ? fs.statSync(APK_PATH).size : 0,
            downloadUrl: apkExists ? '/api/app/download' : null,
          },
        };
      }

      // 最新版本 = 数组最后一个元素
      const latest = history[history.length - 1];

      // 筛选 fromVersion 之后的版本（用于跨版本更新日志）
      let versions: VersionEntry[] = [];
      if (fromVersion) {
        versions = history.filter(
          (v) => compareVersion(v.version, fromVersion) > 0,
        );
      } else {
        versions = [latest];
      }

      // 合并所有版本的 changelog
      const mergedChangelog = versions
        .map((v) => v.changelog || '')
        .filter((c) => c.trim())
        .join('\n');

      return {
        code: 0,
        msg: 'success',
        data: {
          version: latest.version,
          buildTime: latest.buildTime,
          changelog: mergedChangelog,
          versions: versions.map((v) => ({
            version: v.version,
            buildTime: v.buildTime,
            changelog: v.changelog || '',
          })),
          apkSize: apkExists ? fs.statSync(APK_PATH).size : 0,
          downloadUrl: apkExists ? '/api/app/download' : null,
        },
      };
    } catch (error) {
      return { code: -1, msg: error.message || '获取版本失败', data: null };
    }
  }

  /**
   * 获取所有版本历史（供客户端查看历史更新日志）
   */
  @Get('changelog')
  async getChangelog() {
    try {
      const history = this.readVersionHistory();
      // 按版本号降序返回（最新在最前）
      const sorted = [...history].sort((a, b) =>
        compareVersion(b.version, a.version),
      );
      return {
        code: 0,
        msg: 'success',
        data: sorted.map((v) => ({
          version: v.version,
          buildTime: v.buildTime,
          changelog: v.changelog || '',
        })),
      };
    } catch (error) {
      return { code: -1, msg: error.message || '获取更新日志失败', data: null };
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
