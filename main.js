const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const iconv = require("iconv-lite");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    icon: path.join(__dirname, "assets", "icon.png")
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 获取默认下载路径
ipcMain.handle("get-default-download-path", () => {
  // 打包后使用用户的下载目录，开发时使用项目目录
  if (app.isPackaged) {
    return path.join(os.homedir(), "Downloads", "yt-dlp-downloads");
  } else {
    return path.join(__dirname, "downloads");
  }
});

// 选择文件夹
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  return result.filePaths[0];
});

// 选择 Cookie 文件
ipcMain.handle("select-cookie-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Cookie Files", extensions: ["txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.filePaths[0];
});

// 选择URL文件
ipcMain.handle("select-url-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Text Files", extensions: ["txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.filePaths[0]) {
    try {
      const content = fs.readFileSync(result.filePaths[0], "utf-8");
      const urls = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
      return { filePath: result.filePaths[0], urls };
    } catch (err) {
      return { error: err.message };
    }
  }
  return null;
});

// 检测 yt-dlp 可执行文件路径
function getYtDlpPath() {
  // 开发环境：直接在当前目录
  let localPath = path.join(__dirname, "yt-dlp.exe");
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 打包后环境：在 resources 目录
  if (app.isPackaged) {
    localPath = path.join(process.resourcesPath, "yt-dlp.exe");
    if (fs.existsSync(localPath)) {
      return localPath;
    }
  }

  return "yt-dlp";
}

// 识别网站类型
function detectWebsite(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  } else if (url.includes("pinterest.com") || url.includes("pin.it")) {
    return "pinterest";
  } else if (url.includes("instagram.com")) {
    return "instagram";
  } else if (url.includes("twitter.com") || url.includes("x.com")) {
    return "twitter";
  } else if (url.includes("tiktok.com")) {
    return "tiktok";
  } else if (url.includes("facebook.com") || url.includes("fb.watch")) {
    return "facebook";
  } else if (url.includes("vimeo.com")) {
    return "vimeo";
  } else if (url.includes("bilibili.com")) {
    return "bilibili";
  }
  return "generic";
}

// 根据清晰度获取格式字符串
function getFormatByQuality(quality, useAudioMerge = true) {
  let height;
  switch (quality) {
    case "4k":
      height = 2160;
      break;
    case "1080p":
      height = 1080;
      break;
    case "720p":
      height = 720;
      break;
    case "480p":
      height = 480;
      break;
    default:
      // 最佳质量
      if (useAudioMerge) {
        return "bestvideo+bestaudio/best";
      } else {
        return "best";
      }
  }

  // 指定清晰度的格式
  if (useAudioMerge) {
    return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
  } else {
    return `best[height<=${height}]/best`;
  }
}

