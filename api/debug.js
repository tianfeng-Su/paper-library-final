// api/debug.js
export default function handler(req, res) {
  const envCheck = {
    NODE_VERSION: process.version,
    ALIYUN_ACCESS_KEY_ID: !!process.env.ALIYUN_ACCESS_KEY_ID,
    ALIYUN_ACCESS_KEY_SECRET: !!process.env.ALIYUN_ACCESS_KEY_SECRET, 
    ALIYUN_OSS_BUCKET: !!process.env.ALIYUN_OSS_BUCKET,
    FIREBASE_SERVICE_ACCOUNT_KEY: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  };
  
  res.status(200).json(envCheck);
}
