// api/pdf-proxy.js
// 作用：用服务端去 OSS 取文件并把字节流原样返回，从而避免浏览器端的 CORS 与二次编码问题

import OSS from 'ali-oss';

function getClient() {
  return new OSS({
    // 任选其一：region 或 endpoint；保持与你的 OSS 一致
    endpoint: 'oss-cn-hongkong.aliyuncs.com',
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    bucket: process.env.ALIYUN_OSS_BUCKET,
  });
}

function rfc5987Encode(str) {
  // Content-Disposition 的 UTF-8 文件名编码
  return encodeURIComponent(str).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

function normalizeKey(raw) {
  if (!raw) return '';
  let key = String(raw);
  // 可能传入完整 URL，这里只取路径
  try {
    if (/^https?:\\/\\//i.test(key)) {
      const u = new URL(key);
      key = u.pathname;
    }
  } catch (_) {}
  key = key.replace(/^\\/+/, '');             // 去掉开头的 /
  try { key = decodeURIComponent(key); } catch (_) {}  // 防二次编码
  return key;
}

export default async function handler(req, res) {
  // 允许本域前端调用
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: '仅支持 GET 请求' });

  try {
    const nameParam = String(req.query.name || '');
    const key = normalizeKey(nameParam);
    if (!key) return res.status(400).json({ error: '缺少 name 参数' });

    const dispositionType = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const filename = key.split('/').pop();
    const contentDisposition = `${dispositionType}; filename*=UTF-8''${rfc5987Encode(filename)}`;

    const client = getClient();

    // 生成用于服务端拉取的临时签名 URL（私有桶也可访问）
    const signedUrl = client.signatureUrl(key, {
      expires: 300,
      response: {
        'content-disposition': contentDisposition,
        'content-type': 'application/pdf',
      },
    });

    const remote = await fetch(signedUrl);
    if (!remote.ok) {
      const text = await remote.text().catch(() => '');
      return res.status(remote.status).json({ error: 'OSS 获取失败', details: text.slice(0, 200) });
    }

    // 设置头并把字节流回传给浏览器
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    const ab = await remote.arrayBuffer();
    res.status(200).end(Buffer.from(ab));
  } catch (error) {
    console.error('PDF 代理错误:', error);
    res.status(500).json({
      error: '生成预览链接失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
