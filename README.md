# KickStar 👟🇨🇦

Canada's sneaker price comparison platform. Compare prices across 10+ verified resellers to find the best deals on sneakers.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Express + Node.js
- **Styling**: Tailwind CSS + Framer Motion
- **Database**: MongoDB (optional, for 1-minute caching)
- **Scrapers**: Cheerio + Axios

## Features

- 🔍 Search across 10+ verified resellers simultaneously
- 💰 All prices in CAD for easy comparison
- 🛡️ Only verified/authenticated sellers (no scammers)
- 🇨🇦 Focus on Canadian sneaker community
- ⚡ Fast 1-minute caching with MongoDB
- 📱 Beautiful, responsive UI

## Verified Sources

**Global Platforms:**
- StockX (authenticated)
- GOAT (authenticated)
- Flight Club (authenticated)
- Stadium Goods (authenticated)
- Grailed (verified)

**Canadian Retailers:**
- Livestock (Deadstock.ca) 🇨🇦
- Haven 🇨🇦
- Capsule Toronto 🇨🇦
- Exclucity 🇨🇦
- NRML 🇨🇦

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- MongoDB (optional, for caching)

### Installation

```bash
# Clone the repo
git clone https://github.com/gigabite-pro/kickstar.git
cd kickstar

# Install dependencies
npm install

# Create environment file (optional, for MongoDB)
cp .env.example .env
# Edit .env with your MongoDB credentials

# Start development servers
npm run dev
```

This runs:
- Frontend at http://localhost:5173
- Backend at http://localhost:3001

### Environment Variables

Create a `.env` file with:

```
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=kickstar
```

MongoDB is optional - the app works without it, but caching will be disabled.

## Project Structure

```
kickstar/
├── src/                  # Frontend (React + Vite)
│   ├── components/       # React components
│   ├── pages/           # Page components
│   ├── types.ts         # TypeScript types
│   └── main.tsx         # Entry point
├── server/              # Backend (Express)
│   ├── scrapers/        # Web scrapers
│   ├── db/              # MongoDB connection
│   └── index.ts         # Express server
└── package.json
```

## Scripts

```bash
npm run dev          # Start both frontend and backend
npm run dev:frontend # Start only Vite frontend
npm run dev:backend  # Start only Express backend
npm run build        # Build for production
npm run preview      # Preview production build
```

## License

MIT
