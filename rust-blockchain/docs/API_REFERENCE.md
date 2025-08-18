# API Reference

This document provides a comprehensive reference for the Rust Blockchain REST API.

## Base URL

```
http://localhost:8080/api/v1
```

## Authentication

Currently, the API does not require authentication. In a production environment, you would implement proper authentication and authorization.

## Response Format

All API responses follow this standard format:

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

For errors:

```json
{
  "success": false,
  "data": null,
  "error": "Error message description"
}
```

## Endpoints

### Health Check

#### `GET /health`

Returns the health status of the node.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "error": null
}
```

---

### Blockchain Information

#### `GET /chain/info`

Returns general information about the blockchain.

**Response:**
```json
{
  "success": true,
  "data": {
    "height": 12345,
    "difficulty": 16,
    "total_transactions": 54321,
    "total_supply": 2100000000000000,
    "mempool_size": 150,
    "utxo_count": 98765
  },
  "error": null
}
```

---

### Blocks

#### `GET /blocks/latest`

Returns the most recent blocks.

**Query Parameters:**
- `limit` (optional): Number of blocks to return (default: 10, max: 100)
- `offset` (optional): Number of blocks to skip (default: 0)

**Example Request:**
```http
GET /api/v1/blocks/latest?limit=5&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "header": {
        "version": 1,
        "previous_hash": "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
        "merkle_root": "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
        "timestamp": "2024-01-15T10:30:00Z",
        "difficulty": 16,
        "nonce": 2083236893,
        "height": 12345
      },
      "transactions": [
        {
          "id": "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
          "inputs": [...],
          "outputs": [...],
          "lock_time": 0,
          "timestamp": "2024-01-15T10:29:45Z",
          "fee": 1000,
          "signature": null
        }
      ]
    }
  ],
  "error": null
}
```

#### `GET /block/height/{height}`

Returns a specific block by height.

**Path Parameters:**
- `height`: Block height (integer)

**Example Request:**
```http
GET /api/v1/block/height/12345
```

**Response:**
```json
{
  "success": true,
  "data": {
    "header": { ... },
    "transactions": [ ... ]
  },
  "error": null
}
```

#### `GET /block/hash/{hash}`

Returns a specific block by hash.

**Path Parameters:**
- `hash`: Block hash (hex string)

**Example Request:**
```http
GET /api/v1/block/hash/000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f
```

---

### Transactions

#### `POST /transaction`

Submits a new transaction to the network.

**Request Body:**
```json
{
  "id": "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
  "inputs": [
    {
      "previous_output": {
        "txid": "0e3e2357e806b6cdb1f70b54c3a3a17b6714ee1f0e68bebb44a74b1efd512098",
        "vout": 0
      },
      "script_sig": [1, 2, 3, 4],
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "value": 5000000000,
      "script_pubkey": [],
      "address": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
    }
  ],
  "lock_time": 0,
  "timestamp": "2024-01-15T10:30:00Z",
  "fee": 1000,
  "signature": [48, 68, 2, 32, ...]
}
```

**Response:**
```json
{
  "success": true,
  "data": "Transaction submitted",
  "error": null
}
```

#### `GET /mempool`

Returns information about the memory pool.

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_count": 150,
    "transactions": [
      {
        "id": "...",
        "inputs": [...],
        "outputs": [...],
        "fee": 1000
      }
    ]
  },
  "error": null
}
```

---

### Wallets

#### `POST /wallet`

Creates a new wallet.

**Request Body:**
```json
{
  "name": "my-wallet",
  "mnemonic_type": "words12"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "my-wallet",
    "address_count": 1,
    "balance": 0,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "error": null
}
```

#### `POST /wallet/restore`

Restores a wallet from a mnemonic phrase.

**Request Body:**
```json
{
  "name": "restored-wallet",
  "mnemonic": "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  "passphrase": ""
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "restored-wallet",
    "address_count": 1,
    "balance": 0,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "error": null
}
```

#### `GET /wallets`

Lists all wallets.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "my-wallet",
      "address_count": 5,
      "balance": 0,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "error": null
}
```

#### `GET /wallet/{name}/balance`

Gets the balance for a specific wallet.

**Path Parameters:**
- `name`: Wallet name

**Response:**
```json
{
  "success": true,
  "data": {
    "wallet_name": "my-wallet",
    "balance": 5000000000
  },
  "error": null
}
```

#### `POST /wallet/{name}/address`

Generates a new address for the specified wallet.

**Path Parameters:**
- `name`: Wallet name

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
  },
  "error": null
}
```

#### `POST /send`

Sends a transaction from a wallet.

**Request Body:**
```json
{
  "from": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  "to": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "amount": 1000000000,
  "fee": 1000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txid": "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16"
  },
  "error": null
}
```

---

### Mining

#### `POST /mining/start`

Starts mining on the node.

**Request Body:**
```json
{
  "miner_address": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  "thread_count": 4
}
```

**Response:**
```json
{
  "success": true,
  "data": "Mining started",
  "error": null
}
```

#### `POST /mining/stop`

Stops mining on the node.

