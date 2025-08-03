// api/generate-upload-url.js  
// 简化版本：移除复杂依赖，确保基本功能

export default async function handler(req, res) {
  // 设置 CORS
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
      console.log('错误：缺少name参数');
      return res.status(400).json({ error: '缺少必需的参数: name' });
    }

    console.log('处理文件URL请求:', name, '类型:', disposition);

    // 检查环境变量
    const requiredEnvs = ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ALIYUN_OSS_BUCKET'];
    const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
    
    if (missingEnvs.length > 0) {
      console.error('缺少环境变量:', missingEnvs);
      return res.status(500).json({ 
        error: '服务器配置错误',
        details: `缺少环境变量: ${missingEnvs.join(', ')}`
      });
    }

    // 动态导入 OSS（避免初始化错误）
    const OSS = (await import('ali-oss')).default;
    
    const client = new OSS({
      endpoint: `oss-cn-hongkong.aliyuncs.com`,
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      bucket: process.env.ALIYUN_OSS_BUCKET,
      secure: true,
    });

    const options = {
      method: 'GET',
      expires: 3600, // 1小时有效期
    };

    if (disposition) {
      const cleanFileName = decodeURIComponent(name).split('/').pop();
      options.response = {
        'content-disposition': `${disposition}; filename="${encodeURIComponent(cleanFileName)}"`
      };
    }

    console.log('生成签名URL，选项:', options);
    
    const signedUrl = client.signatureUrl(name, options);
    
    console.log('签名URL生成成功');

    res.status(200).json({ 
      url: signedUrl,
      fileName: name,
      disposition: disposition || 'inline',
      expires: Date.now() + (3600 * 1000)
    });

  } catch (error) {
    console.error('生成URL失败:', error);
    
    // 详细的错误信息
    let errorMessage = '生成预览链接失败';
    let errorDetails = error.message;
    
    if (error.name === 'TypeError' && error.message.includes('OSS')) {
      errorMessage = 'OSS服务初始化失败';
      errorDetails = '请检查阿里云OSS配置';
    } else if (error.code === 'InvalidAccessKeyId') {
      errorMessage = 'OSS访问密钥无效';
    } else if (error.code === 'NoSuchBucket') {
      errorMessage = 'OSS存储桶不存在';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    });
  }
}
