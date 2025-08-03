// 文件: api/upload.js
// 【终极修复版】: 不再使用 region，直接指定完整的 endpoint

import OSS from 'ali-oss';
import formidable from 'formidable';
import fs from 'fs';

// 【关键修改】: 我们不再让 ali-oss 库去猜测 endpoint
// 我们直接、明确地告诉它服务器地址
const HONGKONG_ENDPOINT = 'oss-cn-hongkong.aliyuncs.com';

// 初始化 OSS Client
const client = new OSS({
  // 使用 endpoint，而不是 region
  endpoint: HONGKONG_ENDPOINT,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  // 当我们手动指定非阿里云官网提供的cname域名时，需要将cname设为true
  // 但此处我们用的是阿里云官方endpoint，为了保险起见，我们不设置cname或设为false
  cname: false, 
  secure: true, // 始终使用 https
});

// Vercel的serverless函数需要特殊配置来处理文件流
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: '仅支持 POST 请求' });
    return;
  }
  
  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    
    const paperFile = files.paper;
    if (!paperFile || paperFile.length === 0) {
      return res.status(400).json({ error: '没有找到上传的文件' });
    }

    const file = paperFile[0];
    const filePath = file.filepath;
    const originalFilename = file.originalFilename;

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueFileName = `papers/${timestamp}-${randomSuffix}-${originalFilename}`;

    // 使用我们配置好的client进行上传
    const result = await client.put(uniqueFileName, filePath);
    
    fs.unlinkSync(filePath);

    // 【关键修改】: 从 result 中获取 url 的方式也需要调整
    // 因为我们指定了 endpoint 和 bucket，result.url 将是完整的
    const fileUrl = result.url;

    res.status(200).json({
      message: '文件上传成功',
      fileUrl: fileUrl,
      uniquePath: uniqueFileName
    });

  } catch (error) {
    console.error('服务器中转上传失败:', error);
    // 在日志中打印更详细的错误信息，帮助调试
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message 
    });
  }
};
