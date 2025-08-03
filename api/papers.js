// 文件: api/papers.js
// 这是全新的、用于获取论文列表和排行榜的API

import admin from 'firebase-admin';

// --- Firebase Admin SDK 初始化 ---
try {
  // 从环境变量中解析服务账号密钥
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

  // 检查是否已初始化，防止热重载时重复初始化
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error('Firebase Admin 初始化失败:', error);
}

const db = admin.firestore();

// --- API 主处理函数 ---
export default async (req, res) => {
  try {
    const { limitNum, startAfterId, searchTerm, queryType } = req.query;

    // --- 排行榜逻辑 ---
    if (queryType === 'leaderboards') {
      const recentPromise = db.collection('papers').orderBy('uploadDate', 'desc').limit(5).get();
      const previewPromise = db.collection('papers').orderBy('previewCount', 'desc').limit(5).get();
      const downloadPromise = db.collection('papers').orderBy('downloadCount', 'desc').limit(5).get();

      const [recentSnap, previewSnap, downloadSnap] = await Promise.all([recentPromise, previewPromise, downloadPromise]);

      const format = (snap) => snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return res.status(200).json({
        recent: format(recentSnap),
        popularPreview: format(previewSnap),
        popularDownload: format(downloadSnap),
      });
    }

    // --- 论文列表和搜索逻辑 ---
    let query = db.collection('papers');
    const limit = parseInt(limitNum) || 10;

    // 注意: Firestore 不支持模糊搜索。这里的搜索是一个简化的精确匹配示例。
    // 真正的全文搜索需要使用 Algolia, Typesense 等第三方服务。
    if (searchTerm) {
      // 这是一个非常基础的搜索，可以根据需要扩展
      query = query.where('title', '>=', searchTerm).where('title', '<=', searchTerm + '\uf8ff');
    } else {
      query = query.orderBy('uploadDate', 'desc');
    }

    if (startAfterId) {
      const lastVisibleDoc = await db.collection('papers').doc(startAfterId).get();
      query = query.startAfter(lastVisibleDoc);
    }
    
    const snapshot = await query.limit(limit).get();

    if (snapshot.empty) {
      return res.status(200).json({ papers: [], lastVisibleId: null });
    }

    const papers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // 确保时间戳是可序列化的字符串
      uploadDate: doc.data().uploadDate.toDate().toISOString(), 
    }));

    const lastVisibleId = snapshot.docs[snapshot.docs.length - 1].id;

    res.status(200).json({ papers, lastVisibleId });

  } catch (error) {
    console.error('获取论文列表失败:', error);
    res.status(500).json({ error: '服务器内部错误', details: error.message });
  }
};