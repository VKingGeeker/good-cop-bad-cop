package com.goodcopbadcop.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * APK 安装插件
 * 从服务器下载 APK 并触发系统安装界面
 * 处理 Android 8+ 的安装未知应用权限
 *
 * 方法：
 * - download: 仅下载 APK（带进度回调），不安装
 * - cancelDownload: 取消下载
 * - install: 仅安装已下载的 APK
 * - downloadAndInstall: 下载并安装（旧方法，保留兼容）
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String APK_FILENAME = "update.apk";

    private HttpURLConnection downloadConnection;
    private volatile boolean isCancelled = false;

    /**
     * 仅下载 APK（不安装），通过 notifyListeners 报告进度
     * 支持断点续传：若 update.apk 已存在部分数据，使用 Range 请求续传
     */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("URL is required");
            return;
        }

        isCancelled = false;

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                URL downloadUrl = new URL(url);
                conn = (HttpURLConnection) downloadUrl.openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);

                // 断点续传：检查已有文件大小
                File outputFile = new File(getContext().getCacheDir(), APK_FILENAME);
                long existingSize = 0;
                if (outputFile.exists()) {
                    existingSize = outputFile.length();
                    if (existingSize > 0) {
                        conn.setRequestProperty("Range", "bytes=" + existingSize + "-");
                    }
                }

                conn.connect();
                downloadConnection = conn;

                int responseCode = conn.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK
                        && responseCode != HttpURLConnection.HTTP_PARTIAL) {
                    call.reject("下载失败: HTTP " + responseCode);
                    return;
                }

                // 确定文件总大小和写入模式
                long fileSize;
                boolean isResume = (responseCode == HttpURLConnection.HTTP_PARTIAL);

                if (isResume) {
                    // 断点续传：从 Content-Range 解析总大小
                    String contentRange = conn.getHeaderField("Content-Range");
                    if (contentRange != null) {
                        String[] parts = contentRange.split("/");
                        if (parts.length == 2) {
                            fileSize = Long.parseLong(parts[1].trim());
                        } else {
                            fileSize = existingSize + conn.getContentLength();
                        }
                    } else {
                        fileSize = existingSize + conn.getContentLength();
                    }
                } else {
                    // 全新下载：删除旧文件
                    if (outputFile.exists()) {
                        outputFile.delete();
                    }
                    existingSize = 0;
                    fileSize = conn.getContentLength();
                }

                // 打开文件输出流（续传时追加模式）
                if (isResume && existingSize > 0) {
                    output = new FileOutputStream(outputFile, true);
                } else {
                    output = new FileOutputStream(outputFile);
                }

                input = conn.getInputStream();

                byte[] buffer = new byte[8192];
                int bytesRead;
                long totalRead = existingSize;

                while ((bytesRead = input.read(buffer)) != -1) {
                    if (isCancelled) {
                        // 用户取消下载，保存已下载部分
                        try {
                            output.flush();
                            output.close();
                            input.close();
                            conn.disconnect();
                        } catch (Exception ignored) {}
                        JSObject cancelData = new JSObject();
                        cancelData.put("cancelled", true);
                        notifyListeners("apkDownloadCancelled", cancelData);
                        call.reject("下载已取消");
                        return;
                    }
                    output.write(buffer, 0, bytesRead);
                    totalRead += bytesRead;

                    // 报告进度
                    if (fileSize > 0) {
                        int progress = (int) ((totalRead * 100L) / fileSize);
                        JSObject progressData = new JSObject();
                        progressData.put("progress", progress);
                        progressData.put("downloadedBytes", totalRead);
                        progressData.put("totalBytes", fileSize);
                        notifyListeners("apkDownloadProgress", progressData);
                    }
                }

                output.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("filePath", outputFile.getAbsolutePath());
                result.put("fileSize", totalRead);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("下载失败", e.getMessage(), e);
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (conn != null) conn.disconnect();
                } catch (Exception ignored) {}
                downloadConnection = null;
            }
        }).start();
    }

    /**
     * 取消正在进行的下载
     */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        isCancelled = true;
        if (downloadConnection != null) {
            try {
                downloadConnection.disconnect();
            } catch (Exception ignored) {}
            downloadConnection = null;
        }
        call.resolve();
    }

    /**
     * 仅安装已下载的 APK（不重新下载）
     */
    @PluginMethod
    public void install(PluginCall call) {
        File outputFile = new File(getContext().getCacheDir(), APK_FILENAME);
        if (!outputFile.exists()) {
            call.reject("安装包不存在，请先下载");
            return;
        }
        installApk(outputFile, call);
    }

    /**
     * 下载并安装 APK（旧方法，保留兼容）
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("URL is required");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                URL downloadUrl = new URL(url);
                conn = (HttpURLConnection) downloadUrl.openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK && responseCode != HttpURLConnection.HTTP_PARTIAL) {
                    call.reject("下载失败: HTTP " + responseCode);
                    return;
                }

                File outputFile = new File(getContext().getCacheDir(), APK_FILENAME);
                if (outputFile.exists()) {
                    outputFile.delete();
                }

                input = conn.getInputStream();
                output = new FileOutputStream(outputFile);

                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = input.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                }

                output.flush();
                output.close();
                input.close();
                conn.disconnect();

                // 触发 APK 安装
                installApk(outputFile, call);
            } catch (Exception e) {
                call.reject("下载安装失败", e.getMessage(), e);
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (conn != null) conn.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    /**
     * 触发系统 APK 安装界面，处理 Android 8+ 安装权限
     */
    private void installApk(File apkFile, PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
                );
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                uri = Uri.fromFile(apkFile);
            }
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // Android 8+ 检查安装未知应用权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                    // 跳转到"安装未知应用"设置页
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settingsIntent);
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("needPermission", true);
                    result.put("message", "请先允许安装未知应用，授权后请重新点击安装");
                    call.resolve(result);
                    return;
                }
            }

            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("打开安装界面失败", e.getMessage(), e);
        }
    }
}
