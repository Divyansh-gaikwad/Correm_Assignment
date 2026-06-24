import React, { useState, useMemo } from 'react';
import './App.css';

export default function App() {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Ledger state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // File drag & drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
        setFile(droppedFile);
        uploadFile(droppedFile);
      } else {
        setError('Please drop a valid PDF statement file.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      uploadFile(selectedFile);
    }
  };

  // Upload to Flask Backend API
  const uploadFile = async (selectedFile) => {
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    try {
      // Connects to Flask backend
      const response = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setResult(data);
        setActiveTab('overview');
      } else {
        throw new Error(data.error || 'Failed to process statement.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Connection failed. Ensure backend Flask server is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  // Download Excel workbook from base64
  const triggerExcelDownload = () => {
    if (!result || !result.excel_base64) return;

    try {
      const binaryString = atob(result.excel_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const downloadName = result.filename
        ? `${result.filename.replace(/\.[^/.]+$/, "")}_Analyzed.xlsx`
        : 'Statement_Analyzed.xlsx';
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to generate Excel download link.');
    }
  };

  // Helper formatting utilities
  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '₹0.00';
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Extract key-value mapping from metadata array
  const metaObj = useMemo(() => {
    if (!result || !result.metadata) return {};
    return result.metadata.reduce((acc, cur) => {
      acc[cur.Attribute] = cur.Value;
      return acc;
    }, {});
  }, [result]);

  // Filters & Search for transaction ledger
  const filteredLedger = useMemo(() => {
    if (!result || !result.ledger) return [];
    setCurrentPage(1); // Reset page on filter change
    return result.ledger.filter((tx) => {
      const matchesSearch = 
        tx.Description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.Category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx["Cheque/Ref No"]?.toString().includes(searchQuery);

      const isDebit = parseFloat(tx["Withdrawals (DR)"]) > 0;
      const isCredit = parseFloat(tx["Deposits (CR)"]) > 0;

      let matchesType = true;
      if (typeFilter === 'debit') matchesType = isDebit;
      else if (typeFilter === 'credit') matchesType = isCredit;

      return matchesSearch && matchesType;
    });
  }, [result, searchQuery, typeFilter]);

  // Paginated ledger rows
  const paginatedLedger = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLedger.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLedger, currentPage]);

  const totalPages = Math.ceil(filteredLedger.length / itemsPerPage);

  // Maximum monthly inflow/outflow for graph scaling
  const maxMonthlyVal = useMemo(() => {
    if (!result || !result.monthly) return 1;
    let maxVal = 0;
    result.monthly.forEach((m) => {
      const inflow = parseFloat(m.Total_Inflow) || 0;
      const outflow = parseFloat(m.Total_Outflow) || 0;
      if (inflow > maxVal) maxVal = inflow;
      if (outflow > maxVal) maxVal = outflow;
    });
    return maxVal || 1;
  }, [result]);

  // Maximum category amount for graph scaling
  const maxCategoryVal = useMemo(() => {
    if (!result || !result.summary) return 1;
    let maxVal = 0;
    result.summary.forEach((c) => {
      const debit = parseFloat(c.Total_Debit) || 0;
      const credit = parseFloat(c.Total_Credit) || 0;
      if (debit > maxVal) maxVal = debit;
      if (credit > maxVal) maxVal = credit;
    });
    return maxVal || 1;
  }, [result]);

  return (
    <div className="app-container">
      {/* Brand Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="brand-title">
            <h1>HDFC STATEMENT ANALYZER</h1>
            <p>Smart Parser & Excel Report Reconciler</p>
          </div>
        </div>
        {result && (
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => { setFile(null); setResult(null); }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Upload New
            </button>
            <button className="btn btn-primary" onClick={triggerExcelDownload}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Report (.xlsx)
            </button>
          </div>
        )}
      </header>

      {/* Upload Box */}
      {!result && !loading && (
        <div className="upload-wrapper">
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload-input').click()}
          >
            <div className="upload-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            <div className="upload-text">
              <h3>Upload HDFC Statement PDF</h3>
              <p>Drag and drop statement file here, or click to browse</p>
            </div>
            <input 
              id="file-upload-input" 
              type="file" 
              accept=".pdf" 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />
            <button className="file-select-btn">Select PDF</button>
          </div>

          {error && (
            <div className="error-alert">
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-wrapper">
          <div className="spinner"></div>
          <p className="loading-text">Processing bank statement pages with AI categorization...</p>
        </div>
      )}

      {/* Result Dashboard */}
      {result && (
        <>
          {/* Summary Metric Cards */}
          <div className="dashboard-grid">
            <div className="glass-card stat-card">
              <span className="stat-label">Account Holder</span>
              <span className="stat-value text-primary" style={{ fontSize: '1.1rem', wordBreak: 'break-word', minHeight: '3.3rem', display: 'flex', alignItems: 'center' }}>
                {metaObj["Account Holder Name"] || "N/A"}
              </span>
              <span className="stat-meta">Number: {metaObj["Account Number"] || "N/A"}</span>
            </div>

            <div className="glass-card stat-card">
              <span className="stat-label">Opening Balance</span>
              <span className="stat-value text-primary">
                {formatCurrency(metaObj["Opening Balance"])}
              </span>
              <span className="stat-meta">IFSC: {metaObj["IFSC Code"] || "N/A"}</span>
            </div>

            <div className="glass-card stat-card credit">
              <span className="stat-label">Total Credits (Inflow)</span>
              <span className="stat-value" style={{ color: 'var(--success)' }}>
                {formatCurrency(metaObj["Total Credits Amount"])}
              </span>
              <span className="stat-meta">{metaObj["Total Credits Count"] || 0} Transactions</span>
            </div>

            <div className="glass-card stat-card debit">
              <span className="stat-label">Total Debits (Outflow)</span>
              <span className="stat-value" style={{ color: 'var(--danger)' }}>
                {formatCurrency(metaObj["Total Debits Amount"])}
              </span>
              <span className="stat-meta">{metaObj["Total Debits Count"] || 0} Transactions</span>
            </div>

            <div className="glass-card stat-card col-span-2">
              <span className="stat-label">Statement Period</span>
              <span className="stat-value" style={{ fontSize: '1.2rem', padding: '0.2rem 0' }}>
                {metaObj["Statement Period"] || "N/A"}
              </span>
              <span className="stat-meta">Branch: {metaObj["Bank Name & Branch"] || "N/A"}</span>
            </div>

            <div className="glass-card stat-card col-span-2">
              <span className="stat-label">Net Balance Change / Closing Balance</span>
              <span className="stat-value">
                {formatCurrency(metaObj["Closing Balance"])}
              </span>
              <span className="stat-meta">
                Net change: {formatCurrency(parseFloat(metaObj["Total Credits Amount"] || 0) - parseFloat(metaObj["Total Debits Amount"] || 0))}
              </span>
            </div>
          </div>

          {/* Section Tabs */}
          <nav className="tabs-nav">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview & Insights
            </button>
            <button 
              className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
              onClick={() => setActiveTab('categories')}
            >
              Category Analysis
            </button>
            <button 
              className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              Transaction Ledger ({filteredLedger.length})
            </button>
          </nav>

          {/* Tab Content 1: Overview & Insights */}
          {activeTab === 'overview' && (
            <div className="insights-layout">
              <div className="insights-column">
                {/* Patterns Detected */}
                <div className="glass-card">
                  <h3 className="section-title">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Automatic Pattern Detection
                  </h3>
                  <div className="pattern-detection-grid">
                    {result.insights?.map((ins, i) => {
                      const isCoverage = ins.Metric.includes('Coverage');
                      const isDetected = !ins.Value.includes('No clear');
                      return (
                        <div key={i} className={`glass-card insight-card ${(isCoverage || isDetected) ? 'success-border' : ''}`}>
                          <div className="insight-icon">
                            {isCoverage ? (
                              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            )}
                          </div>
                          <div className="insight-details">
                            <h4>{ins.Metric}</h4>
                            <p style={{ fontWeight: '700', color: '#fff', fontSize: '0.95rem', marginTop: '0.2rem' }}>{ins.Value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Monthly Trends */}
                <div className="glass-card">
                  <h3 className="section-title">
                    <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Month-wise Cash Flow Trend
                  </h3>
                  <div className="trends-chart">
                    {result.monthly?.map((m, i) => {
                      const inflow = parseFloat(m.Total_Inflow) || 0;
                      const outflow = parseFloat(m.Total_Outflow) || 0;
                      
                      const inflowPct = (inflow / maxMonthlyVal) * 80; // Scaled to max 80% width
                      const outflowPct = (outflow / maxMonthlyVal) * 80;

                      return (
                        <div key={i} className="chart-row">
                          <div className="chart-label">{m.Month}</div>
                          <div className="chart-bars">
                            <div className="chart-bar-line">
                              <div 
                                className="bar-rect inflow" 
                                style={{ width: `${Math.max(inflowPct, 2)}%` }}
                              ></div>
                              <span className="bar-val" style={{ color: 'var(--success)' }}>{formatCurrency(inflow)}</span>
                            </div>
                            <div className="chart-bar-line">
                              <div 
                                className="bar-rect outflow" 
                                style={{ width: `${Math.max(outflowPct, 2)}%` }}
                              ></div>
                              <span className="bar-val" style={{ color: 'var(--danger)' }}>{formatCurrency(outflow)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Top Transactions */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 className="section-title">
                  <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Top 5 High-Value Transactions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                  {result.top5?.map((tx, i) => (
                    <div key={i} className="glass-card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>{tx.Date}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--danger)' }}>
                          {formatCurrency(tx.Extracted_Amount)}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.Description}
                      </p>
                      <div>
                        <span className="badge badge-category">{tx.Category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 2: Category Breakdown */}
          {activeTab === 'categories' && (
            <div className="category-grid">
              {result.summary?.map((cat, i) => {
                const totalDebit = parseFloat(cat.Total_Debit) || 0;
                const totalCredit = parseFloat(cat.Total_Credit) || 0;

                const debitBarPct = (totalDebit / maxCategoryVal) * 100;
                const creditBarPct = (totalCredit / maxCategoryVal) * 100;

                return (
                  <div key={i} className="glass-card category-card">
                    <div className="category-header">
                      <span className="category-name">{cat.Category}</span>
                      <span className="category-count">{cat.Transaction_Count} Transactions</span>
                    </div>

                    <div className="category-stats">
                      <div className="category-bar-wrapper" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--danger)', fontWeight: '600' }}>Total Debit</span>
                          <span>{formatCurrency(totalDebit)}</span>
                        </div>
                        <div className="progress-bar-container">
                          <div className="progress-bar debit" style={{ width: `${debitBarPct}%` }}></div>
                        </div>
                      </div>
                    </div>

                    <div className="category-stats">
                      <div className="category-bar-wrapper" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--success)', fontWeight: '600' }}>Total Credit</span>
                          <span>{formatCurrency(totalCredit)}</span>
                        </div>
                        <div className="progress-bar-container">
                          <div className="progress-bar credit" style={{ width: `${creditBarPct}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab Content 3: Transaction Ledger */}
          {activeTab === 'ledger' && (
            <div className="glass-card">
              <div className="ledger-actions">
                <div className="search-input-wrapper">
                  <svg className="search-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input 
                    type="text" 
                    placeholder="Search narrative, reference, category..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select 
                  className="filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">All Transactions</option>
                  <option value="debit">Debits Only</option>
                  <option value="credit">Credits Only</option>
                </select>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Narration</th>
                      <th>Ref Number</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Type</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLedger.length > 0 ? (
                      paginatedLedger.map((tx, idx) => {
                        const isDebit = parseFloat(tx["Withdrawals (DR)"]) > 0;
                        const amt = isDebit ? tx["Withdrawals (DR)"] : tx["Deposits (CR)"];
                        return (
                          <tr key={idx}>
                            <td>{tx.Date}</td>
                            <td className="description-cell" title={tx.Description}>
                              {tx.Description}
                            </td>
                            <td>{tx["Cheque/Ref No"] !== 'N/A' ? tx["Cheque/Ref No"] : '-'}</td>
                            <td style={{ textAlign: 'right', fontWeight: '700', color: isDebit ? 'var(--text-primary)' : 'var(--success)' }}>
                              {formatCurrency(amt)}
                            </td>
                            <td>
                              <span className={`badge ${isDebit ? 'badge-debit' : 'badge-credit'}`}>
                                {isDebit ? 'DEBIT' : 'CREDIT'}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-category">{tx.Category}</span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                          No transactions found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="pagination">
                    <span className="pagination-info">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLedger.length)} of {filteredLedger.length} entries
                    </span>
                    <div className="pagination-buttons">
                      <button 
                        className="pagination-btn"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                      >
                        Previous
                      </button>
                      <button 
                        className="pagination-btn"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(currentPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
