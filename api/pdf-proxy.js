// /api/pdf-proxy.js
const OSS = require('ali-oss');
const fetch = require('node-fetch'); // 已在 package-lock.json 中

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  secure: true,
});

function decodeKeyParam(q) {
  let key = Array.isArray(q) ? q[0] : (q || '');
  try { key = key.split('/').map(decodeURIComponent).join('/'); } catch {}
  return key.replace(/^\/+/, '');
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const name = decodeKeyParam(req.query.name);
  if (!name) {
    res.status(400).json({ error: 'Missing name' });
    return;
  }
  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  const base = name.split('/').pop();
  const encodedFileName = encodeURIComponent(base);

  try {
    // 生成带签名的直链，然后在服务端转发（可携带 Range，兼容 pdf.js 分块加载）
    const signed = client.signatureUrl(name, {
      expires: 600,
      response: { 'content-disposition': `${disposition}; filename="${encodedFileName}"` },
    });

    const range = req.headers.range;
    const upstream = await fetch(signed, { headers: range ? { Range: range } : undefined });

    res.status(upstream.status);
    const h = upstream.headers;
    if (h.get('content-type'))   res.setHeader('Content-Type', h.get('content-type'));
    if (h.get('content-length')) res.setHeader('Content-Length', h.get('content-length'));
    if (h.get('content-range'))  res.setHeader('Content-Range', h.get('content-range'));
    if (h.get('accept-ranges'))  res.setHeader('Accept-Ranges', h.get('accept-ranges'));
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodedFileName}"`);

    upstream.body.on('error', () => { /* 忽略下游中断 */ });
    upstream.body.pipe(res);
  } catch (err) {
    console.error('[pdf-proxy]', err);
    if (err && (err.name === 'NoSuchKeyError' || err.code === 'NoSuchKey')) {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({ error: 'Proxy failed' });
    }
  }
};
