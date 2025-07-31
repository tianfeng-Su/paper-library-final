// /api/generate-upload-url.js
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
    const originalFileName = decodeURIComponent(req.query.name);
    const httpMethod = req.query.method === 'GET' ? 'GET' : 'PUT';
    try {
      let signedUrl;
      const responseJson = {};
      if (httpMethod === 'PUT') {
        const fileType = req.query.type || 'application/octet-stream';
        const options = {
          expires: 300,
          method: 'PUT',
          'Content-Type': fileType,
          'Content-Disposition': `inline; filename*="UTF-8''${encodeURIComponent(originalFileName)}"`
        };
        signedUrl = client.signatureUrl(originalFileName, options);
        responseJson.uploadUrl = signedUrl;
        responseJson.fileUrl = `https://${client.options.bucket}.${client.options.region}.aliyuncs.com/${encodeURIComponent(originalFileName)}`;
      } else { 
        const options = { expires: 300, method: 'GET' };
        if (req.query.disposition === 'attachment') {
          options.response = { 'content-disposition': `attachment; filename*="UTF-8''${encodeURIComponent(originalFileName)}"` };
        } else {
          options.response = { 'content-disposition': `inline; filename*="UTF-8''${encodeURIComponent(originalFileName)}"` };
        }
        signedUrl = client.signatureUrl(originalFileName, options);
        responseJson.uploadUrl = signedUrl; 
      }
      res.status(200).json(responseJson);
    } catch (error) {
      console.error('生成签名URL时出错:', error);
      res.status(500).json({ error: '无法生成操作链接' });
    }
  });
};