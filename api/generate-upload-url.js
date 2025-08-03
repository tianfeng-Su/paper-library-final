// 文件: api/generate-upload-url.js
// 【精简版】: 只用于预览和下载

import OSS from 'ali-oss';

const client = new OSS({
  endpoint: `oss-cn-hongkong.aliyuncs.com`,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

export default async (req, res) => {
  // 只允许GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET 请求' });
  }
  
  try {
    const { name, disposition } = req.query;
    if (!name) {
      return res.status(400).json({ error: '缺少必需的参数: name' });
    }

    const options = {
      method: 'GET',
      expires: 3600, // 1小时有效期
    };

    if (disposition) {
      options.response = {
        'content-disposition': `${disposition}; filename="${encodeURIComponent(name)}"`
      };
    }

    const signedUrl = client.signatureUrl(name, options);

    res.status(200).json({ url: signedUrl });

  } catch (error) {
    console.error('生成签名URL失败:', error);
    res.status(500).json({ error: '生成签名URL时发生服务器错误' });
  }
};