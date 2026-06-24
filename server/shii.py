import os
import re
import io
import pandas as pd
import pdfplumber
from flask import Flask, request, send_file
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = "correm_assignment_secret"

# Configure CORS dynamically based on environment configuration
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
if allowed_origins != "*":
    allowed_origins = [orig.strip() for orig in allowed_origins.split(",")]

CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

# --- STRICT COMPLIANT CLASSIFICATION DICTIONARY ---
CATEGORIES = {
    "Salary": ["SALARY", "SAL", "PAYROLL", "STIPEND", "WAGES", "NEFT CR SALARY"],
    "EMI/Loan": ["EMI", "LOAN", "HDFC LOAN", "BAJAJ FIN", "NACH DR", "ECS DR", "REPAY", "POONAWALLA", "UGRO CAPITAL", "CHOLAMANDALAM", "FEDBANKFIN"],
    "Food & Dining": ["SWIGGY", "ZOMATO", "RESTAURANT", "CAFE", "DOMINOS", "MCDONALD", "HOTEL", "KFC", "STARBUCKS"],
    "Travel": ["IRCTC", "UBER", "OLA", "RAPIDO", "IXIGO", "MAKEMYTRIP", "REDBUS", "PETROL", "FUEL", "INDIANOIL", "BHARAT PETROLEUM", "HPCL", "FASTAG"],
    "Shopping": ["AMAZON", "FLIPKART", "MYNTRA", "AJIO", "MEESHO", "NYKAA", "RETAIL", "BIGBASKET", "BLINKIT", "DMART"],
    "Utilities": ["ELECTRICITY", "BESCOM", "MSEB", "BSES", "TATA POWER", "GAS", "WATER BILL", "BILL DESK", "BILLPAY"],
    "Telecom": ["AIRTEL", "JIO", "VODAFONE", "BSNL", "RECHARGE", "POSTPAID", "BROADBAND"],
    "Entertainment": ["NETFLIX", "HOTSTAR", "AMAZON PRIME", "SPOTIFY", "BOOKMYSHOW", "ZEE5"],
    "Healthcare": ["PHARMACY", "APOLLO", "MEDPLUS", "HOSPITAL", "CLINIC", "DIAGNOSTIC", "PATHLAB"],
    "Education": ["SCHOOL FEE", "COLLEGE", "UDEMY", "COURSERA", "BYJU", "UNACADEMY", "TUITION"],
    "Investments": ["MUTUAL FUND", "SIP", "ZERODHA", "GROWW", "UPSTOX", "NSDL", "CDSL", "DEMAT", "ANGEL ONE"],
    "Insurance": ["LIC", "ICICI PRU", "HDFC LIFE", "SBI LIFE", "MAX LIFE", "PREMIUM", "POLICY", "POLICYBAZAAR"],
    "Cash Withdrawal": ["ATM", "CASH WDL", "ATM WDL", "WITHDRAWAL", "CASH W/D", "CASH WD"],
    "UPI/Transfer": ["UPI", "BHIM", "PHONEPE", "GPAY", "PAYTM", "NEFT", "IMPS", "RTGS", "TRANSFER", "RAZORPAY", "CASHFREE"],
    "Rent": ["RENT", "HOUSE RENT", "RENTAL", "TENANT", "LEASE", "LANDLORD"]
}

def categorize_transaction(narration):
    narration_upper = str(narration).upper()
    for category, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword in narration_upper:
                return category
    return "Other"

def clean_amount(val_str):
    if not val_str: return 0.0
    val = str(val_str).replace(',', '').strip()
    if val.count('.') > 1:
        parts = val.split('.')
        val = "".join(parts[:-1]) + "." + parts[-1]
    try: return float(val)
    except ValueError: return 0.0

