// api/delete-paper.js —— CommonJS 版，校验 Firebase ID Token + 删除 Firestore 文档 + 可选删除 OSS 文件

const admin = require('firebase-admin');
const OSS = require('ali-oss');

function initAdmin() {
  if (admin.apps.length) return admin;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    return admin;
  }

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey    = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    return admin;
  }

  throw new Error('Firebase Admin 凭证缺失');
}

function createClient() {
  const region   = process.env.ALIYUN_OSS_REGION || process.env.OSS_REGION;
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT || process.env.OSS_ENDPOINT;
  const bucket   = process.env.ALIYUN_OSS_BUCKET || process.env.OSS_BUCKET;
  const accessKeyId     = process.env.ALIYUN_ACCESS_KEY_ID     || process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET;

  if (!bucket || !(region || endpoint) || !accessKeyId || !accessKeySecret) {
    throw new Error('OSS 环境变量缺失');
  }
  const base = { accessKeyId, accessKeySecret, bucket, secure: true };
  return new OSS(endpoint ? { ...base, endpoint } : { ...base, region });
}

function normalizeKey(raw) {
  if (!raw) return '';
  let key = String(raw);
  try { if (/^https?:\/\//i.test(key)) { const u = new URL(key); key = u.pathname; } } catch {}
  key = key.replace(/^\/+/, '');
  try { key = decodeURIComponent(key); } catch {}
  return key;
}

function allowed(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list.includes((email || '').toLowerCase()) : true;
}

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) { res.status(401).json({ error: 'Missing token' }); return; }

    const adminSDK = initAdmin();
    const decoded = await adminSDK.auth().verifyIdToken(token);
    if (!decoded?.email || !allowed(decoded.email)) { res.status(403).json({ error: 'No permission' }); return; }

    const { id, fileName } = req.body || {};
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

    // 删 Firestore
    await adminSDK.firestore().collection('papers').doc(String(id)).delete().catch(() => {});

    // 删 OSS（可选）
    if (fileName) {
      try { await createClient().delete(normalizeKey(fileName)); } catch (e) {
        if (e?.code !== 'NoSuchKey') console.warn('[OSS delete]', e);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-paper]', e);
    res.status(500).json({ error: 'Delete failed', details: e.message });
  }
};
