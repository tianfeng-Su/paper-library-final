// api/get-summary.js
// 简化版本：先解决基本功能，不依赖复杂的AI服务

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

    console.log('收到总结请求，论文ID:', id);

    // 暂时返回一个通用总结，确保基本功能正常
    const summary = `
【AI总结功能说明】

此功能正在开发完善中。目前返回的是测试总结内容。

论文ID: ${id}

这是一篇学术论文的AI总结示例。真正的AI总结功能需要：
1. 从OSS下载PDF文件
2. 解析PDF文本内容  
3. 调用AI服务生成摘要
4. 缓存结果到数据库

当前状态：基础框架已完成，AI集成正在调试中。

如果你看到这个消息，说明API连接正常，可以继续完善AI功能。
    `.trim();

    res.status(200).json({ 
      summary,
      timestamp: new Date().toISOString(),
      paperId: id
    });

  } catch (error) {
    console.error('API执行错误:', error);
    res.status(500).json({ 
      error: '服务暂时不可用',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
