const ftp = require('basic-ftp');
const dbService = require('./dbService');

class FtpService {
  constructor() {
    // FTP config will be fetched from the database when needed
    this.ftpConfig = null;
  }

  async getFtpConfig() {
    if (!this.ftpConfig) {
      // Fetch FTP config from database via dbService
      this.ftpConfig = await dbService.getFtpConfig();
    }
    return this.ftpConfig;
  }

  async listFiles(remotePath = '/', customConfig = null) {
    const client = new ftp.Client();
    try {
      const config = customConfig || await this.getFtpConfig();
      await client.access(config);
      console.log(`FTP: Listing files in ${remotePath}`);
      return await client.list(remotePath);
    } catch (err) {
      console.error('FTP Error listing files:', err);
      throw err;
    } finally {
      client.close();
    }
  }

  async downloadFile(remotePath, localPath, customConfig = null) {
    const client = new ftp.Client();
    try {
      const config = customConfig || await this.getFtpConfig();
      await client.access(config);
      console.log(`FTP: Downloading ${remotePath} to ${localPath}`);
      await client.downloadTo(localPath, remotePath);
      console.log(`FTP: File downloaded successfully to ${localPath}`);
    } catch (err) {
      console.error('FTP Error downloading file:', err);
      throw err;
    } finally {
      client.close();
    }
  }

  async uploadFile(localPath, remotePath, customConfig = null) {
    const client = new ftp.Client();
    try {
      const config = customConfig || await this.getFtpConfig();
      await client.access(config);
      console.log(`FTP: Uploading ${localPath} to ${remotePath}`);
      await client.uploadFrom(localPath, remotePath);
      console.log(`FTP: File uploaded successfully to ${remotePath}`);
    } catch (err) {
      console.error('FTP Error uploading file:', err);
      throw err;
    } finally {
      client.close();
    }
  }
}

module.exports = new FtpService(); 