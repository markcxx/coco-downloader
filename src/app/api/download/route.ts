import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Readable } from "stream";
import { getProvider } from "@/lib/providers";
import * as fs from "fs";
import * as path from "path";

const DOWNLOAD_TIMEOUT = 30000;
const RETRY_LIMIT = 2;
const RETRY_DELAY = 600;
const SAVE_DIR = process.env.DOWNLOAD_PATH || "./data";

console.log(`[Download] SAVE_DIR: ${SAVE_DIR}`);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown) {
  const err = error as { code?: string; message?: string };
  const code = err?.code || "";
  const message = err?.message || "";
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    message.toLowerCase().includes("timeout")
  );
}

async function requestAudioStream(url: string, attempt = 0) {
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: DOWNLOAD_TIMEOUT,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Upstream error: ${response.status}`);
    }

    const stream = Readable.toWeb(response.data) as ReadableStream<Uint8Array>;
    return { stream, headers: response.headers as Record<string, string | undefined> };
  } catch (error) {
    if (attempt < RETRY_LIMIT && isRetryableError(error)) {
      await delay(RETRY_DELAY * (attempt + 1));
      return requestAudioStream(url, attempt + 1);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const filename = searchParams.get("filename");
  const providerName = searchParams.get("provider") || "gequbao";
  const mode = searchParams.get("mode") || "server"; // 'server' or 'browser'
  const quality = searchParams.get("quality") || "standard"; // 'standard', 'high', 'lossless'

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  console.log(`[Download] mode: ${mode}, quality: ${quality}`);

  try {
    // 1. 获取真实播放地址
    const provider = getProvider(providerName);
    const playInfo = await provider.getPlayInfo(id, quality as 'standard' | 'high' | 'lossless');
    if (!playInfo || !playInfo.url) {
      return NextResponse.json({ error: "Failed to get url" }, { status: 404 });
    }

    console.log(`[Download] Got play info: ${playInfo.type}, URL: ${playInfo.url}`);

    const downloadEnabled = process.env.ENABLE_DOWNLOAD !== "0";
    if (!downloadEnabled) {
      return NextResponse.json(
        { error: "Download disabled", url: playInfo.url },
        { status: 503 }
      );
    }

    // 2. 请求音频流
    const { stream, headers: upstreamHeaders } = await requestAudioStream(playInfo.url);

    // 检测实际音质
    const contentLength = parseInt(upstreamHeaders["content-length"] || "0");
    let detectedQuality = quality;
    if (contentLength > 0) {
      // 根据文件大小推断音质
      if (contentLength > 20 * 1024 * 1024) { // > 20MB
        detectedQuality = 'lossless';
      } else if (contentLength > 5 * 1024 * 1024) { // > 5MB
        detectedQuality = 'high';
      } else {
        detectedQuality = 'standard';
      }
    }

    // 3. 构建文件名（使用实际格式）
    const fileExt = playInfo.type || (detectedQuality === 'lossless' ? 'flac' : 'mp3');
    // 如果文件名没有扩展名，添加扩展名
    const baseFilename = filename ? filename.replace(/\.(mp3|m4a|flac|wav)$/i, '') : `music-${id}`;
    const safeFilename = `${baseFilename}.${fileExt}`;

    // 4. 根据模式处理
    if (mode === 'browser') {
      // Browser mode: 直接返回流，不保存到服务器
      const headers = new Headers();
      const contentType = upstreamHeaders["content-type"];
      headers.set("Content-Type", contentType || "audio/mpeg");

      const contentLength = upstreamHeaders["content-length"];
      if (contentLength) {
        headers.set("Content-Length", contentLength);
      }

      headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(safeFilename)}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`);

      return new NextResponse(stream, {
        status: 200,
        headers,
      });
    }

    // Server mode: 保存到 /data 目录
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
      console.log(`[Download] Created directory: ${SAVE_DIR}`);
    }

    const filePath = path.resolve(SAVE_DIR, safeFilename);
    console.log(`[Download] Saving file to: ${filePath}`);
    
    const writer = fs.createWriteStream(filePath);

    // 将 Web ReadableStream 转换为 Node.js Stream 并写入文件
    const reader = stream.getReader();
    let bytesWritten = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
      bytesWritten += value.length;
    }
    writer.end();
    
    console.log(`[Download] Stream written: ${bytesWritten} bytes`);

    // 等待写入完成
    await new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`[Download] File saved successfully: ${filePath}`);
        resolve(true);
      });
      writer.on('error', (err) => {
        console.error(`[Download] File write error:`, err);
        reject(err);
      });
    });

    // 5. 返回保存成功信息
    return NextResponse.json({
      success: true,
      message: "File saved successfully",
      filePath: filePath,
      fileName: safeFilename,
      detectedQuality: detectedQuality,
      fileSize: contentLength
    }, { status: 200 });

  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
