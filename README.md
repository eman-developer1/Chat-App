# Full Featured Private Chat App

Telegram-style UI + WhatsApp-like features.

## Features

- Email + Username register / login
- Search users by username
- Real-time private messaging (Socket.IO)
- Message ticks: ✓ sent, ✓✓ delivered, blue ✓✓ seen
- Send photos & files
- Delete message (for me / for everyone)
- Profile: bio + avatar (backend ready)
- Block user (backend ready)
- Voice + Video call signaling (WebRTC ready on backend)
- Online status + typing indicator

## How to Run

1. Start MongoDB: `mongod`
2. Backend:
   ```bash
   cd backend
   npm install
   npm start
   ```
3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Open http://localhost:3000

## Notes

- Uploads are saved in backend/uploads
- For production, change JWT_SECRET and use proper file storage
