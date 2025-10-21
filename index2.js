// 优化思源笔记所有文档的标题排版（在中文和英文、数字之间加空格）

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- 配置项 ---
const BASE_URL = 'http://127.0.0.1:6806';
const AUTH_TOKEN = 'xxxxxx';  // !!! 请替换为你的思源笔记 API Token !!!  获取方法：思源设置 -> 关于 -> API Token

const LOG_DIR = 'logs'; // 日志文件夹名称
const LOG_FILE = path.join(__dirname, LOG_DIR, `app_log_${Date.now()}.log`); // 日志文件路径

const REQUEST_BATCH_SIZE = 1000; // 每发送多少次请求后休息
const PAUSE_MINUTES = 1; // 暂停时间（分钟）
const PAUSE_MS = PAUSE_MINUTES * 60 * 1000; // 暂停时间（毫秒）

// 确保日志目录存在
if (!fs.existsSync(path.join(__dirname, LOG_DIR))) {
    fs.mkdirSync(path.join(__dirname, LOG_DIR));
}

// --- 辅助函数：日志记录 ---
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    process.stdout.write(logMessage); // 输出到控制台
    fs.appendFileSync(LOG_FILE, logMessage); // 写入到文件
}

// --- 辅助函数：发送带认证的 POST 请求 ---
async function postRequest(endpoint, data = {}, customHeaders = {}) {
    try {
        const url = `${BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': AUTH_TOKEN,
            ...customHeaders,
        };

        log(`请求 ${endpoint} - 数据: ${JSON.stringify(data)}`);
        const response = await axios.post(url, data, { headers });
        log(`响应 ${endpoint} - 状态: ${response.status} - 数据: ${JSON.stringify(response.data)}`);
        return response.data;
    } catch (error) {
        log(`请求 ${endpoint} 失败: ${error.message}`, 'ERROR');
        if (error.response) {
            log(`错误详情 - 状态码: ${error.response.status}, 数据: ${JSON.stringify(error.response.data)}`, 'ERROR');
        }
        throw error;
    }
}

// --- 辅助函数：递归提取所有文档 ID ---
// 这个函数现在接收一个节点或节点数组
function extractDocIds(nodes, idList) {
    const nodesToProcess = Array.isArray(nodes) ? nodes : [nodes];

    for (const node of nodesToProcess) {
        if (node && node.id) { // 只要有 id 字段，就认为是文档 ID
            idList.push(node.id);
        }

        if (node && node.children && Array.isArray(node.children)) {
            // 递归处理子节点
            extractDocIds(node.children, idList);
        }
    }
}

// --- 辅助函数：优化标题排版 ---
function optimizeTitle(title) {
    if (!title || typeof title !== 'string') {
        return title;
    }

    let newTitle = title;

    // 规则 1: 中文与英文/数字之间添加空格
    // 例如: "从 0 到 10000 粉丝的心得分" -> "从 0 到 10000 粉丝的心得分"
    newTitle = newTitle.replace(/([\u 4 e 00-\u 9 fa 5])([a-zA-Z 0-9])/g, '$1 $2');
    newTitle = newTitle.replace(/([a-zA-Z 0-9])([\u 4 e 00-\u 9 fa 5])/g, '$1 $2');

    // 规则 2: 去除多余的空格，只保留一个
    newTitle = newTitle.replace(/\s+/g, ' ').trim();

    return newTitle;
}

// --- 辅助函数：延迟指定毫秒数 ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- 主逻辑 ---
async function main() {
    log('--- 开始处理 ---');
    log(`日志文件路径: ${LOG_FILE}`);
    const allDocumentIds = new Set(); // 使用 Set 存储，自动去重
    const documentDetailsMap = new Map(); // 存储 { docId: { box, path, rootTitle } }

    try {
        // 1. 获取所有笔记本信息
        log('\n--- 1. 获取所有笔记本信息 ---');
        const notebooksResponse = await postRequest('/api/notebook/lsNotebooks', {});
        const notebooks = notebooksResponse.data.notebooks; 

        if (!notebooks || notebooks.length === 0) {
            log('没有找到任何笔记本。');
            return;
        }

        log(`找到 ${notebooks.length} 个笔记本。`);

        // 2. 遍历每个笔记本，获取文档树并提取文档 ID
        for (const notebook of notebooks) {
            log(`\n--- 2. 处理笔记本: ${notebook.name} (ID: ${notebook.id}) ---`);
            try {
                const docTreeResponse = await postRequest('/api/filetree/listDocTree', {
                    notebook: notebook.id,
                    path: '/',
                });
                const docTree = docTreeResponse.data.tree; 

                if (docTree && docTree.length > 0) {
                    const currentNotebookDocIds = [];
                    extractDocIds(docTree, currentNotebookDocIds); 
                    currentNotebookDocIds.forEach(id => allDocumentIds.add(id));
                    log(`笔记本 "${notebook.name}" 中找到 ${currentNotebookDocIds.length} 篇文档 ID。`);
                } else {
                    log(`笔记本 "${notebook.name}" 没有找到文档树数据或为空。`);
                }
            } catch (error) {
                log(`处理笔记本 "${notebook.name}" (ID: ${notebook.id}) 的文档树时发生错误，跳过此笔记本。`, 'ERROR');
            }
        }

        log(`\n--- 3. 所有文档 ID 收集完毕 ---`);
        const uniqueDocIds = Array.from(allDocumentIds);
        log(`总共收集到 ${uniqueDocIds.length} 个唯一文档 ID。`);

        if (uniqueDocIds.length === 0) {
            log('没有文档 ID 需要处理。');
            return;
        }

        // 4. 遍历每个文档 ID，获取详细信息并存储
        log('\n--- 4. 获取每个文档的详细信息 ---');
        let requestCount = 0;
        for (const docId of uniqueDocIds) {
            try {
                const blockInfoResponse = await postRequest('/api/block/getBlockInfo', { id: docId });
                const docData = blockInfoResponse.data;
                if (docData && docData.box && docData.path && docData.rootTitle !== undefined) {
                    documentDetailsMap.set(docId, {
                        box: docData.box,
                        path: docData.path,
                        rootTitle: docData.rootTitle
                    });
                    log(`获取文档 ID: ${docId} 的信息成功。标题: "${docData.rootTitle}"`);
                } else {
                    log(`文档 ID: ${docId} 的信息不完整，跳过。`, 'WARN');
                }
            } catch (error) {
                log(`获取文档 ID: ${docId} 的信息失败，跳过。`, 'ERROR');
            }

            requestCount++;
            if (requestCount % REQUEST_BATCH_SIZE === 0 && requestCount < uniqueDocIds.length) {
                log(`已发送 ${requestCount} 次请求。暂停 ${PAUSE_MINUTES} 分钟以避免操作频繁...`);
                await delay(PAUSE_MS);
                log('恢复处理。');
            }
        }
        log(`所有文档详细信息获取完毕。`);

        // 5. 遍历文档，优化标题并重命名
        log('\n--- 5. 遍历文档，优化标题并重命名 ---');
        let renameCount = 0;
        requestCount = 0; // 重置请求计数器用于重命名操作
        for (const [docId, details] of documentDetailsMap.entries()) {
            const originalTitle = details.rootTitle;
            const optimizedTitle = optimizeTitle(originalTitle);

            if (originalTitle !== optimizedTitle) {
                log(`\n 文档 ID: ${docId}`);
                log(`  原标题: "${originalTitle}"`);
                log(`  新标题: "${optimizedTitle}"`);

                try {
                    await postRequest('/api/filetree/renameDoc', {
                        notebook: details.box,
                        path: details.path,
                        title: optimizedTitle
                    });
                    log(`  文档 ID: ${docId} 重命名成功。`);
                    renameCount++;
                } catch (error) {
                    log(`  文档 ID: ${docId} 重命名失败。`, 'ERROR');
                }
            } else {
                log(`文档 ID: ${docId} 标题无需优化: "${originalTitle}"`);
            }

            requestCount++;
            if (requestCount % REQUEST_BATCH_SIZE === 0 && requestCount < documentDetailsMap.size) {
                log(`已发送 ${requestCount} 次重命名请求。暂停 ${PAUSE_MINUTES} 分钟以避免操作频繁...`);
                await delay(PAUSE_MS);
                log('恢复处理。');
            }
        }

        log(`\n--- 6. 处理结果总结 ---`);
        log(`总共发现 ${uniqueDocIds.length} 篇唯一文档。`);
        log(`其中 ${renameCount} 篇文档的标题被优化并重命名。`);

    } catch (error) {
        log('\n--- 主程序执行过程中发生致命错误 ---', 'CRITICAL');
        log(error.stack || error.message, 'CRITICAL');
    } finally {
        log('--- 处理结束 ---');
    }
}

// 运行主函数
main();
