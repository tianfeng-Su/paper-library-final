// 文件: api/upload.js
// 【终极调试版】: 增加了大量的日志来定位崩溃点

import OSS from 'ali-oss';
import formidable from 'formidable';
import fs from 'fs';

// 一个带时间戳的日志函数
const log = (message, ...args) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...args);
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async (req, res) => {
  log("后端函数 /api/upload 开始执行。");

  if (req.method !== 'POST') {
    log("请求方法不是POST，终止。");
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  let client;
  try {
    log("步骤1: 初始化OSS客户端...");
    client = new OSS({
      endpoint: process.env.ALIYUN_OSS_ENDPOINT || `oss-cn-hongkong.aliyuncs.com`,
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      bucket: process.env.ALIYUN_OSS_BUCKET,
      secure: true,
      cname: false
    });
    log("OSS客户端初始化成功。");
  } catch (error) {
    log("【致命错误】: OSS客户端初始化失败。", error);
    return res.status(500).json({ error: '服务器内部错误: OSS客户端初始化失败', details: error.message });
  }
  
  const form = formidable({});
  let filePathForCleanup; // 用于在最后清理临时文件

  try {
    log("步骤2: 解析传入的表单数据...");
    const [fields, files] = await form.parse(req);
    log("表单数据解析成功。");
    
    const paperFile = files.paper;
    if (!paperFile || paperFile.length === 0) {
      log("错误: 在表单中未找到文件。");
      return res.status(400).json({ error: '没有找到上传的文件' });
    }

    const file = paperFile[0];
    filePathForCleanup = file.filepath; // 保存临时文件路径以供清理
    const originalFilename = file.originalFilename;
    log(`文件已接收: ${originalFilename}, 临时路径: ${filePathForCleanup}`);

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueFileName = `papers/${timestamp}-${randomSuffix}-${originalFilename}`;
    log(`生成的唯一文件名: ${uniqueFileName}`);

    log("步骤3: 从临时路径上传文件到OSS...");
    const result = await client.put(uniqueFileName, filePathForCleanup);
    log("文件上传到OSS成功。返回结果:", result);
    
    const fileUrl = result.url;
    log(`生成的最终文件URL: ${fileUrl}`);

    log("步骤4: 向前端发送成功响应...");
    res.status(200).json({
      message: '文件上传成功',
      fileUrl: fileUrl,
      uniquePath: uniqueFileName
    });
    log("成功响应已发送。函数执行完毕。");

  } catch (error) {
    log("【致命错误】: 在上传处理流程中发生崩溃。", error);
    // 打印最详细的错误信息
    console.error('错误详情:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    
    res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message 
    });
  } finally {
    // 无论成功还是失败，都尝试清理临时文件
    if (filePathForCleanup) {
      log(`步骤5: 清理临时文件: ${filePathForCleanup}`);
      try {
        fs.unlinkSync(filePathForCleanup);
        log("临时文件清理成功。");
      } catch (cleanupError) {
        log("清理临时文件时发生错误。", cleanupError);
      }
    }
  }
};
