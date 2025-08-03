// 文件: api/generate-upload-url.js
// 修复后的最终版本

const OSS = require('ali-oss');

// 初始化 OSS Client
const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

module.exports = (req, res) => {
  // 手动设置 CORS 头，确保兼容性
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只允许 GET 请求
  if (req.method !== 'GET') {
    res.status(405).json({ error: '仅支持 GET 请求' });
    return;
  }

  try {
    // 获取请求参数，支持多种参数格式
    const { name, method = 'PUT', disposition } = req.query;
    // 从请求中获取contentType，并提供一个稳定的默认值
    const contentType = req.query.contentType || 'application/pdf';

    // 验证必需参数
    if (!name) {
      res.status(400).json({ error: '缺少必需的参数: name' });
      return;
    }

    // 解码文件名
    const decodedFileName = decodeURIComponent(name);
    
    // 生成唯一的文件路径，避免文件名冲突
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const uniqueFileName = `papers/${timestamp}-${randomSuffix}-${decodedFileName}`;

    console.log('生成签名URL - 文件名:', uniqueFileName);
    console.log('请求参数:', { name, contentType, method, disposition });

    if (method === 'PUT') {
      // 上传操作
      const options = {
        method: 'PUT',
        expires: 3600, // 1小时有效期
        // 【关键修复】: 始终为PUT操作的签名URL指定Content-Type
        // 这要求客户端在上传时必须提供完全相同的Content-Type头
        headers: {
          'Content-Type': contentType
        }
      };

      const signedUrl = client.signatureUrl(uniqueFileName, options);
      
      // 生成文件的最终访问URL
      const fileUrl = `https://${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${uniqueFileName}`;

      console.log('生成的上传URL:', signedUrl);
      console.log('文件访问URL:', fileUrl);

      res.status(200).json({
        uploadUrl: signedUrl,
        fileUrl: fileUrl,
        fileName: decodedFileName,
        uniquePath: uniqueFileName
      });

    } else if (method === 'GET') {
      // 下载/预览操作
      const options = {
        method: 'GET',
        expires: 3600,
      };

      // 如果指定了 disposition，设置下载方式
      if (disposition) {
        options.response = {
          'content-disposition': `${disposition}; filename="${encodeURIComponent(decodedFileName)}"`
        };
      }

      const signedUrl = client.signatureUrl(uniqueFileName, options);

      res.status(200).json({
        uploadUrl: signedUrl, // 保持字段名一致
        url: signedUrl
      });

    } else {
      res.status(400).json({ error: '不支持的操作方法' });
    }

  } catch (error) {
    console.error('生成签名URL失败:', error);
    console.error('错误详情:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({ 
      error: '生成签名URL时发生服务器错误',
      details: process.env.NODE_ENV === 'development' ? error.message : '内部服务器错误'
    });
  }
};
