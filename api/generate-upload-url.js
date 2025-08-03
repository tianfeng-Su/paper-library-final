// 文件: api/generate-upload-url.js
// 修复版本：增强错误处理和日志记录

import OSS from 'ali-oss';

const client = new OSS({
  endpoint: `oss-cn-hongkong.aliyuncs.com`,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

export default async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET 请求' });
  }
  
  try {
    const { name, disposition } = req.query;
    
    if (!name) {
      console.error('缺少文件名参数');
      return res.status(400).json({ error: '缺少必需的参数: name' });
    }

    const fileName = decodeURIComponent(name);
    console.log('处理文件URL请求:', fileName, '操作类型:', disposition || 'inline');

    // 检查文件是否存在
    try {
      const headResult = await client.head(fileName);
      console.log('文件存在，大小:', headResult.res.headers['content-length']);
    } catch (headError) {
      console.error('文件不存在:', fileName, headError.message);
      return res.status(404).json({ error: '文件不存在' });
    }

    const options = {
      method: 'GET',
      expires: 3600, // 1小时有效期
    };

    // 设置响应头
    if (disposition) {
      const cleanFileName = fileName.split('/').pop(); // 获取文件名部分
      options.response = {
        'content-disposition': `${disposition}; filename*="UTF-8''${encodeURIComponent(cleanFileName)}"`,
        'content-type': 'application/pdf'
      };
    }

    const signedUrl = client.signatureUrl(fileName, options);
    console.log('成功生成签名URL');

    res.status(200).json({ 
      url: signedUrl,
      expires: Date.now() + (3600 * 1000) // 返回过期时间戳
    });

  } catch (error) {
    console.error('生成签名URL失败:', error);
    
    let errorMessage = '生成签名URL时发生服务器错误';
    
    if (error.code === 'NoSuchBucket') {
      errorMessage = 'OSS存储桶不存在';
    } else if (error.code === 'InvalidAccessKeyId') {
      errorMessage = 'OSS访问密钥无效';
    } else if (error.code === 'SignatureDoesNotMatch') {
      errorMessage = 'OSS签名验证失败';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
