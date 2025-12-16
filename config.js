// config.js - Configuration settings

module.exports = {
  // Server Configuration
  port: 8080,
  
  // QuickBooks Web Connector Credentials
  username: 'qbuser',
  password: 'qbpass',
  
  // QuickBooks Settings
  companyFile: '', // Leave empty to use currently open company file
  
  // Application Information
  appName: 'QB Data Sync',
  appDescription: 'QuickBooks Data Synchronization Service',
  appSupport: 'https://infinitecapi.online/support',
  
  // IMPORTANT: Change this to your actual VPS IP or domain
  // Examples:
  // serverURL: 'http://192.168.1.100:8080'           // Local network
  // serverURL: 'http://123.45.67.89:8080'            // Public IP  
  // serverURL: 'https://api.yourcompany.com:8080'    // Domain with HTTPS
  serverURL: 'https://infinitecapi.online',
  
  // Scheduler Settings (for QWC file)
  scheduler: {
    runEveryMinutes: 30,
    allowConcurrentRuns: false
  }
};