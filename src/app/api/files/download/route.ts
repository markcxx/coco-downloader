import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const SAVE_DIR = process.env.DOWNLOAD_PATH || "./data";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filename = searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  try {
    const filePath = path.join(SAVE_DIR, decodeURIComponent(filename));

    // 安全检查：防止路径遍历攻击
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(SAVE_DIR))) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 403 });
    }

    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 读取文件
    const fileBuffer = fs.readFileSync(resolvedPath);

    // 返回文件
    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(path.basename(resolvedPath))}"; filename*=UTF-8''${encodeURIComponent(path.basename(resolvedPath))}`);
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Content-Length", fileBuffer.length.toString());

    return new NextResponse(fileBuffer, { headers });

  } catch (error) {
    console.error("Download file error:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}
