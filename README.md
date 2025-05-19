# Shopify ERP Connector

This application serves as a connector between custom ERP systems and the Shopify GraphQL Admin API.

## Prerequisites

* Node.js (v18+ recommended)
* npm
* Access to a PostgreSQL database
* Shopify Partner account and a development/custom app with API credentials
* FTP server access details (if applicable for ERP integration)

## Setup

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd shopify-erp-connector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   * Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   * Edit the `.env` file and fill in your specific credentials and configurations for Shopify, PostgreSQL, and FTP.

## Running the Application

* **Development Mode (with auto-restart):**
  ```bash
  npm run dev
  ```

* **Production Mode:**
  ```bash
  npm start
  ```

The server will typically start on port 3000 (or the port specified in your `.env` file).

## API Endpoints

* **POST /api/products/sync**: Initiates the product synchronization process (currently a placeholder). 