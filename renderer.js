const { ipcRenderer } = require("electron");
const path = require("path");

// DOM 元素
const urlInput = document.getElementById("urlInput");
const selectFileBtn = document.getElementById("selectFileBtn");
const selectedFile = document.getElementById("selectedFile");
const outputPath = document.getElementById("outputPath");
const selectFolderBtn = document.getElementById("selectFolderBtn");
const quality = document.getElementById("quality");
const useVideoId = document.getElementById("useVideoId");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const progressSection = document.getElementById("progressSection");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const logOutput = document.getElementById("logOutput");

// 平台特定配置
const pinterestThumbnail = document.getElementById("pinterest-thumbnail");
const youtubeCookiePath = document.getElementById("youtube-cookie-path");
const selectYoutubeCookieBtn = document.getElementById(
  "selectYoutubeCookieBtn"
);
const clearYoutubeCookieBtn = document.getElementById("clearYoutubeCookieBtn");

// 设置默认下载路径
// 从主进程获取正确的默认路径（打包后使用用户下载目录，开发时使用项目目录）
(async () => {
  const defaultPath = await ipcRenderer.invoke("get-default-download-path");
  outputPath.value = defaultPath;
})();

// 选择文件夹
selectFolderBtn.addEventListener("click", async () => {
  const folderPath = await ipcRenderer.invoke("select-folder");
  if (folderPath) {
    outputPath.value = folderPath;
  }
});

// 选择 YouTube Cookie 文件
selectYoutubeCookieBtn.addEventListener("click", async () => {
  const cookiePath = await ipcRenderer.invoke("select-cookie-file");
  if (cookiePath) {
    youtubeCookiePath.value = cookiePath;
    addLog(`已选择 YouTube Cookie 文件: ${cookiePath}`, "info");
  }
});

// 清除 YouTube Cookie 文件
clearYoutubeCookieBtn.addEventListener("click", () => {
  youtubeCookiePath.value = "";
  addLog("已清除 YouTube Cookie 文件配置", "info");
});

// 清理 URL，优化不同网站的 URL 格式
function cleanUrl(url) {
  try {
    // YouTube URL 清理
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const patterns = [
        /[?&]v=([^&]+)/, // 标准格式: ?v=VIDEO_ID 或 &v=VIDEO_ID
        /youtu\.be\/([^?&]+)/, // 短链接格式: youtu.be/VIDEO_ID
        /embed\/([^?&]+)/ // 嵌入格式: /embed/VIDEO_ID
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          const videoId = match[1];
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }
    }

    // Pinterest URL 清理 - 移除追踪参数
    if (url.includes("pinterest.com") || url.includes("pin.it")) {
      // 移除追踪参数，但保留 pin ID
      return url.split("?")[0];
    }

    // 其他网站直接返回原 URL
    return url;
  } catch (err) {
    return url;
  }
}

// 识别网站类型（前端版本）
function detectWebsite(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "🎬 YouTube";
  } else if (url.includes("pinterest.com") || url.includes("pin.it")) {
    return "📌 Pinterest";
  } else if (url.includes("instagram.com")) {
    return "📷 Instagram";
  } else if (url.includes("twitter.com") || url.includes("x.com")) {
    return "🐦 Twitter/X";
  } else if (url.includes("tiktok.com")) {
    return "🎵 TikTok";
  } else if (url.includes("facebook.com") || url.includes("fb.watch")) {
    return "📘 Facebook";
  } else if (url.includes("vimeo.com")) {
    return "🎥 Vimeo";
  } else if (url.includes("bilibili.com")) {
    return "📺 Bilibili";
  }
  return "🌐 通用";
}

// 选择URL文件
selectFileBtn.addEventListener("click", async () => {
  const result = await ipcRenderer.invoke("select-url-file");
  if (result && result.urls) {
    urlInput.value = result.urls.join("\n");
    selectedFile.textContent = `✓ 已加载 ${result.urls.length} 个链接`;
    addLog(`已加载文件: ${result.filePath}`, "info");
    addLog(`找到 ${result.urls.length} 个有效链接`, "info");
  } else if (result && result.error) {
    addLog(`读取文件失败: ${result.error}`, "error");
  }
});

