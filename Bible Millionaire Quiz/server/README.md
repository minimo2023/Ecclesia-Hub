# Bible Quiz Backend Server

Node.js + Express + SQLite backend for Bible Quiz on Synology NAS (No Docker required).

## Installation on NAS

### 1. Install Node.js on Synology
1. Open **Package Center** on your NAS.
2. Search for **Node.js v18** or **v20** and install it.

### 2. Upload Backend Files
1. Use **File Station** to create a folder: `/volume1/web/bible-quiz-server`
2. Upload the entire `server` folder contents to this location.

### 3. Install Dependencies
SSH into your NAS:
```bash
ssh admin@your-nas-ip
cd /volume1/web/bible-quiz-server
npm install
```

### 4. Start the Server

#### Option A: Manual Start (for testing)
```bash
node index.js
```

#### Option B: Background Process (recommended)
```bash
nohup node index.js > server.log 2>&1 &
```

To check if it's running:
```bash
ps aux | grep node
```

To stop it:
```bash
pkill -f "node index.js"
```

### 5. Verify Server is Running
Open browser and visit: `http://NAS_IP:3000/health`

You should see: `{"status":"ok","timestamp":"..."}`

## Environment Variables

Create a `.env` file in the server directory (optional):
```env
PORT=3000
```

## API Endpoints

All endpoints follow REST pattern:

- `POST /api/:collection/:docId` - Save document
- `POST /api/:collection` - Add document (auto-ID)
- `GET /api/:collection/:docId` - Get document
- `GET /api/:collection` - Query documents
- `GET /api/:collection/_count` - Count documents
- `DELETE /api/:collection/:docId` - Delete document
- `POST /api/:collection/_batch` - Batch save

## Database Location

SQLite database file: `/volume1/web/bible-quiz-server/bible_quiz.db`

## Troubleshooting

**Server won't start:**
- Check if port 3000 is already in use: `netstat -tuln | grep 3000`
- Check logs: `tail -f server.log`

**Permission errors:**
- Ensure the server directory has correct permissions:
  ```bash
  chmod +x index.js
  chmod 755 /volume1/web/bible-quiz-server
  ```

**Database locked:**
- Only one process can write to SQLite at a time.
- Make sure multiple server instances aren't running.
