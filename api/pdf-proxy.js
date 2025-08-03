// 文件: api/pdf-proxy.js
// 修复版本：改进错误处理和兼容性

import OSS from 'ali-oss';
import cors from 'cors';

const corsMiddleware = cors({
  origin: true,
  credentials: true
});

const client = new OSS({
  endpoint: `oss-cn-hongkong.aliyuncs.com`,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

export default function handler(req, res) {
  return new Promise((resolve) => {
    corsMiddleware(req, res, async () => {
      try {
        const fileName = req.query.name ? decodeURIComponent(req.query.name) : null;
        
        if (!fileName) {
          res.status(400).json({ error: '缺少文件名参数' });
          return resolve();
        }

        console.log('PDF代理请求文件:', fileName);

        // 检查文件是否存在
        try {
          await client.head(fileName);
        } catch (headError) {
          console.error('文件不存在:', fileName, headError.message);
          res.status(404).json({ error: '文件不存在' });
          return resolve();
        }

        // 生成签名URL
        const signedUrl = client.signatureUrl(fileName, {
          expires: 600, // 10分钟有效期
          method: 'GET',
          response: {
            'content-disposition': `inline; filename*="UTF-8''${encodeURIComponent(fileName.split('/').pop())}"`,
            'content-type': 'application/pdf'
          }
        });

        console.log('生成的签名URL:', signedUrl);

        // 重定向到签名URL
        res.writeHead(302, { 
          'Location': signedUrl,
          'Cache-Control': 'no-cache'
        });
        res.end();
        resolve();

      } catch (error) {
        console.error('PDF代理错误:', error);
        res.status(500).json({ 
          error: '生成预览链接失败',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
        resolve();
      }
    });
  });
}
