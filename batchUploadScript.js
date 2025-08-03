// batchUploadScript.js
const fs = require('fs').promises; // 修复：应该是 fs 而不是 fs/promises
const path = require('path');
const admin = require('firebase-admin');
const OSS = require('ali-oss');
const pdf = require('pdf-parse');

// --- 配置区域 ---
const SERVICE_ACCOUNT_KEY_PATH = './serviceAccountKey.json';
const PAPERS_FOLDER_PATH = '/Users/tianfeng_su/Desktop/my paper'; // 确保这个路径存在
const ALIYUN_OSS_CONFIG = {
  region: 'oss-cn-hangzhou',
  accessKeyId: 'LTAI5t9GJu59WxgcSv7vdgTS',
  accessKeySecret: 'Q6W8DsDoVlzTaMcawb94VQT4h8eu8d',
  bucket: 'paper-library-2024',
  secure: true,
};
// -----------------

// 检查必要文件和目录
async function checkRequirements() {
  const checks = [];
  
  // 检查服务账户密钥文件
  try {
    await fs.access(SERVICE_ACCOUNT_KEY_PATH);
    console.log('✅ serviceAccountKey.json 文件存在');
  } catch (error) {
    console.error('❌ serviceAccountKey.json 文件不存在');
    checks.push('serviceAccountKey.json 文件缺失');
  }
  
  // 检查论文文件夹
  try {
    const stats = await fs.stat(PAPERS_FOLDER_PATH);
    if (stats.isDirectory()) {
      console.log('✅ 论文文件夹存在');
    } else {
      console.error('❌ 论文路径不是一个目录');
      checks.push('论文路径不是目录');
    }
  } catch (error) {
    console.error(`❌ 论文文件夹不存在: ${PAPERS_FOLDER_PATH}`);
    console.log('请检查路径是否正确，或创建该目录');
    checks.push('论文文件夹不存在');
  }
  
  return checks;
}

// 初始化服务
async function initializeServices() {
  try {
    // 初始化Firebase Admin
    const serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase 初始化成功');
    
    // 初试化Firestore
    const db = admin.firestore();
    const papersCollection = db.collection('papers');
    
    // 初始化阿里云OSS
    const ossClient = new OSS(ALIYUN_OSS_CONFIG);
    console.log('✅ 阿里云OSS 初始化成功');
    
    return { db, papersCollection, ossClient };
  } catch (error) {
    console.error('❌ 服务初始化失败:', error.message);
    throw error;
  }
}

// 从文件名和内容中提取数据的函数
async function extractPdfData(fileBuffer, fileName) {
  let extractedData = { 
    title: fileName.replace(/\.pdf$/i, ''), 
    authors: '', 
    keywords: '', 
    summary: '' 
  };
  
  // 从文件名提取标题和作者
  let match = fileName.match(/《(.+?)》-([^-]+)/);
  if (match) {
    extractedData.title = match[1];
    extractedData.authors = match[2];
  } else {
    match = fileName.match(/(.+?)[-_]([^-_]+)\.pdf$/i);
    if (match) {
      extractedData.title = match[1];
      extractedData.authors = match[2];
    }
  }
  
  // 尝试从PDF内容提取更多信息
  try {
    const data = await pdf(fileBuffer);
    let fullText = data.text.replace(/\s+/g, ' ').trim();
    
    // 提取关键词
    const keywordsMatch = fullText.match(/(?:关键词|Keywords)\s*[:：]\s*([^\n]+?)(?=\n|摘要|Abstract|Introduction|引言|1\.)/i);
    if (keywordsMatch && keywordsMatch[1]) {
      extractedData.keywords = keywordsMatch[1]
        .split(/[;；,，]/)
        .map(k => k.trim())
        .filter(Boolean)
        .join(', ');
    }
    
    // 提取摘要
    const summaryMatch = fullText.match(/(?:摘要|Abstract)\s*[:：]\s*([^\n]+?)(?=\n|关键词|Keywords|Introduction|引言|1\.)/i);
    if (summaryMatch && summaryMatch[1]) {
      extractedData.summary = summaryMatch[1].trim();
    }
  } catch (e) {
    console.warn(`⚠️  无法解析 ${fileName} 的PDF内容，将仅使用文件名信息`);
  }
  
  return extractedData;
}

