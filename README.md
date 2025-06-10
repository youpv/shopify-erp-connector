# Shopify ERP Connector

A modern, scalable backend service for synchronizing products between custom ERP systems and Shopify using asynchronous processing and PostgreSQL storage.

## Features

- ✅ **PostgreSQL Database Integration** - Stable product tracking and configuration storage
- ✅ **Automatic Scheduling** - Sync products based on configurable schedules (hourly, daily, etc.)
- ✅ **FTP Integration** - Fetch product data from FTP servers with credentials stored in DB
- ✅ **Smart Product Operations**:
  - **Create** - New products not in Shopify
  - **Update** - Existing products (matched by SKU)
  - **Delete** - Products removed from ERP
- ✅ **Bulk Operations** - Efficient processing using Shopify GraphQL bulk operations
- ✅ **Async Processing** - BullMQ queue for scalable background jobs
- ✅ **Modern ES2025** - Uses latest JavaScript features and modules
- ✅ **Comprehensive Logging** - Track all sync operations and results

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   FTP/API   │────▶│  PostgreSQL  │────▶│   BullMQ    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │                     │
                            ▼                     ▼
                    ┌──────────────┐     ┌─────────────┐
                    │  Scheduler   │     │   Worker    │
                    └──────────────┘     └─────────────┘
                                                 │
                                                 ▼
                                         ┌─────────────┐
                                         │   Shopify   │
                                         │   GraphQL   │
                                         └─────────────┘
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
```env
PORT=3000
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://localhost:6379
SHOPIFY_SHOP=your-shop.myshopify.com
SHOPIFY_API_VERSION=2023-10
SHOPIFY_ACCESS_TOKEN=your-access-token
```

4. Setup database:
```bash
npm run setup-db
```

## API Endpoints

### Configuration Management

- `GET /configs` - List all sync configurations
- `GET /configs/:id` - Get specific configuration
- `POST /configs` - Create new configuration
- `PUT /configs/:id` - Update configuration
- `DELETE /configs/:id` - Delete configuration

### Sync Operations

- `POST /sync/:id` - Trigger manual sync for configuration
- `GET /configs/:id/logs` - Get sync logs for configuration
- `GET /logs` - Get all recent sync logs
- `GET /sync/status` - Get sync status overview

### Health Check

- `GET /health` - Service health check

## Configuration Schema

```json
{
  "id": "unique-config-id",
  "name": "My ERP Sync",
  "connection_type": "ftp",
  "credentials": {
    "host": "ftp.example.com",
    "username": "user",
    "password": "pass",
    "filePath": "/data/products.json"
  },
  "mapping": {
    "title": "productName",
    "description": "productDescription",
    "variant.price": "price",
    "variant.sku": "SKU"
  },
  "metafield_mappings": [
    {
      "sourceKey": "customField",
      "metafieldNamespace": "custom",
      "metafieldKey": "field",
      "metafieldType": "single_line_text_field"
    }
  ],
  "sync_frequency": "24" // hours
}
```

## How It Works

1. **Scheduler** monitors configurations and triggers syncs based on `sync_frequency`
2. **Worker** processes sync jobs from the queue:
   - Fetches product data from FTP/API
   - Compares with existing Shopify products (by SKU)
   - Categorizes into create/update/delete operations
   - Executes operations using bulk GraphQL when possible
   - Updates PostgreSQL tracking
   - Logs results

3. **Product Matching**:
   - Products are matched by SKU
   - New products (no matching SKU in Shopify) are created
   - Existing products are updated
   - Products in DB but not in ERP data are deleted

## Database Schema

- `product_sync_configs` - Sync configurations
- `sync_logs` - Operation logs and results
- `products` - Product tracking (SKUs, Shopify IDs)
- `ftp_config` - Default FTP configuration

## Running the Service

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## Monitoring

The service provides comprehensive logging:
- Console output with colored status messages
- Database logs for all sync operations
- Error tracking with detailed messages

## Scaling

The service is designed to be stateless and scalable:
- Multiple workers can process the same queue
- Redis handles job distribution
- PostgreSQL ensures data consistency
- Bulk operations minimize API calls
