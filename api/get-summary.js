// /api/get-summary.js
const admin = require('firebase-admin');

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

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const db = initAdmin().firestore();
    const snap = await db.collection('papers').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found' });
    const data = snap.data() || {};
    // 优先使用你文档里的 summary 字段
    res.json({ summary: data.summary || data.abstract || '' });
  } catch (e) {
    console.error('[get-summary]', e);
    res.status(500).json({ error: 'Failed to get summary' });
  }
};
