import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const SAVE_DIR = process.env.DOWNLOAD_PATH || "./data";

export async function GET() {
  try {
    // 确保目录存在
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
      return NextResponse.json({ files: [], directory: SAVE_DIR });
    }

    // 读取目录中的文件
    const files = fs.readdirSync(SAVE_DIR);
    const fileStats = files.map(file => {
      const filePath = path.join(SAVE_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isFile: stats.isFile()
      };
    }).filter(f => f.isFile);

    return NextResponse.json({ 
      files: fileStats, 
      directory: SAVE_DIR,
      total: fileStats.length
    });

  } catch (error) {
    console.error("Error reading directory:", error);
    return NextResponse.json(
      { error: "Failed to read files", directory: SAVE_DIR }, 
      { status: 500 }
    );
  }
}
