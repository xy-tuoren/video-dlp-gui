const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const iconv = require('iconv-lite');

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
        icon: path.join(__dirname, 'icon.png')
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 获取默认下载路径
ipcMain.handle('get-default-download-path', () => {
    // 打包后使用用户的下载目录，开发时使用项目目录
    if (app.isPackaged) {
        return path.join(os.homedir(), 'Downloads', 'yt-dlp-downloads');
    } else {
        return path.join(__dirname, 'downloads');
    }
});

// 选择文件夹
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0];
});

// 选择URL文件
ipcMain.handle('select-url-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    
    if (result.filePaths[0]) {
        try {
            const content = fs.readFileSync(result.filePaths[0], 'utf-8');
            const urls = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
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
    let localPath = path.join(__dirname, 'yt-dlp.exe');
    if (fs.existsSync(localPath)) {
        return localPath;
    }
    
    // 打包后环境：在 resources 目录
    if (app.isPackaged) {
        localPath = path.join(process.resourcesPath, 'yt-dlp.exe');
        if (fs.existsSync(localPath)) {
            return localPath;
        }
    }
    
    return 'yt-dlp';
}

// 下载视频
ipcMain.on('download-video', (event, { urls, outputPath, quality, useVideoId }) => {
    const ytdlpPath = getYtDlpPath();
    downloadNext(0);
    
    function downloadNext(index) {
        if (index >= urls.length) {
            event.reply('download-complete', { success: true });
            return;
        }
        
        const url = urls[index].trim();
        if (!url) {
            downloadNext(index + 1);
            return;
        }
        
        event.reply('download-progress', {
            current: index + 1,
            total: urls.length,
            url: url,
            status: 'downloading'
        });
        
        // 根据选择的清晰度设置格式
        let formatString;
        switch(quality) {
            case '4k':
                formatString = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160]/best';
                break;
            case '1080p':
                formatString = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best';
                break;
            case '720p':
                formatString = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best';
                break;
            case '480p':
                formatString = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best';
                break;
            default:
                formatString = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        }
        
        // 根据配置决定使用视频ID还是标题作为文件名
        const outputTemplate = useVideoId 
            ? path.join(outputPath, '%(id)s.%(ext)s')
            : path.join(outputPath, '%(title)s.%(ext)s');
        
        const args = [
            url,
            '-o', outputTemplate,
            '--format', formatString,
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
        
        const ytdlp = spawn(ytdlpPath, args, {
            shell: true
        });
        
        let outputData = '';
        
        ytdlp.stdout.on('data', (data) => {
            const output = iconv.decode(data, 'cp936');
            outputData += output;
            event.reply('download-output', output);
        });
        
        ytdlp.stderr.on('data', (data) => {
            const output = iconv.decode(data, 'cp936');
            outputData += output;
            event.reply('download-output', output);
        });
        
        ytdlp.on('close', (code) => {
            if (code === 0) {
                event.reply('download-progress', {
                    current: index + 1,
                    total: urls.length,
                    url: url,
                    status: 'success'
                });
            } else {
                event.reply('download-progress', {
                    current: index + 1,
                    total: urls.length,
                    url: url,
                    status: 'error',
                    error: `下载失败 (错误代码: ${code})`
                });
            }
            downloadNext(index + 1);
        });
        
        ytdlp.on('error', (err) => {
            event.reply('download-progress', {
                current: index + 1,
                total: urls.length,
                url: url,
                status: 'error',
                error: err.message
            });
            event.reply('download-complete', { 
                success: false, 
                error: '无法启动 yt-dlp，请确保 yt-dlp.exe 在程序目录下' 
            });
        });
    }
});


