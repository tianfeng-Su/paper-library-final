// api/get-summary.js —— CommonJS 版（修复 ESM 报错），从 Firestore 读取 summary 字段
// 若文档未写 summary，则返回空字符串（前端会显示“暂无摘要”）

const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin;

  // 优先：整段 JSON 存在 FIREBASE_SERVICE_ACCOUNT_KEY（你已在 Vercel 配置）
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    return admin;
  }

  // 备选：三段式
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

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const id = req.query.id;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  try {
    const db = initAdmin().firestore();
    const snap = await db.collection('papers').doc(String(id)).get();
    if (!snap.exists) { res.status(404).json({ error: 'Not found' }); return; }
    const data = snap.data() || {};
    res.json({ summary: data.summary || data.abstract || '' });
  } catch (e) {
    console.error('[get-summary]', e);
    res.status(500).json({ error: 'Failed to get summary' });
  }
};
