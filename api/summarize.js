// /api/summarize.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OSS = require('ali-oss');
const pdf = require('pdf-parse');

const ossClient = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET,
  secure: true,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const fileName = req.query.fileName;
    if (!fileName) {
      return res.status(400).json({ error: '缺少文件名参数 (fileName)' });
    }

    const result = await ossClient.get(fileName);
    if (!result || !result.content) {
      throw new Error('无法从OSS获取文件');
    }
    const pdfBuffer = result.content;

    const data = await pdf(pdfBuffer);
    const paperText = data.text;

    if (!paperText || paperText.trim().length < 100) {
        throw new Error('PDF文本内容过少或无法提取');
    }

    // 【关键改动】更新为最新的模型名称
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});
    const prompt = `请将以下学术论文内容，总结为一段300-500字的中文摘要，风格要专业、客观。需要清晰地概括出论文的核心论点、使用了什么关键方法或技术，以及得出了哪些主要结论。论文内容如下：\n\n${paperText}`;

    const generationResult = await model.generateContent(prompt);
    const response = await generationResult.response;
    const summary = response.text();

    res.status(200).json({ summary });

  } catch (error) {
    console.error('AI总结功能出错:', error);
    res.status(500).json({ error: '生成总结失败: ' + error.message });
  }
}