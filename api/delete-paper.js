// 文件: api/delete-paper.js
// 全新的后端删除API

import admin from 'firebase-admin';
import OSS from 'ali-oss';

// --- 初始化 Firebase Admin SDK (代码与 papers.js 中相同) ---
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (error) { console.error('Firebase Admin 初始化失败:', error); }

const db = admin.firestore();

// --- 初始化 OSS Client (代码与 upload.js 中类似) ---
const client = new OSS({
  endpoint: `oss-cn-hongkong.aliyuncs.com`,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});


// --- API 主处理函数 ---
export default async (req, res) => {
  // 1. 只允许 DELETE 请求
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: '仅支持 DELETE 请求' });
  }

  try {
    // 2. 验证管理员身份 (安全 crucial)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权：缺少Token' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    await admin.auth().verifyIdToken(idToken); // 如果token无效，这里会抛出错误

    // 3. 获取要删除的数据
    const { id, fileName } = req.body;
    if (!id || !fileName) {
      return res.status(400).json({ error: '缺少必需的参数: id 和 fileName' });
    }

    // 4. 并发执行删除操作
    const deleteFromOssPromise = client.delete(fileName);
    const deleteFromFirestorePromise = db.collection('papers').doc(id).delete();

    await Promise.all([deleteFromOssPromise, deleteFromFirestorePromise]);

    res.status(200).json({ message: '论文删除成功' });

  } catch (error) {
    console.error('删除论文失败:', error);
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return res.status(403).json({ error: '认证失败，请重新登录' });
    }
    res.status(500).json({ error: '服务器内部错误', details: error.message });
  }
};