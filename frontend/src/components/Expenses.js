import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getCurrencyByCountryCode, formatCurrency } from '../utils/countries';

const CATEGORIES = [
  'General', 'Food', 'Transport', 'Entertainment', 'Utilities',
  'Rent', 'Groceries', 'Dining out', 'Travel', 'Shopping',
  'Health', 'Education', 'Subscriptions', 'Gifts', 'Other'
];

export default function Expenses() {
  const { user } = useAuth();
  const curr = getCurrencyByCountryCode(user?.country_code || '+92');
  const [expenses, setExpenses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({ group_id: '', category: '' });
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ group_id: '', description: '', amount: '', category: 'General', split_type: 'equal' });
  const [customGroupName, setCustomGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchExpenses(); fetchGroups(); }, [filters]);

  const fetchExpenses = async () => {
    try {
      let url = '/expenses?limit=50';
      if (filters.group_id) url += `&group_id=${filters.group_id}`;
      if (filters.category) url += `&category=${filters.category}`;
      const data = await api.get(url);
      setExpenses(data.expenses || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchGroups = async () => { try { const d = await api.get('/groups'); setGroups(d); } catch (e) { console.error(e); } };

  const fetchGroupMembers = async (groupId) => {
    if (!groupId) return setGroupMembers([]);
    try { const d = await api.get(`/groups/${groupId}`); setGroupMembers(d.members || []); } catch (e) { console.error(e); }
  };

  const handleGroupChange = async (value) => {
    if (value === '__new__') {
      setNewExpense({ ...newExpense, group_id: '__new__', description: newExpense.description, amount: newExpense.amount, category: newExpense.category, split_type: newExpense.split_type });
      setGroupMembers([]);
    } else {
      setNewExpense({ ...newExpense, group_id: value });
      if (value) fetchGroupMembers(value);
      else setGroupMembers([]);
    }
  };

  const createNewGroupAndSubmit = async () => {
    if (!customGroupName.trim()) return;
    try {
      const res = await api.post('/groups', { name: customGroupName.trim(), description: '', memberIds: [] });
      setNewExpense({ ...newExpense, group_id: String(res.id) });
      setCustomGroupName('');
      fetchGroups();
      fetchGroupMembers(res.id);
      return res.id;
    } catch (err) { console.error(err); return null; }
  };

  const addExpense = async (e) => {
    e.preventDefault();
    setError('');

    let groupId = newExpense.group_id;

    if (groupId === '__new__') {
      const newId = await createNewGroupAndSubmit();
      if (!newId) { setError('Failed to create group'); return; }
      groupId = newId;
    }

    if (!groupId) { setError('Please select or create a group'); return; }
    if (!newExpense.description) { setError('Description is required'); return; }
    if (!newExpense.amount || parseFloat(newExpense.amount) <= 0) { setError('Valid amount is required'); return; }

    try {
      await api.post('/expenses', {
        group_id: parseInt(groupId), description: newExpense.description,
        amount: parseFloat(newExpense.amount), category: newExpense.category,
        split_type: newExpense.split_type
      });
      setNewExpense({ group_id: '', description: '', amount: '', category: 'General', split_type: 'equal' });
      setShowAddExpense(false);
      setError('');
      fetchExpenses();
    } catch (err) { setError(err.message); }
  };

  const deleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await api.delete(`/expenses/${expenseId}`); fetchExpenses(); } catch (err) { console.error(err); }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div><h2>Expenses</h2><p>Track and manage all your expenses</p></div>
        <button className="btn btn-primary" onClick={() => { setShowAddExpense(true); setError(''); }}>+ Add</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filters.group_id} onChange={(e) => setFilters({ ...filters, group_id: e.target.value })} style={{ padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit', flex: '1 1 auto', minWidth: 120 }}>
          <option value="">All Groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={{ padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit', flex: '1 1 auto', minWidth: 120 }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {expenses.length === 0 ? (
          <div className="empty-state"><div className="icon">💸</div><h3>No expenses found</h3><p>Add your first expense to get started</p></div>
        ) : (
          <div className="expense-list">
            {expenses.map(expense => (
              <div className="expense-item" key={expense.id}>
                <div className="expense-icon">{expense.category || 'General'}</div>
                <div className="expense-details">
                  <div className="description">{expense.description}</div>
                  <div className="meta">Paid by {expense.paid_by_name}{expense.group_name && <span> · {expense.group_name}</span>} · {new Date(expense.date).toLocaleDateString()}</div>
                </div>
                <div className="expense-amount">
                  <div className="amount">{formatCurrency(expense.amount, curr.symbol)}</div>
                  {expense.paid_by === user?.id ? <div className="you-paid">You paid</div> : <div className="you-owe">You owe {formatCurrency(expense.amount / (expense.split_count || 1), curr.symbol)}</div>}
                </div>
                {expense.paid_by === user?.id && <button className="btn btn-outline btn-sm" onClick={() => deleteExpense(expense.id)} style={{ color: '#E74C3C', borderColor: 'rgba(231, 76, 60, 0.3)' }}>×</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddExpense && (
        <div className="modal-overlay" onClick={() => { setShowAddExpense(false); setError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add New Expense</h3>
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(231, 76, 60, 0.08)', borderRadius: 8, marginBottom: 14, fontSize: 11, color: '#E74C3C', border: '1px solid rgba(231, 76, 60, 0.15)' }}>{error}</div>
            )}
            <form onSubmit={addExpense}>
              <div className="input-group">
                <label>Group *</label>
                <select value={newExpense.group_id} onChange={(e) => handleGroupChange(e.target.value)} required style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit' }}>
                  <option value="">Select a group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value="__new__">+ Create new group</option>
                </select>
              </div>

              {newExpense.group_id === '__new__' && (
                <div className="input-group">
                  <label>New Group Name *</label>
                  <input type="text" value={customGroupName} onChange={(e) => setCustomGroupName(e.target.value)} placeholder="Enter group name" required />
                </div>
              )}

              <div className="input-group">
                <label>Description *</label>
                <input type="text" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} placeholder="What was this for?" required />
              </div>
              <div className="input-group">
                <label>Amount ({curr.symbol}) *</label>
                <input type="number" step="0.01" min="0.01" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} placeholder="0.00" required />
              </div>
              <div className="input-group">
                <label>Category</label>
                <select value={newExpense.category} onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Split Type</label>
                <select value={newExpense.split_type} onChange={(e) => setNewExpense({ ...newExpense, split_type: e.target.value })} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, fontFamily: 'inherit' }}>
                  <option value="equal">Equal Split</option>
                  <option value="percentage">By Percentage</option>
                  <option value="exact">Exact Amounts</option>
                </select>
              </div>
              {newExpense.group_id && newExpense.group_id !== '__new__' && groupMembers.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>Split equally among {groupMembers.length} members{newExpense.amount && ` (${formatCurrency(parseFloat(newExpense.amount) / groupMembers.length, curr.symbol)} each)`}</p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => { setShowAddExpense(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
