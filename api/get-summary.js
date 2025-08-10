// api/get-summary.js
// 基于 Firestore 元数据生成结构化提要；无需外部大模型即可工作

import admin from 'firebase-admin';

/** 初始化 Firebase Admin（支持三种凭证来源） */
async function initFirebase() {
  if (admin.apps && admin.apps.length) return admin;
  let credential = null;

  // 1) 单环境变量包含的服务账号 JSON
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  // 2) 常见的三段式环境变量
  if (!credential && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  // 3) 本地文件（开发环境）
  if (!credential) {
    try {
      const sa = (await import('../serviceAccountKey.json', { assert: { type: 'json' } })).default;
      credential = admin.credential.cert(sa);
    } catch (_) {
      // ignore
    }
  }

  if (!credential) {
    throw new Error('Firebase Admin 凭证未配置');
  }

  admin.initializeApp({ credential });
  return admin;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: '仅支持 GET 请求' });

  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少参数 id' });

    const adminSDK = await initFirebase();
    const db = adminSDK.firestore();

    const snap = await db.collection('papers').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: '未找到对应论文' });

    const data = snap.data() || {};
    const title = data.title || '未命名论文';
    const authors = Array.isArray(data.authors) ? data.authors.join(', ') : (data.authors || '');
    const keywords = Array.isArray(data.keywords) ? data.keywords.filter(Boolean).slice(0, 8) : [];
    const year = data.uploadDate && data.uploadDate.seconds ? new Date(data.uploadDate.seconds * 1000).getFullYear() : '';

    const lines = [];
    lines.push(`《${title}》${year ? `（${year}）` : ''}`);
    if (authors) lines.push(`作者：${authors}`);
    if (keywords.length) lines.push(`关键词：${keywords.join('、')}`);
    lines.push('');
    lines.push('要点速览：');
    lines.push('• 研究主题：围绕上述关键词提炼的核心议题。');
    lines.push('• 研究方法：如实证/比较/案例/规范分析等（待读者核对原文）。');
    lines.push('• 主要结论：作者提出的关键观点与政策含义。');
    lines.push('• 创新与贡献：相较既有研究的差异与增量。');
    lines.push('• 局限与下一步：样本、数据或外推性的限制与改进方向。');
    lines.push('');
    lines.push('提示：此为基于元数据自动生成的结构化提要，用于快速浏览；如需精准摘要，请下载全文阅读。');

    res.status(200).json({ summary: lines.join('\\n') });
  } catch (error) {
    console.error('API执行错误:', error);
    res.status(500).json({
      error: '服务暂时不可用',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
