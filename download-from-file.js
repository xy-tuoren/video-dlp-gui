const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// 检测 yt-dlp 可执行文件路径
function getYtDlpPath() {
    // 优先使用本地的 yt-dlp.exe
    const localPath = path.join(__dirname, 'yt-dlp.exe');
    if (fs.existsSync(localPath)) {
        return localPath;
    }
    // 否则使用系统安装的 yt-dlp
    return 'yt-dlp';
}

// 创建下载目录
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir);
}

// 从urls.txt读取链接
const urlsFile = path.join(__dirname, 'urls.txt');

if (!fs.existsSync(urlsFile)) {
    console.error('错误: 找不到 urls.txt 文件！');
    console.log('请创建 urls.txt 文件并在其中添加视频链接（每行一个）');
    process.exit(1);
}

// 读取并解析链接
const content = fs.readFileSync(urlsFile, 'utf-8');
const videoUrls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // 过滤空行和注释

if (videoUrls.length === 0) {
    console.log('urls.txt 中没有找到有效的视频链接！');
    process.exit(0);
}

console.log('=== YouTube 批量视频下载工具 ===');
console.log(`找到 ${videoUrls.length} 个视频链接\n`);

// 递归下载视频
function downloadNext(index) {
    if (index >= videoUrls.length) {
        console.log('\n=== 所有视频下载完成！===');
        return;
    }

    const url = videoUrls[index];
    console.log(`\n[${index + 1}/${videoUrls.length}] 正在下载: ${url}`);

    // yt-dlp 下载参数
    const args = [
        url,
        '-o', path.join(downloadDir, '%(title)s.%(ext)s'),
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        // 速度优化参数
        '--concurrent-fragments', '4',
        '--buffer-size', '16K',
        // 稳定性优化参数
        '--retries', '10',
        '--fragment-retries', '10',
        '--socket-timeout', '30'
    ];

    const ytdlpPath = getYtDlpPath();
    const ytdlp = spawn(ytdlpPath, args, {
        shell: true
    });

    // 处理输出编码
    ytdlp.stdout.on('data', (data) => {
        const output = iconv.decode(data, 'cp936');
        process.stdout.write(output);
    });

    ytdlp.stderr.on('data', (data) => {
        const output = iconv.decode(data, 'cp936');
        process.stderr.write(output);
    });

    ytdlp.on('close', (code) => {
        if (code === 0) {
            console.log(`✓ 第 ${index + 1} 个视频下载成功`);
        } else {
            console.log(`✗ 第 ${index + 1} 个视频下载失败 (错误代码: ${code})`);
        }
        // 继续下载下一个
        downloadNext(index + 1);
    });

    ytdlp.on('error', (err) => {
        console.error(`错误: ${err.message}`);
        console.log('\n请下载 yt-dlp.exe 并放在此目录下:');
        console.log('  下载地址: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
        console.log('  或者使用 npm run setup 自动下载');
        process.exit(1);
    });
}

// 开始下载
downloadNext(0);

