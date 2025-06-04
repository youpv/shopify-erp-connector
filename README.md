# Shopify ERP Connector (Async Rewrite)

This rewrite provides a minimal stateless backend for syncing products between a custom ERP and Shopify using modern asynchronous queues and PostgreSQL storage.

## Features

- **ES modules (Node.js)**
- **BullMQ** queue backed by Redis for scalable task processing
- **PostgreSQL** for configuration and log storage
- **Shopify GraphQL bulk operations** for efficient product updates

## Setup

1. Install dependencies
   ```bash
   npm install
   ```
2. Create a `.env` file based on `.env.example` and fill in database, Redis and Shopify credentials.
3. Start the server
   ```bash
   npm start
   ```

### API Endpoints

- `POST /sync/:id` – queue a product sync job for the configuration ID.
- `GET /configs` – list product sync configurations.
- `POST /configs` – create a configuration.
- `GET /configs/:id` – get a configuration.
- `PUT /configs/:id` – update a configuration.
- `DELETE /configs/:id` – remove a configuration.

A worker is started in the same process to process queued jobs.