// 主处理函数
async function main() {
  console.log('🚀 开始批量上传任务...\n');
  
  // 检查必要条件
  const issues = await checkRequirements();
  if (issues.length > 0) {
    console.error('\n❌ 发现问题，请先解决以下问题:');
    issues.forEach(issue => console.error(`  - ${issue}`));
    return;
  }
  
  // 初始化服务
  let db, papersCollection, ossClient;
  try {
    const services = await initializeServices();
    db = services.db;
    papersCollection = services.papersCollection;
    ossClient = services.ossClient;
  } catch (error) {
    console.error('服务初始化失败，程序退出');
    return;
  }
  
  // 读取PDF文件
  let files;
  try {
    files = await fs.readdir(PAPERS_FOLDER_PATH);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`\n📁 发现 ${pdfFiles.length} 个PDF文件\n`);
    
    if (pdfFiles.length === 0) {
      console.log('没有找到PDF文件，程序退出');
      return;
    }
    
    // 处理每个文件
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < pdfFiles.length; i++) {
      const fileName = pdfFiles[i];
      const filePath = path.join(PAPERS_FOLDER_PATH, fileName);
      const progressStr = `(${i + 1}/${pdfFiles.length})`;
      
      try {
        // 检查文件是否已存在于数据库中
        const existingPaper = await papersCollection
          .where('fileName', '==', fileName)
          .limit(1)
          .get();
          
        if (!existingPaper.empty) {
          console.log(`${progressStr} ⏭️  [跳过] ${fileName} - 已存在于数据库中`);
          skipCount++;
          continue;
        }
        
        console.log(`${progressStr} 🔄 [处理中] ${fileName}...`);
        
        // 1. 读取文件
        const fileBuffer = await fs.readFile(filePath);
        const stats = await fs.stat(filePath);
        
        // 2. 提取元数据
        const metadata = await extractPdfData(fileBuffer, fileName);
        
        // 3. 上传到OSS
        const ossResult = await ossClient.put(fileName, fileBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename*="UTF-8''${encodeURIComponent(fileName)}"`
          }
        });
        
        const fileUrl = `https://${ALIYUN_OSS_CONFIG.bucket}.${ALIYUN_OSS_CONFIG.region}.aliyuncs.com/${encodeURIComponent(fileName)}`;
        
        // 4. 写入Firestore数据库
        const authorsArray = metadata.authors
          ? metadata.authors.split(/[,，]/).map(name => name.trim()).filter(Boolean)
          : [];
          
        const keywordsArray = metadata.keywords
          ? metadata.keywords.split(/[,，]/).map(kw => kw.trim()).filter(Boolean)
          : [];
        
        const newPaper = {
          title: metadata.title,
          authors: authorsArray.length > 0 ? authorsArray : [metadata.title],
          keywords: keywordsArray,
          summary: metadata.summary || '',
          fileUrl,
          fileName,
          fileSize: stats.size,
          fileType: 'PDF',
          uploadDate: admin.firestore.FieldValue.serverTimestamp(),
          previewCount: 0,
          downloadCount: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
        
        await papersCollection.add(newPaper);
        console.log(`${progressStr} ✅ [成功] ${fileName} - 上传完成`);
        successCount++;
        
      } catch (error) {
        console.error(`${progressStr} ❌ [失败] ${fileName} - ${error.message}`);
        errorCount++;
      }
    }
    
    // 输出最终统计
    console.log('\n📊 处理完成！统计结果:');
    console.log(`  📁 总文件数: ${pdfFiles.length}`);
    console.log(`  ✅ 成功上传: ${successCount}`);
    console.log(`  ⏭️  跳过文件: ${skipCount}`);
    console.log(`  ❌ 失败文件: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ 读取文件夹失败:', error.message);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('程序执行出错:', error);
    process.exit(1);
  });
}