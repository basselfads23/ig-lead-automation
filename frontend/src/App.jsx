import React, { useState, useEffect } from 'react';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data States
  const [rules, setRules] = useState([]);
  const [leads, setLeads] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeRules: 0,
    totalActions: 0,
    byChannel: { instagram: 0, facebook: 0, tiktok: 0 },
    bySource: { dm: 0, comment: 0 }
  });
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Rule Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [modalKeyword, setModalKeyword] = useState('');
  const [modalChannel, setModalChannel] = useState('all');
  const [modalDmMessage, setModalDmMessage] = useState('');
  const [modalCommentReply, setModalCommentReply] = useState('');
  const [modalError, setModalError] = useState('');

  // Sandbox Simulator State
  const [simChannel, setSimChannel] = useState('instagram');
  const [simSourceType, setSimSourceType] = useState('comment');
  const [simUsername, setSimUsername] = useState('jane_growth');
  const [simText, setSimText] = useState('Send me the pdf please!');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Leads Filter
  const [leadChannelFilter, setLeadChannelFilter] = useState('all');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // Fetch initial backend data
  const fetchData = async () => {
    try {
      const [rulesRes, leadsRes, logsRes, statsRes] = await Promise.all([
        fetch('/api/rules'),
        fetch('/api/leads'),
        fetch('/api/logs'),
        fetch('/api/stats')
      ]);

      if (!rulesRes.ok || !leadsRes.ok || !logsRes.ok || !statsRes.ok) {
        throw new Error('Server returned an error. Make sure backend is running.');
      }

      const rulesData = await rulesRes.json();
      const leadsData = await leadsRes.json();
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();

      setRules(rulesData);
      setLeads(leadsData);
      setLogs(logsData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Could not connect to the backend server. Please verify "npm run dev" is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh stats and logs in background every 4 seconds to animate dashboard changes
    const interval = setInterval(() => {
      fetchData();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // CRUD Operation: Toggle rule active/inactive status
  const handleToggleRule = async (rule) => {
    try {
      const updatedStatus = rule.is_active === 1 ? 0 : 1;
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: rule.keyword,
          channel: rule.channel,
          dm_message: rule.dm_message,
          comment_reply: rule.comment_reply,
          is_active: updatedStatus
        })
      });

      if (!res.ok) throw new Error('Failed to toggle rule');
      
      // Local state optimistic update
      setRules(rules.map(r => r.id === rule.id ? { ...r, is_active: updatedStatus } : r));
      fetchData(); // Sync with DB logs
    } catch (err) {
      alert('Error updating rule status: ' + err.message);
    }
  };

  // CRUD Operation: Delete a rule
  const handleDeleteRule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this automation rule?')) return;
    try {
      const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete rule');
      setRules(rules.filter(r => r.id !== id));
      fetchData();
    } catch (err) {
      alert('Error deleting rule: ' + err.message);
    }
  };

  // Open Add Modal
  const openAddModal = () => {
    setEditingRule(null);
    setModalKeyword('');
    setModalChannel('all');
    setModalDmMessage('');
    setModalCommentReply('');
    setModalError('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (rule) => {
    setEditingRule(rule);
    setModalKeyword(rule.keyword);
    setModalChannel(rule.channel);
    setModalDmMessage(rule.dm_message);
    setModalCommentReply(rule.comment_reply || '');
    setModalError('');
    setIsModalOpen(true);
  };

  // CRUD Operation: Create or Update rule submit
  const handleSaveRule = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!modalKeyword.trim() || !modalDmMessage.trim()) {
      setModalError('Keyword and DM response message are required.');
      return;
    }

    const payload = {
      keyword: modalKeyword.trim(),
      channel: modalChannel,
      dm_message: modalDmMessage.trim(),
      comment_reply: modalCommentReply.trim() || null
    };

    try {
      const url = editingRule ? `/api/rules/${editingRule.id}` : '/api/rules';
      const method = editingRule ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save automation rule.');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      setModalError(err.message);
    }
  };

  // Sandbox Simulator: Run mock event trigger
  const handleInjectSimulatedEvent = async (e) => {
    e.preventDefault();
    if (!simUsername.trim() || !simText.trim()) return;

    setSimulating(true);
    setSimResult(null);

    try {
      const res = await fetch('/api/simulator/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: simChannel,
          sourceType: simSourceType,
          username: simUsername.trim(),
          text: simText.trim()
        })
      });

      if (!res.ok) throw new Error('Simulator failed to respond.');
      const data = await res.json();
      setSimResult(data);
      fetchData(); // Immediately refresh audit logs and lead database
    } catch (err) {
      alert('Simulation error: ' + err.message);
    } finally {
      setSimulating(false);
    }
  };

  // Helpers to get platform color theme
  const getChannelColor = (ch) => {
    if (ch === 'instagram') return 'instagram';
    if (ch === 'facebook') return 'facebook';
    if (ch === 'tiktok') return 'tiktok';
    return 'all';
  };

  // Filter captured leads based on tab selections
  const filteredLeads = leads.filter(lead => {
    const matchesChannel = leadChannelFilter === 'all' || lead.channel === leadChannelFilter;
    const matchesSearch = 
      lead.username.toLowerCase().includes(leadSearchQuery.toLowerCase()) ||
      (lead.full_name && lead.full_name.toLowerCase().includes(leadSearchQuery.toLowerCase())) ||
      lead.matched_keyword.toLowerCase().includes(leadSearchQuery.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  return (
    <div className="app-container">
      
      {/* ==========================================================
         SIDEBAR NAVIGATION PANEL
         ========================================================== */}
      <aside className="sidebar">
        <div className="brand-section">
          <span className="brand-icon">🤖</span>
          <h1 className="brand-title">AutoLead</h1>
        </div>

        <nav style={{ flexGrow: 1 }}>
          <ul className="nav-list">
            <li 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="nav-item-icon">📊</span>
              <span>Dashboard</span>
            </li>
            <li 
              className={`nav-item ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
            >
              <span className="nav-item-icon">⚡</span>
              <span>Automation Rules</span>
            </li>
            <li 
              className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              <span className="nav-item-icon">👥</span>
              <span>Leads Database</span>
            </li>
            <li 
              className={`nav-item ${activeTab === 'simulator' ? 'active' : ''}`}
              onClick={() => setActiveTab('simulator')}
            >
              <span className="nav-item-icon">🧪</span>
              <span>Testing Sandbox</span>
            </li>
            <li 
              className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <span className="nav-item-icon">🔌</span>
              <span>Integrations Guide</span>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <div className="status-dot"></div>
            <span>Engine Active (Local)</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AutoLead v1.0.0</span>
        </div>
      </aside>

      {/* ==========================================================
         MAIN CONTENT CONTROLLER
         ========================================================== */}
      <main className="main-content">
        
        {/* Backend connectivity warning */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--error)',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
            marginBottom: '2rem',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ==========================================================
           TAB VIEW: DASHBOARD OVERVIEW
           ========================================================== */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Command Dashboard</h2>
              <p className="page-subtitle">Real-time leads analytics and automation summary across platforms.</p>
            </div>

            {/* Glowing Analytics Summary Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Total Leads Captured</span>
                  <span className="stat-icon">👥</span>
                </div>
                <div className="stat-value" style={{ color: 'var(--secondary)' }}>
                  {stats.totalLeads}
                </div>
                <div className="stat-desc">Unique customers captured via keywords</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Active Rules</span>
                  <span className="stat-icon">⚡</span>
                </div>
                <div className="stat-value" style={{ color: 'var(--primary)' }}>
                  {stats.activeRules}
                </div>
                <div className="stat-desc">Keywords configured for reply</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-title">Total Operations</span>
                  <span className="stat-icon">⚙️</span>
                </div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>
                  {stats.totalActions}
                </div>
                <div className="stat-desc">DMs, comments & triggers logged</div>
              </div>
            </div>

            {/* Grid Row: Chart Stats & Platforms Breakdown */}
            <div className="dashboard-row">
              <div className="analytics-card">
                <div className="card-title-bar">
                  <h3 className="card-title">Leads Captured by Social Channel</h3>
                </div>

                <div className="bar-chart-container">
                  <div className="chart-bar-row">
                    <span className="chart-label">📸 Instagram</span>
                    <div className="chart-track">
                      <div 
                        className="chart-fill instagram" 
                        style={{ width: `${stats.totalLeads > 0 ? (stats.byChannel.instagram / stats.totalLeads) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <span className="chart-value">{stats.byChannel.instagram}</span>
                  </div>

                  <div className="chart-bar-row">
                    <span className="chart-label">📘 Facebook</span>
                    <div className="chart-track">
                      <div 
                        className="chart-fill facebook" 
                        style={{ width: `${stats.totalLeads > 0 ? (stats.byChannel.facebook / stats.totalLeads) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <span className="chart-value">{stats.byChannel.facebook}</span>
                  </div>

                  <div className="chart-bar-row">
                    <span className="chart-label">🎵 TikTok</span>
                    <div className="chart-track">
                      <div 
                        className="chart-fill tiktok" 
                        style={{ width: `${stats.totalLeads > 0 ? (stats.byChannel.tiktok / stats.totalLeads) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <span className="chart-value">{stats.byChannel.tiktok}</span>
                  </div>
                </div>
              </div>

              {/* Source breakdown chart card */}
              <div className="analytics-card">
                <div className="card-title-bar">
                  <h3 className="card-title">Lead Source Type</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>💬 Direct Messages (DMs)</span>
                    <span style={{ fontWeight: 600 }}>{stats.bySource.dm}</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: '#06b6d4',
                      width: `${stats.totalLeads > 0 ? (stats.bySource.dm / stats.totalLeads) * 100 : 0}%`
                    }}></div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>📝 Post Comments</span>
                    <span style={{ fontWeight: 600 }}>{stats.bySource.comment}</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: '#10b981',
                      width: `${stats.totalLeads > 0 ? (stats.bySource.comment / stats.totalLeads) * 100 : 0}%`
                    }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Leads list */}
            <div className="analytics-card">
              <div className="card-title-bar">
                <h3 className="card-title">Recent Captures</h3>
                <button className="btn btn-secondary" onClick={() => setActiveTab('leads')}>View All Leads</button>
              </div>

              {leads.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <div className="empty-icon">👥</div>
                  <p>No leads captured yet. Go to the <strong>Testing Sandbox</strong> to simulate an incoming flow!</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Lead Profile</th>
                        <th>Channel</th>
                        <th>Trigger Source</th>
                        <th>Keyword Match</th>
                        <th>Date Captured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.slice(0, 4).map(lead => (
                        <tr key={lead.id}>
                          <td>
                            <div className="user-profile">
                              <div className="avatar-placeholder">{lead.username.slice(0, 2).toUpperCase()}</div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{lead.full_name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{lead.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`channel-tag ${getChannelColor(lead.channel)}`}>
                              {lead.channel === 'instagram' ? '📸 Instagram' : lead.channel === 'facebook' ? '📘 Facebook' : '🎵 TikTok'}
                            </span>
                          </td>
                          <td>
                            <span className={`source-badge ${lead.source_type}`}>
                              {lead.source_type === 'dm' ? '📥 DM' : '💬 Comment'}
                            </span>
                          </td>
                          <td>
                            <span className="keyword-badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>{lead.matched_keyword}</span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {new Date(lead.captured_at).toLocaleDateString()} {new Date(lead.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================================
           TAB VIEW: AUTOMATION RULES MANAGER
           ========================================================== */}
        {activeTab === 'rules' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Automation Trigger Rules</h2>
              <p className="page-subtitle">Configure trigger words and the automated replies you want the app to handle.</p>
            </div>

            <div className="action-bar">
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                Currently listening to <strong>{rules.length} keywords</strong>
              </span>
              <button className="btn btn-primary" onClick={openAddModal}>+ Configure Keyword</button>
            </div>

            <div className="rules-grid">
              {rules.map(rule => (
                <div key={rule.id} className="rule-card">
                  <div className="rule-card-header">
                    <span className="keyword-badge">{rule.keyword}</span>
                    <span className={`channel-tag ${getChannelColor(rule.channel)}`}>
                      {rule.channel === 'all' ? '🌐 All Channels' : rule.channel === 'instagram' ? '📸 Instagram' : rule.channel === 'facebook' ? '📘 Facebook' : '🎵 TikTok'}
                    </span>
                  </div>

                  <div className="rule-body">
                    {rule.comment_reply && (
                      <div className="rule-message-box">
                        <div className="message-label">💬 Public Comment Auto-Reply</div>
                        <div className="message-text">"{rule.comment_reply}"</div>
                      </div>
                    )}

                    <div className="rule-message-box">
                      <div className="message-label">📥 Inbox Message DM Response</div>
                      <div className="message-text">"{rule.dm_message}"</div>
                    </div>
                  </div>

                  <div className="rule-card-footer">
                    {/* Toggle Active status */}
                    <div className="switch-container" onClick={() => handleToggleRule(rule)}>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={rule.is_active === 1}
                          onChange={() => {}} // Controlled strictly via clicking parent container
                        />
                        <span className="slider"></span>
                      </label>
                      <span>{rule.is_active === 1 ? 'Listening' : 'Paused'}</span>
                    </div>

                    <div className="rule-actions">
                      <button className="icon-btn" title="Edit Rule" onClick={() => openEditModal(rule)}>✏️</button>
                      <button className="icon-btn" title="Delete Rule" style={{ color: 'var(--error)' }} onClick={() => handleDeleteRule(rule.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {rules.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">⚡</div>
                <h3>No Automation Rules Configured</h3>
                <p>Create your first keyword trigger to begin capturing customer leads automatically.</p>
                <button className="btn btn-primary" onClick={openAddModal}>+ Configure First Keyword</button>
              </div>
            )}
          </div>
        )}

        {/* ==========================================================
           TAB VIEW: LEADS DATABASE TABLE
           ========================================================== */}
        {activeTab === 'leads' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Leads Database</h2>
              <p className="page-subtitle">Unified repository of customer contacts captured by the automation engine.</p>
            </div>

            {/* Filter Toolbar */}
            <div className="action-bar" style={{ gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexGrow: 1, flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search by username or keyword..."
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  style={{ minWidth: '240px', flexGrow: 1 }}
                />
                
                <select 
                  className="form-select"
                  value={leadChannelFilter}
                  onChange={(e) => setLeadChannelFilter(e.target.value)}
                >
                  <option value="all">All Channels</option>
                  <option value="instagram">📸 Instagram</option>
                  <option value="facebook">📘 Facebook</option>
                  <option value="tiktok">🎵 TikTok</option>
                </select>
              </div>

              <div>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    // Export leads data to CSV
                    if (filteredLeads.length === 0) return;
                    const headers = ['ID', 'Channel', 'Username', 'Full Name', 'Trigger Type', 'Matched Keyword', 'Captured At'];
                    const rows = filteredLeads.map(lead => [
                      lead.id,
                      lead.channel,
                      lead.username,
                      lead.full_name || '',
                      lead.source_type,
                      lead.matched_keyword,
                      lead.captured_at
                    ]);
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `autolead_export_${Date.now()}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  disabled={filteredLeads.length === 0}
                >
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* Leads Table Container */}
            <div className="table-card">
              {filteredLeads.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3>No Leads Found</h3>
                  <p>Try adjustments to your search queries or channel filter selectors.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Lead Profile</th>
                        <th>Channel</th>
                        <th>Trigger Source</th>
                        <th>Keyword Match</th>
                        <th>Platform User ID</th>
                        <th>Date Captured</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map(lead => (
                        <tr key={lead.id}>
                          <td>
                            <div className="user-profile">
                              <div className="avatar-placeholder">{lead.username.slice(0, 2).toUpperCase()}</div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{lead.full_name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{lead.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`channel-tag ${getChannelColor(lead.channel)}`}>
                              {lead.channel === 'instagram' ? '📸 Instagram' : lead.channel === 'facebook' ? '📘 Facebook' : '🎵 TikTok'}
                            </span>
                          </td>
                          <td>
                            <span className={`source-badge ${lead.source_type}`}>
                              {lead.source_type === 'dm' ? '📥 DM' : '💬 Comment'}
                            </span>
                          </td>
                          <td>
                            <span className="keyword-badge" style={{ fontSize: '0.75rem' }}>{lead.matched_keyword}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {lead.platform_user_id}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {new Date(lead.captured_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================================
           TAB VIEW: VISUAL TESTING SANDBOX SIMULATOR
           ========================================================== */}
        {activeTab === 'simulator' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Interactive Testing Sandbox</h2>
              <p className="page-subtitle">Inject simulated comments and messages to instantly test your keyword match flow.</p>
            </div>

            <div className="simulator-layout">
              {/* Form Input Card */}
              <div className="simulator-form-card">
                <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>Trigger Mock Event</h3>
                
                <form onSubmit={handleInjectSimulatedEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group">
                    <label className="form-label">1. Choose Social Channel</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      <button 
                        type="button"
                        className={`btn ${simChannel === 'instagram' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSimChannel('instagram')}
                        style={{ padding: '0.5rem' }}
                      >
                        📸 Instagram
                      </button>
                      <button 
                        type="button"
                        className={`btn ${simChannel === 'facebook' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSimChannel('facebook')}
                        style={{ padding: '0.5rem' }}
                      >
                        📘 Facebook
                      </button>
                      <button 
                        type="button"
                        className={`btn ${simChannel === 'tiktok' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSimChannel('tiktok')}
                        style={{ padding: '0.5rem' }}
                      >
                        🎵 TikTok
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">2. Social Action Type</label>
                    <select 
                      className="form-select"
                      value={simSourceType}
                      onChange={(e) => setSimSourceType(e.target.value)}
                    >
                      <option value="comment">💬 Post Comment ("Comment the word...")</option>
                      <option value="dm">📥 Direct Message Inbox ("Send me a DM...")</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">3. Mock Username</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="e.g. alex_lead"
                      value={simUsername}
                      onChange={(e) => setSimUsername(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">4. Comment / DM Text Content</label>
                    <textarea 
                      className="form-textarea"
                      placeholder="Type the message containing the configured trigger keyword..."
                      value={simText}
                      onChange={(e) => setSimText(e.target.value)}
                      rows={3}
                    ></textarea>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Tip: Comment a word like <strong>"pdf"</strong>, <strong>"growth"</strong>, or <strong>"lead"</strong> to match the default keywords.
                    </span>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={simulating}
                    style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
                  >
                    {simulating ? 'Processing Event...' : '🚀 Inject Simulated Trigger'}
                  </button>
                </form>

                {/* Phone mockup layout mapping */}
                <div className="phone-mockup">
                  <div className="phone-header">
                    {simChannel === 'instagram' ? '📸 Instagram Direct' : simChannel === 'facebook' ? '📘 Messenger' : '🎵 TikTok Inbox'}
                  </div>
                  <div className="phone-screen">
                    <div className="phone-body">
                      {/* Sender Bubble (Simulated action) */}
                      <div className="phone-bubble sender">
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>@{simUsername}</div>
                        {simText}
                      </div>

                      {/* Receiver response (App DM Automations results) */}
                      {simResult && simResult.matched && (
                        <div className="phone-bubble receiver">
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.2rem' }}>AutoReply Bot</div>
                          {simResult.dmSentText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Console Logs Display */}
              <div className="logs-display-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="card-title">Live Automation Logs</h3>
                  <span className="status-dot"></span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Audit logs representing real-time automation calculations. Updated live.
                </p>

                <div className="logs-viewport">
                  {logs.map(log => (
                    <div key={log.id} className={`log-entry ${log.status}`}>
                      <div className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                      <div>
                        <span className={`channel-icon-pill ${getChannelColor(log.channel)}`}>
                          {log.channel}
                        </span>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {log.event_type.replace(/_/g, ' ').toUpperCase()}:
                        </strong>{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{log.details}</span>
                      </div>
                    </div>
                  ))}

                  {logs.length === 0 && (
                    <div className="empty-state" style={{ margin: 'auto' }}>
                      <p>Waiting for triggers... Event entries will populate here.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================
           TAB VIEW: INTEGRATIONS GUIDE
           ========================================================== */}
        {activeTab === 'integrations' && (
          <div className="guide-container">
            <div className="page-header">
              <h2 className="page-title">Social Integration Guides</h2>
              <p className="page-subtitle">Complete instructions on hookups to live Meta (Instagram / Facebook) and TikTok APIs with $0 setup cost.</p>
            </div>

            {/* Meta Segment */}
            <div className="guide-section">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📸 📘 Meta Developer Account Integration</span>
                <span className="channel-tag facebook" style={{ fontSize: '0.7rem' }}>Free</span>
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Connect this application directly to your Instagram and Facebook Business channels using the official Facebook Graph API endpoints.
              </p>

              <ul className="guide-step-list">
                <li className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Create a Meta Developer Account</span>
                    <span className="step-desc">
                      Head to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>developers.facebook.com</a> and sign up for a free developer account. Create an app selecting the <strong>"Other"</strong> and then <strong>"Business"</strong> type category.
                    </span>
                  </div>
                </li>

                <li className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Connect your Social Assets</span>
                    <span className="step-desc">
                      Ensure your Instagram account is a <strong>Business/Professional Account</strong> and link it to a Facebook Page you control. In your developer console, add the **Messenger** and **Instagram Graph API** products to your dashboard.
                    </span>
                  </div>
                </li>

                <li className="guide-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <span className="step-title">Generate Access Tokens</span>
                    <span className="step-desc">
                      Select your Facebook Page under the token generator panel to create a permanent **Page Access Token**. Copy it and add it to your local environment file:
                    </span>
                    <div className="code-block">
                      <span>META_PAGE_ACCESS_TOKEN=EAAGd8H5i...</span>
                    </div>
                  </div>
                </li>

                <li className="guide-step">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    <span className="step-title">Expose Server Tunnels for Webhooks</span>
                    <span className="step-desc">
                      Since Meta sends comment/DM events to a public URL, run a tunnel tool like **ngrok** (completely free) to map your local port 5000:
                    </span>
                    <div className="code-block">
                      <span>ngrok http 5000</span>
                    </div>
                    <span className="step-desc" style={{ marginTop: '0.25rem' }}>
                      Copy the HTTPS forwarding address (e.g. <code>https://ab12-34.ngrok-free.app</code>).
                    </span>
                  </div>
                </li>

                <li className="guide-step">
                  <div className="step-num">5</div>
                  <div className="step-content">
                    <span className="step-title">Register Webhook Callback URI</span>
                    <span className="step-desc">
                      In the Meta Developer Portal's Webhooks page, set the callback URL to:
                      <code style={{ display: 'block', margin: '0.5rem 0', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px', color: 'var(--secondary)' }}>
                        https://your-ngrok-url.ngrok-free.app/api/webhooks/meta
                      </code>
                      Enter the verify token you set in your <code>.env</code> file (e.g. <code>lead_automation_verify_token_5f7d</code>) and check subscriptions for <strong>messages</strong> and <strong>comments</strong> events!
                    </span>
                  </div>
                </li>
              </ul>
            </div>

            {/* Production Hosting Segment */}
            <div className="guide-section">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>☁️ Database & Deployment Setup</span>
                <span className="channel-tag all" style={{ fontSize: '0.7rem' }}>Zero Cost</span>
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Prepare your lead capturing application to run 24/7 on high-availability servers for absolutely zero dollars.
              </p>

              <ul className="guide-step-list">
                <li className="guide-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <span className="step-title">Get a Free Postgres Database via Supabase</span>
                    <span className="step-desc">
                      To persist your rules and leads in a live cloud database for free, log into <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Supabase.com</a>. Create a project and grab your PostgreSQL connection URI.
                    </span>
                  </div>
                </li>

                <li className="guide-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <span className="step-title">Host Server Free on Render</span>
                    <span className="step-desc">
                      Create an account on <a href="https://render.com" target="_blank" rel="noreferrer" style={{ color: 'var(--secondary)' }}>Render.com</a>. Connect your GitHub repository containing the app files and build a new Web Service using their <strong>Free Tier</strong>. Provide the env variables from your `.env` and you are live 24/7!
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        )}

      </main>

      {/* ==========================================================
         MODAL FORM OVERLAY: CREATE/EDIT KEYWORD RULE
         ========================================================== */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="card-title">{editingRule ? '✏️ Edit Automation Rule' : '⚡ Configure Keyword Automation'}</h3>
              <button className="icon-btn" onClick={() => setIsModalOpen(false)}>❌</button>
            </div>

            <form onSubmit={handleSaveRule}>
              <div className="modal-body">
                {modalError && (
                  <div style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem' }}>
                    {modalError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Keyword trigger (Case insensitive)</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="e.g. info, growth, links"
                    value={modalKeyword}
                    onChange={(e) => setModalKeyword(e.target.value)}
                    disabled={!!editingRule} // Prevent changing the keyword index
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Trigger word the user comments on your post or messages to you.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Apply to Channel</label>
                  <select 
                    className="form-select"
                    value={modalChannel}
                    onChange={(e) => setModalChannel(e.target.value)}
                  >
                    <option value="all">🌐 All Channels (IG, FB, TikTok)</option>
                    <option value="instagram">📸 Instagram</option>
                    <option value="facebook">📘 Facebook</option>
                    <option value="tiktok">🎵 TikTok</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Public Comment Reply Text (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="e.g. Check your DM, I just sent you the link! 📥"
                    value={modalCommentReply}
                    onChange={(e) => setModalCommentReply(e.target.value)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Automatically reply to post comments. Keep empty to only send direct messages.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Direct Message (DM) Response Message</label>
                  <textarea 
                    className="form-textarea"
                    placeholder="Hey! Tap this link to get started: https://example.com 🚀"
                    value={modalDmMessage}
                    onChange={(e) => setModalDmMessage(e.target.value)}
                    rows={4}
                  ></textarea>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Complete text message sent directly to the customer's inbox. Include hyperlinks here.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Automation</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