// 根据网站类型获取特定参数
function getWebsiteSpecificArgs(
  website,
  quality,
  outputTemplate,
  platformSettings = {}
) {
  const baseArgs = [
    "-o",
    outputTemplate,
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--socket-timeout",
    "30"
  ];

  switch (website) {
    case "youtube":
      // YouTube 特定参数
      // 2025年YouTube要求PO Token，使用tv客户端的HLS流可以绕过
      const youtubeArgs = [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4",
        "--no-playlist"
      ];

      // Cookie 文件优先级：
      // 1. 用户在UI中指定的Cookie文件
      // 2. 项目根目录下的 cookies.txt
      let cookiesPath = null;

      // 检查用户是否在UI中指定了Cookie文件
      if (platformSettings.youtube && platformSettings.youtube.cookiePath) {
        cookiesPath = platformSettings.youtube.cookiePath;
        console.log("使用用户指定的Cookie文件:", cookiesPath);
      } else {
        // 否则检查项目根目录
        const defaultCookiesPath = path.join(__dirname, "cookies.txt");
        if (fs.existsSync(defaultCookiesPath)) {
          cookiesPath = defaultCookiesPath;
          console.log("使用默认Cookie文件:", cookiesPath);
        }
      }

      // 如果有Cookie文件，添加到参数中
      if (cookiesPath && fs.existsSync(cookiesPath)) {
        youtubeArgs.push("--cookies", cookiesPath);
      }

      // 排除 web_creator 客户端，使用tv客户端的HLS流（不需要PO Token）
      youtubeArgs.push(
        "--extractor-args",
        "youtube:player_client=default,-web_creator"
      );

      return youtubeArgs;

    case "pinterest":
      // Pinterest 特定参数
      // Pinterest 使用 HLS 流媒体，需要合并视频和音频
      const pinterestArgs = [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--referer",
        "https://www.pinterest.com/",
        "--embed-thumbnail", // 总是嵌入封面到视频
        "--add-metadata",
        "--hls-prefer-ffmpeg"
      ];

      // 根据用户配置决定是否下载独立的封面图片文件
      if (
        platformSettings.pinterest &&
        platformSettings.pinterest.downloadThumbnail
      ) {
        pinterestArgs.push("--write-thumbnail");
      }

      return pinterestArgs;

    case "instagram":
      // Instagram 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ];

    case "twitter":
      // Twitter/X 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4"
      ];

    case "tiktok":
      // TikTok 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      ];

    case "facebook":
      // Facebook 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4"
      ];

    case "vimeo":
      // Vimeo 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4"
      ];

    case "bilibili":
      // Bilibili 特定参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4"
      ];

    default:
      // 通用参数
      return [
        ...baseArgs,
        "--format",
        getFormatByQuality(quality, true),
        "--merge-output-format",
        "mp4"
      ];
  }
}

// 下载视频
ipcMain.on(
  "download-video",
  (event, { urls, outputPath, quality, useVideoId, platformSettings }) => {
    const ytdlpPath = getYtDlpPath();
    downloadNext(0);

    function downloadNext(index) {
      if (index >= urls.length) {
        event.reply("download-complete", { success: true });
        return;
      }

      const url = urls[index].trim();
      if (!url) {
        downloadNext(index + 1);
        return;
      }

      // 识别网站类型
      const website = detectWebsite(url);

      event.reply("download-progress", {
        current: index + 1,
        total: urls.length,
        url: url,
        website: website,
        status: "downloading"
      });

      // 根据配置决定使用视频ID还是标题作为文件名
      const outputTemplate = useVideoId
        ? path.join(outputPath, "%(id)s.%(ext)s")
        : path.join(outputPath, "%(title)s.%(ext)s");

      // 根据网站类型获取特定参数
      const args = [
        url,
        ...getWebsiteSpecificArgs(
          website,
          quality,
          outputTemplate,
          platformSettings
        )
      ];

      // 调试：输出命令
      console.log("执行命令:", ytdlpPath);
      console.log("参数:", args);

      const ytdlp = spawn(ytdlpPath, args);

      let outputData = "";

      ytdlp.stdout.on("data", (data) => {
        const output = iconv.decode(data, "cp936");
        outputData += output;
        event.reply("download-output", output);
      });

      ytdlp.stderr.on("data", (data) => {
        const output = iconv.decode(data, "cp936");
        outputData += output;
        event.reply("download-output", output);
      });

      ytdlp.on("close", (code) => {
        if (code === 0) {
          event.reply("download-progress", {
            current: index + 1,
            total: urls.length,
            url: url,
            website: website,
            status: "success"
          });
        } else {
          event.reply("download-progress", {
            current: index + 1,
            total: urls.length,
            url: url,
            website: website,
            status: "error",
            error: `下载失败 (错误代码: ${code})`
          });
        }
        downloadNext(index + 1);
      });

      ytdlp.on("error", (err) => {
        event.reply("download-progress", {
          current: index + 1,
          total: urls.length,
          url: url,
          website: website,
          status: "error",
          error: err.message
        });
        event.reply("download-complete", {
          success: false,
          error: "无法启动 yt-dlp，请确保 yt-dlp.exe 在程序目录下"
        });
      });
    }
  }
);