**Response:**
```json
{
  "success": true,
  "data": "Mining stopped",
  "error": null
}
```

#### `GET /mining/stats`

Returns mining statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "hash_rate": 1234567.89,
    "blocks_mined": 42,
    "total_hashes": 9876543210,
    "mining_time": {
      "secs": 3600,
      "nanos": 0
    },
    "current_difficulty": 16,
    "last_block_time": "2024-01-15T10:25:00Z"
  },
  "error": null
}
```

---

### Smart Contracts

#### `POST /contract/deploy`

Deploys a new smart contract.

**Request Body:**
```json
{
  "code": "0061736d0100000001070160027f7f017f030201000707010373756d00000a09010700200020016a0b",
  "deployer": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  "gas_limit": 1000000,
  "value": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contract_address": "contract_1234567890abcdef"
  },
  "error": null
}
```

#### `POST /contract/call`

Calls a smart contract function.

**Request Body:**
```json
{
  "contract_address": "contract_1234567890abcdef",
  "caller": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  "function_name": "transfer",
  "gas_limit": 100000,
  "value": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "gas_used": 21000,
    "return_data": "0x01",
    "logs": [],
    "error": null,
    "state_changes": []
  },
  "error": null
}
```

#### `GET /contract/{address}`

Gets information about a smart contract.

**Path Parameters:**
- `address`: Contract address

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "contract_1234567890abcdef",
    "code": "0061736d0100000001070160027f7f017f030201000707010373756d00000a09010700200020016a0b",
    "state": {
      "storage": {},
      "balance": 0,
      "nonce": 0
    },
    "owner": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    "created_at": "2024-01-15T10:30:00Z",
    "gas_used": 21000
  },
  "error": null
}
```

---

### Utilities

#### `GET /fee/estimate`

Estimates transaction fees.

**Query Parameters:**
- `target_blocks` (optional): Target confirmation time in blocks (default: 6)

**Example Request:**
```http
GET /api/v1/fee/estimate?target_blocks=6
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fee_per_byte": 10,
    "target_blocks": 6
  },
  "error": null
}
```

---

## Error Codes

The API uses standard HTTP status codes:

- `200 OK` - Successful request
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default**: 100 requests per minute per IP
- **Mining endpoints**: 10 requests per minute per IP
- **Wallet creation**: 5 requests per minute per IP

## WebSocket Support

For real-time updates, the API supports WebSocket connections:

```
ws://localhost:8080/ws
```

### WebSocket Events

#### Subscribe to new blocks:
```json
{
  "type": "subscribe",
  "channel": "blocks"
}
```

#### Subscribe to new transactions:
```json
{
  "type": "subscribe",
  "channel": "transactions"
}
```

#### New block notification:
```json
{
  "type": "block",
  "data": {
    "height": 12346,
    "hash": "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
    "timestamp": "2024-01-15T10:40:00Z"
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:8080/api/v1',
  timeout: 5000
});

// Get blockchain info
async function getChainInfo() {
  try {
    const response = await client.get('/chain/info');
    console.log('Chain height:', response.data.data.height);
  } catch (error) {
    console.error('Error:', error.response.data.error);
  }
}

// Create wallet
async function createWallet(name) {
  try {
    const response = await client.post('/wallet', {
      name: name,
      mnemonic_type: 'words12'
    });
    console.log('Wallet created:', response.data.data);
  } catch (error) {
    console.error('Error:', error.response.data.error);
  }
}
```

### Python

```python
import requests
import json

class BlockchainClient:
    def __init__(self, base_url='http://localhost:8080/api/v1'):
        self.base_url = base_url
    
    def get_chain_info(self):
        response = requests.get(f'{self.base_url}/chain/info')
        return response.json()
    
    def create_wallet(self, name, mnemonic_type='words12'):
        data = {
            'name': name,
            'mnemonic_type': mnemonic_type
        }
        response = requests.post(f'{self.base_url}/wallet', json=data)
        return response.json()
    
    def send_transaction(self, from_addr, to_addr, amount, fee=1000):
        data = {
            'from': from_addr,
            'to': to_addr,
            'amount': amount,
            'fee': fee
        }
        response = requests.post(f'{self.base_url}/send', json=data)
        return response.json()

# Usage
client = BlockchainClient()
info = client.get_chain_info()
print(f"Chain height: {info['data']['height']}")
```

### cURL Examples

#### Get blockchain information:
```bash
curl -X GET http://localhost:8080/api/v1/chain/info
```

#### Create a wallet:
```bash
curl -X POST http://localhost:8080/api/v1/wallet \
  -H "Content-Type: application/json" \
  -d '{"name": "my-wallet", "mnemonic_type": "words12"}'
```

#### Send a transaction:
```bash
curl -X POST http://localhost:8080/api/v1/send \
  -H "Content-Type: application/json" \
  -d '{
    "from": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    "to": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "amount": 1000000000,
    "fee": 1000
  }'
```

## Security Considerations

- Always use HTTPS in production
- Implement proper authentication and authorization
- Validate all input parameters
- Use rate limiting to prevent abuse
- Log all API access for security monitoring
- Never expose private keys through the API