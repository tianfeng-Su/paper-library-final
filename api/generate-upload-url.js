// 文件: api/generate-upload-url.js
// 请用以下全部代码替换您文件中的内容

const OSS = require('ali-oss');
const cors = require('cors')({ origin: true });

// 初始化 OSS Client
// 请确保您的环境变量已正确设置
const client = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true, // 使用 HTTPS
});

// 使用 Vercel Serverless Function 的标准导出格式
module.exports = (req, res) => {
  // 使用 cors 中间件处理跨域预检请求
  cors(req, res, () => {
    // 从请求的查询参数中获取文件名和文件类型
    const { name, contentType } = req.query;

    // 验证必需的参数是否存在
    if (!name || !contentType) {
      res.status(400).json({ error: '文件名 (name) 和文件类型 (contentType) 是必需的查询参数。' });
      return;
    }

    // 解码文件名以防中文乱码
    const decodedFileName = decodeURIComponent(name);

    try {
      const options = {
        method: 'PUT',
        expires: 3600, // 签名有效期1小时
        headers: {
          // 关键：将从前端获取的 contentType 加入到签名头部
          'Content-Type': contentType 
        }
      };

      // 使用包含正确 headers 的选项来生成签名 URL
      const signedUrl = client.signatureUrl(decodedFileName, options);

      // 假设您的文件最终访问地址格式如下
      // 请确保 process.env.ALIYUN_OSS_BUCKET 的值是正确的
      const fileUrl = `https://${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com/${decodedFileName}`;

      // 将签名后的上传 URL 和最终文件访问 URL 返回给前端
      res.status(200).json({
        uploadUrl: signedUrl,
        fileUrl: fileUrl
      });

    } catch (error) {
      console.error('生成签名 URL 失败:', error);
      res.status(500).json({ error: '生成签名 URL 时发生服务器内部错误。' });
    }
  });
};
