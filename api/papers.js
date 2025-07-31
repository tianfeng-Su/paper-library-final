// /api/papers.js

import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (e) {
    console.error('Firebase Admin Initialization Error', e);
  }
}

const db = admin.firestore();

// Helper function to serialize Firestore documents
const serializeDoc = (doc) => {
    const data = doc.data();
    if (data.uploadDate && typeof data.uploadDate.toDate === 'function') {
        data.uploadDate = data.uploadDate.toDate().toISOString();
    }
    return { id: doc.id, ...data };
};

// Main handler for Vercel Serverless Function
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { queryType, searchTerm, orderByField = 'uploadDate', order = 'desc', limitNum = '10', startAfterId } = req.query;

    // --- Route based on queryType ---

    if (queryType === 'leaderboards') {
        const recentQuery = db.collection("papers").orderBy("uploadDate", "desc").limit(5);
        const popularPreviewQuery = db.collection("papers").orderBy("previewCount", "desc").limit(5);
        const popularDownloadQuery = db.collection("papers").orderBy("downloadCount", "desc").limit(5);

        const [recentSnapshot, previewSnapshot, downloadSnapshot] = await Promise.all([
            recentQuery.get(),
            popularPreviewQuery.get(),
            popularDownloadQuery.get()
        ]);

        const leaderboards = {
            recent: recentSnapshot.docs.map(serializeDoc),
            popularPreview: previewSnapshot.docs.map(serializeDoc),
            popularDownload: downloadSnapshot.docs.map(serializeDoc),
        };
        return res.status(200).json(leaderboards);
    }

    // --- Default behavior: fetch paper list (with search and pagination) ---

    let q = db.collection("papers");

    if (searchTerm) {
        // Basic search implementation
        q = q.where('title', '>=', searchTerm).where('title', '<=', searchTerm + '\uf8ff').limit(20);
    } else {
        // Pagination implementation
        q = q.orderBy(orderByField, order).limit(parseInt(limitNum, 10));
        if (startAfterId) {
            const lastVisibleDoc = await db.collection('papers').doc(startAfterId).get();
            if (lastVisibleDoc.exists) {
                q = q.startAfter(lastVisibleDoc);
            }
        }
    }
    
    const snapshot = await q.get();

    const papers = snapshot.docs.map(serializeDoc);
    const lastVisibleId = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1]?.id : null;

    res.status(200).json({ papers, lastVisibleId });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Firestore.' });
  }
}