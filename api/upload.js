// 文件: api/upload.js
// 这是全新的服务器中转上传API

const OSS = require('ali-oss');
const formidable = require('formidable');
const fs = require('fs');

// 初始化 OSS Client
const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

// Vercel的serverless函数需要特殊配置来处理文件流
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async (req, res) => {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    res.status(405).json({ error: '仅支持 POST 请求' });
    return;
  }
  
  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    
    const paperFile = files.paper; // 'paper' 是我们前端上传时使用的字段名
    if (!paperFile) {
      return res.status(400).json({ error: '没有找到上传的文件' });
    }

    const file = paperFile[0];
    const filePath = file.filepath;
    const originalFilename = file.originalFilename;

    // 生成唯一的文件路径
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueFileName = `papers/${timestamp}-${randomSuffix}-${originalFilename}`;

    // 从临时路径上传文件到OSS
    const result = await client.put(uniqueFileName, filePath);
    
    // 上传成功后，可以选择删除本地的临时文件
    fs.unlinkSync(filePath);

    // 返回成功信息和文件的最终访问URL
    const fileUrl = result.url.replace('http://', 'https://'); // 确保返回https链接

    res.status(200).json({
      message: '文件上传成功',
      fileUrl: fileUrl,
      uniquePath: uniqueFileName
    });

  } catch (error) {
    console.error('服务器中转上传失败:', error);
    res.status(500).json({ 
      error: '文件上传失败', 
      details: error.message 
    });
  }
};
