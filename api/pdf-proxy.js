// api/pdf-proxy.js  —— CommonJS 版，兼容 Vercel（修复 500）
// 说明：服务端代理 OSS，支持中文文件名与 Range，前端一律请求 /api/pdf-proxy?name=<key>&disposition=inline|attachment

const OSS = require('ali-oss');

function createClient() {
  const region   = process.env.ALIYUN_OSS_REGION || process.env.OSS_REGION;
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT || process.env.OSS_ENDPOINT; // 可选：如果你更喜欢用 endpoint
  const bucket   = process.env.ALIYUN_OSS_BUCKET || process.env.OSS_BUCKET;
  const accessKeyId     = process.env.ALIYUN_ACCESS_KEY_ID     || process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET;

  if (!bucket || !(region || endpoint) || !accessKeyId || !accessKeySecret) {
    throw new Error('OSS 环境变量缺失：请配置 ALIYUN_OSS_REGION(或 ALIYUN_OSS_ENDPOINT)、ALIYUN_OSS_BUCKET、ALIYUN_ACCESS_KEY_ID、ALIYUN_ACCESS_KEY_SECRET');
    }
  const base = { accessKeyId, accessKeySecret, bucket, secure: true };
  return new OSS(endpoint ? { ...base, endpoint } : { ...base, region });
}

function normalizeKey(raw) {
  if (!raw) return '';
  let key = Array.isArray(raw) ? raw[0] : String(raw);
  try {
    // 如果传了完整 URL，仅取 pathname
    if (/^https?:\/\//i.test(key)) {
      const u = new URL(key);
      key = u.pathname;
    }
  } catch {}
  key = key.replace(/^\/+/, '');
  try { key = decodeURIComponent(key); } catch {}
  return key;
}

function encodeRFC5987(str) {
  return encodeURIComponent(str).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const key = normalizeKey(req.query.name);
    if (!key) {
      res.status(400).json({ error: 'Missing "name" parameter' });
      return;
    }

    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const filename = key.split('/').pop();
    const contentDisposition = `${disposition}; filename*=UTF-8''${encodeRFC5987(filename)}`;

    const client = createClient();
    const signedUrl = client.signatureUrl(key, {
      expires: 600,
      response: {
        'content-disposition': contentDisposition,
        'content-type': 'application/pdf',
      },
    });

    const headers = {};
    if (req.headers.range) headers['Range'] = req.headers.range;

    const upstream = await fetch(signedUrl, { headers });

    // 透传状态码与关键响应头
    res.status(upstream.status);
    const h = upstream.headers;
    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control'];
    pass.forEach(k => { const v = h.get(k); if (v) res.setHeader(k.replace(/(^|-)\w/g, m => m.toUpperCase()), v); });
    res.setHeader('Content-Disposition', contentDisposition);

    // 简洁稳妥：整包回传（OSS 已按 Range 切好片段）
    const ab = await upstream.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (err) {
    console.error('[pdf-proxy]', err);
    res.status(500).json({ error: 'Proxy failed', details: err.message });
  }
};
