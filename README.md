# HDFC Bank Statement Analyzer

A full-stack web application that automatically parses HDFC bank statement PDFs, extracts transaction data, categorizes it, and provides a rich interactive dashboard alongside downloadable Excel reports.

## Features

- **PDF Parsing:** Extracts account details and transaction history directly from HDFC bank statement PDFs using `pdfplumber` and Regex.
- **Transaction Categorization:** Automatically categorizes transactions (e.g., UPI, IMPS, NEFT, Salary, ATM, EMI, Food, etc.) based on transaction descriptions.
- **Excel Report Generation:** Generates a comprehensive 3-sheet Excel report:
  - **Account Level Details:** Account information and summary metrics.
  - **Ledger:** Complete transaction history with running balances and categories.
  - **Analytics:** Category-wise breakdown, monthly trends, top 5 largest transactions, and insights like salary/EMI detection.
- **Interactive Dashboard:** A premium, dark-mode glassmorphic React frontend that visualizes the extracted data, showing:
  - Account Details and Balances
  - Expense/Income summary by category
  - Transaction Ledger Table
  - Analytical insights
- **One-Click Download:** Download the parsed Excel report directly from the dashboard.

## Tech Stack

### Frontend (Client)
- **Framework:** React + Vite
- **Styling:** Custom CSS with dark mode and glassmorphism UI
- **Icons:** Lucide React

### Backend (Server)
- **Framework:** Flask (Python)
- **PDF Extraction:** `pdfplumber`
- **Data Manipulation:** `pandas`
- **Excel Generation:** `openpyxl`
- **CORS:** `flask-cors`

## Project Structure

```
.
├── client/                 # React Frontend
│   ├── src/
│   │   ├── components/     # React UI components (Dashboard, etc.)
│   │   ├── App.jsx         # Main application logic
│   │   ├── index.css       # Global styles (Glassmorphism design system)
│   │   └── ...
│   ├── package.json        # Frontend dependencies
│   └── vite.config.js      # Vite configuration
└── server/                 # Flask Backend
    ├── shii.py             # Main Flask application and API endpoints
    ├── requirements.txt    # Python dependencies
    └── .venv/              # Python virtual environment (ignored in git)
```

## Setup & Installation

### Prerequisites
- Node.js (v16+)
- Python (v3.8+)

### 1. Backend Setup (Flask)
Navigate to the `server` directory, set up the virtual environment, and run the server.

```bash
cd server
python -m venv .venv

# Activate virtual environment
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python shii.py
```
The server will run on `http://localhost:5000`.

### 2. Frontend Setup (React)
Open a new terminal, navigate to the `client` directory, install dependencies, and start the development server.

```bash
cd client
npm install

# Run the Vite dev server
npm run dev
```
The frontend will be accessible at `http://localhost:5173` (or the port Vite provides).

## API Endpoints

### `POST /api/upload`
Accepts a `multipart/form-data` request with a `file` field containing the PDF.
Returns a JSON object with:
- `status`: "success"
- `data`: Extracted transaction data, account details, and analytics ready for the frontend.
- `excel_b64`: Base64 encoded string of the generated Excel report.

## Important Notes for Production

- **Debug Mode:** The backend is currently running with `app.run(debug=True)`. For production deployment (e.g., Render, Heroku), remove `debug=True` and use a production WSGI server like `gunicorn` or `waitress` (Windows).
- **Virtual Environment:** The `.venv` folder is strictly for local development and should be ignored by version control. It does not cause problems in production as deployment platforms manage their own environments based on `requirements.txt`.
- **Environment Variables:** For production, ensure CORS origins are restricted to your actual frontend domain instead of `*`. Ensure your frontend API calls point to the production backend URL instead of `http://localhost:5000`.

## Deployment Guide

### Vercel (Frontend)
1. Push your code to GitHub.
2. Import the project in Vercel.
3. Set the **Framework Preset** to Vite.
4. Set the **Root Directory** to `client`.
5. Deploy!

### Render / Railway (Backend)
Flask APIs are best deployed to Render, Railway, or Heroku.
1. Create a new Web Service and point it to your repository.
2. Set the **Root Directory** to `server`.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn shii:app` (Make sure to add `gunicorn` to `requirements.txt` first).