// 开始下载
downloadBtn.addEventListener("click", () => {
  const urls = urlInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((url) => cleanUrl(url)); // 清理 URL

  if (urls.length === 0) {
    alert("请输入至少一个视频链接！");
    return;
  }

  if (!outputPath.value) {
    alert("请选择保存位置！");
    return;
  }

  // 禁用按钮
  downloadBtn.disabled = true;
  downloadBtn.textContent = "⏳ 下载中...";

  // 显示进度区域
  progressSection.style.display = "block";
  progressBar.style.width = "0%";

  // 清空之前的日志
  logOutput.innerHTML = "";

  // 统计不同网站的视频数量
  const websiteStats = {};
  urls.forEach((url) => {
    const website = detectWebsite(url);
    websiteStats[website] = (websiteStats[website] || 0) + 1;
  });

  addLog(`开始下载 ${urls.length} 个视频`, "info");
  addLog(`保存位置: ${outputPath.value}`, "info");
  addLog(`视频质量: ${quality.options[quality.selectedIndex].text}`, "info");
  addLog(`文件名格式: ${useVideoId.checked ? "视频ID" : "视频标题"}`, "info");
  addLog("=".repeat(50), "info");
  addLog("📊 网站统计:", "info");
  Object.entries(websiteStats).forEach(([website, count]) => {
    addLog(`  ${website}: ${count} 个`, "info");
  });
  addLog("=".repeat(50), "info");

  // 收集平台特定配置
  const platformSettings = {
    youtube: {
      cookiePath: youtubeCookiePath.value || null
    },
    pinterest: {
      downloadThumbnail: pinterestThumbnail.checked
    }
  };

  // 如果设置了 YouTube Cookie 文件，记录到日志
  if (youtubeCookiePath.value) {
    addLog(`YouTube Cookie: ${youtubeCookiePath.value}`, "info");
  }

  // 发送下载请求
  ipcRenderer.send("download-video", {
    urls: urls,
    outputPath: outputPath.value,
    quality: quality.value,
    useVideoId: useVideoId.checked,
    platformSettings: platformSettings
  });
});

// 清空日志
clearBtn.addEventListener("click", () => {
  logOutput.innerHTML = "";
});

// 接收下载进度
ipcRenderer.on("download-progress", (event, data) => {
  // 如果不是最后一个视频，进度最多到99%
  let percent;
  if (data.current < data.total) {
    percent = Math.min(Math.round((data.current / data.total) * 100), 99);
  } else {
    // 最后一个视频，根据状态决定是否显示100%
    if (data.status === "success") {
      percent = 100;
    } else {
      percent = 99;
    }
  }

  progressBar.style.width = percent + "%";
  progressBar.textContent = percent + "%";

  // 显示网站类型
  const websiteIcon = detectWebsite(data.url);
  progressText.textContent = `[${websiteIcon}] 正在下载 ${data.current}/${data.total}: ${data.url}`;

  if (data.status === "success") {
    addLog(
      `✓ [${data.current}/${data.total}] ${websiteIcon} 下载成功: ${data.url}`,
      "success"
    );
  } else if (data.status === "error") {
    addLog(
      `✗ [${data.current}/${data.total}] ${websiteIcon} 下载失败: ${data.url}`,
      "error"
    );
    if (data.error) {
      addLog(`  错误信息: ${data.error}`, "error");
    }
  }
});

// 接收下载输出
ipcRenderer.on("download-output", (event, output) => {
  // 只显示重要的输出信息
  if (
    output.includes("[download]") ||
    output.includes("Downloading") ||
    output.includes("Merging") ||
    output.includes("ERROR") ||
    output.includes("WARNING")
  ) {
    addLog(output.trim());
  }
});

// 接收下载完成
ipcRenderer.on("download-complete", (event, data) => {
  downloadBtn.disabled = false;
  downloadBtn.textContent = "⬇️ 开始下载";

  if (data.success) {
    progressText.textContent = "所有视频下载完成！";
    progressBar.style.width = "100%";
    progressBar.textContent = "100%";
    addLog("=".repeat(50), "info");
    addLog("✓ 所有视频下载完成！", "success");
  } else {
    addLog("=".repeat(50), "info");
    addLog(`✗ 下载过程中出现错误: ${data.error}`, "error");
  }
});

// 添加日志
function addLog(message, type = "") {
  const logEntry = document.createElement("div");
  logEntry.className = "log-entry";

  if (type === "success") {
    logEntry.className += " log-success";
  } else if (type === "error") {
    logEntry.className += " log-error";
  } else if (type === "info") {
    logEntry.className += " log-info";
  }

  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  logEntry.textContent = `[${timestamp}] ${message}`;

  logOutput.appendChild(logEntry);
  logOutput.scrollTop = logOutput.scrollHeight;
}
