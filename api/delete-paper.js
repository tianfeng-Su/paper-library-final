// /api/delete-paper.js
const admin = require('firebase-admin');
const OSS = require('ali-oss');

function initAdmin() {
  if (admin.apps.length) return admin;
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey    = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return admin;
}

const oss = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  secure: true,
});

function allowed(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list.includes((email || '').toLowerCase()) : true; // 没配白名单就放行所有已登录用户
}

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = await initAdmin().auth().verifyIdToken(token);
    if (!decoded?.email || !allowed(decoded.email)) {
      return res.status(403).json({ error: 'No permission' });
    }

    const { id, fileName } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // 先删 Firestore 文档（即使不存在也忽略）
    await initAdmin().firestore().collection('papers').doc(id).delete().catch(() => {});

    // 再尝试删 OSS 对象（可选）
    if (fileName) {
      const key = String(fileName).replace(/^\/+/, '');
      try { await oss.delete(key); } catch (e) {
        if (e?.code !== 'NoSuchKey') console.warn('[OSS delete]', e);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-paper]', e);
    res.status(500).json({ error: 'Delete failed' });
  }
};