def process_hdfc_statement(pdf_stream):
    transactions = []
    
    with pdfplumber.open(pdf_stream) as pdf:
        full_text = "\n".join([page.extract_text() for page in pdf.pages if page.extract_text()])
        
        # Metadata Extraction
        ob_matches = re.findall(r'Opening Balance[\s\S]{0,40}?([-+]?[\d,]+\.\d{2})', full_text, re.IGNORECASE)
        opening_balance = clean_amount(ob_matches[-1]) if ob_matches else 0.0
        acc_name = re.search(r"(?:M/S\.|Mr\.|Mrs\.)\s*(.+)", full_text).group(0).strip() if re.search(r"(?:M/S\.|Mr\.|Mrs\.)\s*(.+)", full_text) else "Unknown"
        acc_no = re.findall(r'\b(50\d{12})\b', full_text)[0] if re.findall(r'\b(50\d{12})\b', full_text) else "Unknown"
        ifsc = re.findall(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', full_text)[0] if re.findall(r'\b([A-Z]{4}0[A-Z0-9]{6})\b', full_text) else "Unknown"
        period = re.search(r'Statement From\s+(\d{2}/\d{2}/\d{4})\s*T[o\xbf]:\s*(\d{2}/\d{2}/\d{4})', full_text, re.IGNORECASE)
        stmt_period = f"{period.group(1)} to {period.group(2)}" if period else "Unknown"
        
        # Dynamic extraction for Branch Name
        branch_match = re.search(r"Branch\s*:\s*(.*)", full_text, re.IGNORECASE)
        branch_name = branch_match.group(1).strip() if branch_match else "HDFC Bank"

        # Parsing Loop
        current_tx = None
        for page in pdf.pages:
            text = page.extract_text()
            if not text: continue
            for line in text.split('\n'):
                line = line.strip()
                if not line or any(k in line for k in ["Statement of account", "Page No", "Closing Balance includes"]): continue
                if "STATEMENT SUMMARY" in line: break
                    
                if re.match(r"^\d{2}/\d{2}/\d{2,4}\b", line):
                    if current_tx: transactions.append(current_tx)
                    match = re.search(r'(.*?)\s+([-+]?[\d,]+(?:\.\d+)*)\s+([-+]?[\d,]+(?:\.\d+)*)$', line)
                    if match:
                        prefix, tx_amt, tx_bal = match.group(1), clean_amount(match.group(2)), clean_amount(match.group(3))
                        date_matches = re.findall(r'^(\d{2}/\d{2}/\d{2,4})', prefix)
                        tx_date = date_matches[0] if date_matches else "Unknown"
                        # Placeholder for Value Date / Ref context logic 
                        current_tx = {
                            "Date": tx_date, 
                            "Value Date": tx_date, # Fallback mapping
                            "Description": prefix, 
                            "Cheque/Ref No": "N/A", 
                            "Extracted_Amount": tx_amt, 
                            "Balance": tx_bal, 
                            "Withdrawals (DR)": 0.0, 
                            "Deposits (CR)": 0.0
                        }
                elif current_tx and not any(x in line for x in ["HDFC BANK"]):
                    current_tx["Description"] += " " + line.strip()
        if current_tx: transactions.append(current_tx)

    df_trans = pd.DataFrame(transactions)
    
    # Mathematical Validation Chain
    total_debit_amt, total_credit_amt = 0.0, 0.0
    total_debit_count, total_credit_count = 0, 0
    
    for i in range(len(df_trans)):
        amt, bal = df_trans.loc[i, 'Extracted_Amount'], df_trans.loc[i, 'Balance']
        is_deposit = False
        if i == 0:
            if round(opening_balance + amt, 2) == round(bal, 2): is_deposit = True
        else:
            if round(df_trans.loc[i-1, 'Balance'] + amt, 2) == round(bal, 2): is_deposit = True
            
        if is_deposit:
            df_trans.loc[i, 'Deposits (CR)'] = amt
            total_credit_amt += amt
            total_credit_count += 1
        else:
            df_trans.loc[i, 'Withdrawals (DR)'] = amt
            total_debit_amt += amt
            total_debit_count += 1

    df_trans["Category"] = df_trans["Description"].apply(categorize_transaction)
    closing_balance = df_trans.iloc[-1]['Balance'] if not df_trans.empty else opening_balance

    # Try parsing clean references out of narratives (e.g. UPI Ref numbers)
    for i, row in df_trans.iterrows():
        ref_match = re.search(r'\b\d{12}\b', row['Description'])
        if ref_match:
            df_trans.at[i, 'Cheque/Ref No'] = ref_match.group(0)

    # --- SHEET 1: COMPLIANT METADATA ---
    df_meta = pd.DataFrame({
        "Attribute": [
            "Account Holder Name", "Account Number", "Bank Name & Branch", 
            "IFSC Code", "Statement Period", "Opening Balance", "Closing Balance",
            "Total Credits Count", "Total Credits Amount", "Total Debits Count", "Total Debits Amount"
        ],
        "Value": [
            acc_name, acc_no, branch_name, ifsc, stmt_period, opening_balance, closing_balance,
            total_credit_count, round(total_credit_amt, 2), total_debit_count, round(total_debit_amt, 2)
        ]
    })

    # --- SHEET 2: COMPLIANT LEDGER ---
    ledger_cols = ["Date", "Value Date", "Description", "Cheque/Ref No", "Deposits (CR)", "Withdrawals (DR)", "Balance", "Category"]
    df_ledger = df_trans[ledger_cols].rename(columns={"Balance": "Running Balance"})

    # --- SHEET 3: ADVANCED ANALYTICS ---
    # 1. Category Summary Table
    df_summary = df_trans.groupby('Category').agg(
        Total_Debit=('Withdrawals (DR)', 'sum'),
        Total_Credit=('Deposits (CR)', 'sum'),
        Transaction_Count=('Date', 'count')
    ).reset_index()

    # 2. Month-wise Breakdown
    df_trans['Parsed_Date'] = pd.to_datetime(df_trans['Date'], format='%d/%m/%Y', errors='coerce')
    df_trans['Month'] = df_trans['Parsed_Date'].dt.strftime('%Y-%m')
    df_monthly = df_trans.groupby('Month').agg(
        Total_Inflow=('Deposits (CR)', 'sum'),
        Total_Outflow=('Withdrawals (DR)', 'sum')
    ).reset_index()

    # 3. Top 5 Largest Transactions
    df_top5 = df_trans.nlargest(5, 'Extracted_Amount')[["Date", "Description", "Extracted_Amount", "Category"]]

    # 4. Salary & EMI Pattern Detection Insights
    salary_detected = df_trans[df_trans['Category'] == 'Salary'].groupby('Extracted_Amount').filter(lambda x: len(x) >= 2)
    sal_status = f"Detected pattern of {salary_detected['Extracted_Amount'].iloc[0]}" if not salary_detected.empty else "No clear pattern"

    emi_detected = df_trans[df_trans['Category'] == 'EMI/Loan'].groupby('Extracted_Amount').filter(lambda x: len(x) >= 2)
    emi_status = f"Detected pattern of {emi_detected['Extracted_Amount'].iloc[0]}" if not emi_detected.empty else "No clear pattern"

    # 5. Coverage Statistics
    total_rows = len(df_trans)
    uncategorized_rows = len(df_trans[df_trans['Category'] == 'Other'])
    categorized_pct = round(((total_rows - uncategorized_rows) / total_rows) * 100, 2) if total_rows > 0 else 0.0

    df_insights = pd.DataFrame({
        "Metric": ["Salary Auto-Detection", "EMI/Loan Auto-Detection", "Percentage Categorized Coverage"],
        "Value": [sal_status, emi_status, f"{categorized_pct}%"]
    })

    return df_meta, df_ledger, df_summary, df_monthly, df_top5, df_insights


@app.route('/', methods=['GET'])
def index():
    return "Server is running"


@app.route('/api/upload', methods=['POST'])
def api_upload_file():
    if 'pdf' not in request.files:
        return {"success": False, "error": "No file part"}, 400
    file = request.files['pdf']
    if file.filename == '':
        return {"success": False, "error": "No selected file"}, 400
    if not file.filename.lower().endswith('.pdf'):
        return {"success": False, "error": "File must be a PDF"}, 400
    
    try:
        df_meta, df_ledger, df_summary, df_monthly, df_top5, df_insights = process_hdfc_statement(file)
        
        # Clean up NaNs/Infs for JSON compliance
        df_meta = df_meta.fillna("")
        df_ledger = df_ledger.fillna("")
        df_summary = df_summary.fillna("")
        df_monthly = df_monthly.fillna("")
        df_top5 = df_top5.fillna("")
        df_insights = df_insights.fillna("")

        # Create Excel file in-memory
        import base64
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_meta.to_excel(writer, sheet_name='Account Details', index=False)
            df_ledger.to_excel(writer, sheet_name='Transaction Ledger', index=False)
            df_summary.to_excel(writer, sheet_name='Category Summary & Analytics', index=False, startrow=0)
            
            start_r = len(df_summary) + 3
            writer.sheets['Category Summary & Analytics'].cell(row=start_r, column=1, value="MONTH-WISE TRENDS")
            df_monthly.to_excel(writer, sheet_name='Category Summary & Analytics', index=False, startrow=start_r)
            
            start_r += len(df_monthly) + 3
            writer.sheets['Category Summary & Analytics'].cell(row=start_r, column=1, value="TOP 5 LARGEST TRANSACTIONS")
            df_top5.to_excel(writer, sheet_name='Category Summary & Analytics', index=False, startrow=start_r)

            start_r += len(df_top5) + 3
            writer.sheets['Category Summary & Analytics'].cell(row=start_r, column=1, value="RECURRING PATTERN DETECTION STATS")
            df_insights.to_excel(writer, sheet_name='Category Summary & Analytics', index=False, startrow=start_r)
        
        output.seek(0)
        excel_data = output.getvalue()
        excel_base64 = base64.b64encode(excel_data).decode('utf-8')
        
        return {
            "success": True,
            "filename": file.filename,
            "metadata": df_meta.to_dict(orient='records'),
            "ledger": df_ledger.to_dict(orient='records'),
            "summary": df_summary.to_dict(orient='records'),
            "monthly": df_monthly.to_dict(orient='records'),
            "top5": df_top5.to_dict(orient='records'),
            "insights": df_insights.to_dict(orient='records'),
            "excel_base64": excel_base64
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}, 500


if __name__ == "__main__": 
    app.run(debug=True, port=5000)