// 优化思源笔记所有文档的排版（在中文和英文、数字之间加空格）

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- 配置项 ---
const BASE_URL = 'http://127.0.0.1:6806';    // 替换为你的实际地址（一般都是这个地址）
const AUTH_TOKEN = 'Token xxxxxx';           // xxxxxx 替换为你的实际 token
const LOG_DIR = 'logs';                      // 日志文件夹名称
const LOG_FILE = path.join(__dirname, LOG_DIR, `app_log_${Date.now()}.log`); // 日志文件路径

const BATCH_SIZE = 300; // 每批处理的 autoSpace 请求数量
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
    // 确保 nodes 是一个数组，即使只传入一个节点，也将其包装成数组
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

// --- 辅助函数：延迟指定毫秒数 ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- 主逻辑 ---
async function main() {
    log('--- 开始处理 ---');
    log(`日志文件路径: ${LOG_FILE}`);
    const allDocumentIds = new Set(); // 使用 Set 存储，自动去重

    try {
        // 1. 获取所有笔记本信息 (改为 POST 请求)
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
                
                // !!! 关键修改点在这里 !!!
                // 文档树数据现在在 response.data.tree 中，它是一个数组
                const docTree = docTreeResponse.data.tree; 

                if (docTree && docTree.length > 0) {
                    const currentNotebookDocIds = [];
                    // 将整个 tree 数组传入 extractDocIds
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

        // 4. 对每个文档 ID 发送 autoSpace 请求 (分批处理并暂停)
        log('\n--- 4. 对每个文档 ID 发送 autoSpace 请求 (分批处理) ---');

        for (let i = 0; i < uniqueDocIds.length; i += BATCH_SIZE) {
            const batchIds = uniqueDocIds.slice(i, i + BATCH_SIZE);
            log(`\n--- 处理批次: ${Math.floor(i / BATCH_SIZE) + 1} (文档 ID ${i + 1} 到 ${Math.min(i + BATCH_SIZE, uniqueDocIds.length)}) ---`);

            const batchPromises = batchIds.map(async (docId) => {
                try {
                    log(`正在发送 autoSpace 请求，文档 ID: ${docId}`);
                    await postRequest('/api/format/autoSpace', { id: docId });
                    log(`文档 ID: ${docId} 的 autoSpace 请求完成。`);
                } catch (error) {
                    log(`文档 ID: ${docId} 的 autoSpace 请求失败，跳过此文档。`, 'ERROR');
                }
            });

            // 等待当前批次的所有请求完成
            await Promise.all(batchPromises);

            // 如果还有剩余的文档 ID 需要处理，则暂停
            if (i + BATCH_SIZE < uniqueDocIds.length) {
                log(`批次处理完成。暂停 ${PAUSE_MINUTES} 分钟以避免操作频繁...`);
                await delay(PAUSE_MS);
                log('恢复处理。');
            } else {
                log('所有批次处理完成，无需暂停。');
            }
        }

        log('\n--- 所有 autoSpace 请求已发送完毕 ---');

    } catch (error) {
        log('\n--- 主程序执行过程中发生致命错误 ---', 'CRITICAL');
        log(error.stack || error.message, 'CRITICAL');
    } finally {
        log('--- 处理结束 ---');
    }
}

// 运行主函数
main();
