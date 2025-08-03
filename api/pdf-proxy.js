// /api/pdf-proxy.js
const OSS = require('ali-oss');
const cors = require('cors');
const corsMiddleware = cors();

const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

module.exports = (req, res) => {
  corsMiddleware(req, res, () => {
    const fileName = decodeURIComponent(req.query.name);
    if (!fileName) {
      return res.status(400).json({ error: '缺少文件名参数' });
    }
    try {
      const signedUrl = client.signatureUrl(fileName, {
        expires: 300,
        method: 'GET',
        response: {
          'content-disposition': `inline; filename*="UTF-8''${encodeURIComponent(fileName)}"`
        }
      });
      res.writeHead(302, { Location: signedUrl });
      res.end();
    } catch (error) {
      console.error('生成预览URL时出错:', error);
      res.status(500).json({ error: '服务异常: ' + error.message });
    }
  });
};