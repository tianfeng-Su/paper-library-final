// 文件: api/get-summary.js  
// 修复版本：添加错误处理和缓存机制

import admin from 'firebase-admin';
import OSS from 'ali-oss';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdf from 'pdf-parse';

// 初始化 Firebase Admin
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error('Firebase Admin 初始化失败:', error);
}

const db = admin.firestore();

// 初始化 OSS Client
const ossClient = new OSS({
  endpoint: `oss-cn-hongkong.aliyuncs.com`,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET 请求' });
  }

  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: '缺少论文ID参数' });
    }

    // 首先从数据库获取论文信息
    const paperDoc = await db.collection('papers').doc(id).get();
    
    if (!paperDoc.exists) {
      return res.status(404).json({ error: '论文不存在' });
    }

    const paperData = paperDoc.data();
    
    // 检查是否已有缓存的总结
    if (paperData.summary && paperData.summary.trim().length > 50) {
      console.log('返回缓存的总结');
      return res.status(200).json({ summary: paperData.summary });
    }

    console.log('开始生成新的AI总结...');
    
    // 获取文件名
    const fileName = paperData.uniquePath || paperData.fileName;
    if (!fileName) {
      return res.status(400).json({ error: '论文文件路径不存在' });
    }

    console.log('正在从OSS下载文件:', fileName);
    
    // 从OSS获取文件
    const result = await ossClient.get(fileName);
    if (!result || !result.content) {
      throw new Error('无法从OSS获取文件内容');
    }

    console.log('文件下载成功，开始解析PDF...');
    
    // 解析PDF
    const pdfBuffer = result.content;
    const data = await pdf(pdfBuffer);
    const paperText = data.text;

    if (!paperText || paperText.trim().length < 100) {
      throw new Error('PDF文本内容过少或无法提取，可能是扫描版PDF');
    }

    console.log(`PDF解析成功，文本长度: ${paperText.length} 字符`);

    // 使用Gemini生成总结
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    
    // 截取前8000字符以避免超出API限制
    const truncatedText = paperText.substring(0, 8000);
    
    const prompt = `请将以下学术论文内容总结为一段300-500字的中文摘要。要求：
1. 风格专业、客观
2. 清晰概括核心论点
3. 说明关键方法或技术
4. 总结主要结论
5. 使用学术语言

论文内容：
${truncatedText}`;

    console.log('正在调用Gemini API生成总结...');
    
    const generationResult = await model.generateContent(prompt);
    const response = await generationResult.response;
    const summary = response.text().trim();

    if (!summary || summary.length < 50) {
      throw new Error('AI生成的总结过短或为空');
    }

    console.log('AI总结生成成功，正在保存到数据库...');

    // 将总结保存到数据库以供后续使用
    await db.collection('papers').doc(id).update({
      summary: summary,
      summaryGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('总结已保存到数据库');

    res.status(200).json({ summary });

  } catch (error) {
    console.error('生成AI总结时出错:', error);
    
    // 根据错误类型返回更具体的错误信息
    let errorMessage = '生成总结失败';
    
    if (error.message.includes('无法从OSS获取文件')) {
      errorMessage = '文件不存在或无法访问';
    } else if (error.message.includes('PDF文本内容过少')) {
      errorMessage = '无法提取PDF文本内容，可能是图片扫描版';
    } else if (error.message.includes('API')) {
      errorMessage = 'AI服务暂时不可用，请稍后重试';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '网络连接失败';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
