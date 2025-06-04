const ftp = require('basic-ftp');
const dbService = require('./dbService');
const logger = require('../utils/logger');

const DEFAULT_FTP_TIMEOUT = 60000; // 60 seconds

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
    const config = customConfig || await this.getFtpConfig();
    const timeout = config.timeout || DEFAULT_FTP_TIMEOUT;
    const client = new ftp.Client(timeout);
    try {
      await client.access(config);
      logger.info(`FTP: Listing files in ${remotePath}`);
      return await client.list(remotePath);
    } catch (err) {
      logger.error('FTP Error listing files:', err);
      throw err;
    } finally {
      client.close();
    }
  }

  async downloadFile(remotePath, localPath, customConfig = null) {
    const config = customConfig || await this.getFtpConfig();
    const timeout = config.timeout || DEFAULT_FTP_TIMEOUT;
    const client = new ftp.Client(timeout);
    try {
      await client.access(config);
      logger.info(`FTP: Downloading ${remotePath} to ${localPath}`);
      await client.downloadTo(localPath, remotePath);
      logger.info(`FTP: File downloaded successfully to ${localPath}`);
    } catch (err) {
      logger.error('FTP Error downloading file:', err);
      throw err;
    } finally {
      client.close();
    }
  }

  async uploadFile(localPath, remotePath, customConfig = null) {
    const config = customConfig || await this.getFtpConfig();
    const timeout = config.timeout || DEFAULT_FTP_TIMEOUT;
    const client = new ftp.Client(timeout);
    try {
      await client.access(config);
      logger.info(`FTP: Uploading ${localPath} to ${remotePath}`);
      await client.uploadFrom(localPath, remotePath);
      logger.info(`FTP: File uploaded successfully to ${remotePath}`);
    } catch (err) {
      logger.error('FTP Error uploading file:', err);
      throw err;
    } finally {
      client.close();
    }
  }
}

module.exports = new FtpService(); 