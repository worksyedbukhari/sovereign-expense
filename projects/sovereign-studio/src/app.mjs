import { analyzeScenario, exportScenarioCsv, formatMoney } from './engine.mjs';

const PRESETS = {
  weekend: {
    title: 'Weekend escape', currency: 'USD',
    participants: [
      {id:'ava', name:'Ava', paid:'520.40'},
      {id:'noah', name:'Noah', paid:'180.00'},
      {id:'maya', name:'Maya', paid:'95.60'}
    ]
  },
  apartment: {
    title: 'Shared apartment', currency: 'SAR',
    participants: [
      {id:'layla', name:'Layla', paid:'1850.00'},
      {id:'omar', name:'Omar', paid:'820.00'},
      {id:'sam', name:'Sam', paid:'340.00'}
    ]
  },
  team: {
    title: 'Team offsite', currency: 'EUR',
    participants: [
      {id:'alex', name:'Alex', paid:'1020.50'},
      {id:'jules', name:'Jules', paid:'425.35'},
      {id:'riley', name:'Riley', paid:'0.00'},
      {id:'taylor', name:'Taylor', paid:'230.10'}
    ]
  }
};
const byId = id => document.getElementById(id);
const peopleArea = byId('participants');
const transferArea = byId('transfer-list');
const barsArea = byId('ledger-bars');
const titleInput = byId('scenario-title');
const currencySelect = byId('currency');
const exportButton = byId('export-csv');
let state = structuredClone(PRESETS.weekend);
let selectedPreset = 'weekend';
let sequence = 0;
let currentReport = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function setText(id, text) { byId(id).textContent = text; }
function makeInput(person, field, labelText, className) {
  const wrapper = el('div', className);
  const input = el('input', 'member-input');
  input.type = 'text';
  input.id = field + '-' + person.id;
  input.value = person[field];
  input.maxLength = field === 'name' ? 42 : 12;
  input.setAttribute('aria-label', labelText + ' for ' + person.name);
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (field === 'paid') {
    input.inputMode = 'decimal';
    input.placeholder = '0.00';
  }
  input.addEventListener('input', () => {
    person[field] = input.value;
    refresh();
  });
  wrapper.append(input);
  return wrapper;
}
function drawPeople() {
  peopleArea.replaceChildren();
  state.participants.forEach(person => {
    const row = el('div', 'participant-row');
    row.append(makeInput(person, 'name', 'Participant name', 'person-field'));
    row.append(makeInput(person, 'paid', 'Amount paid', 'amount-field'));
    const remove = el('button', 'remove-button', '×');
    remove.type = 'button';
    remove.title = 'Remove ' + person.name;
    remove.setAttribute('aria-label', 'Remove ' + person.name);
    remove.disabled = state.participants.length <= 2;
    remove.addEventListener('click', () => {
      state.participants = state.participants.filter(item => item.id !== person.id);
      selectedPreset = null;
      syncPresets();
      drawPeople();
      refresh();
    });
    row.append(remove);
    peopleArea.append(row);
  });
  setText('people-count', state.participants.length + ' PEOPLE');
  byId('add-person').disabled = state.participants.length >= 12;
}
function syncPresets() {
  document.querySelectorAll('[data-preset]').forEach(button => {
    const active = button.dataset.preset === selectedPreset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function resetStats() {
  currentReport = null;
  ['total-display','share-display','outstanding-display'].forEach(id => setText(id, '—'));
  setText('total-people', state.participants.length);
  setText('transfer-count', '0 TRANSFERS');
  transferArea.replaceChildren(el('div','no-transfers','Complete the scenario to see a settlement plan.'));
  barsArea.replaceChildren();
  exportButton.disabled = true;
}
function paintBars(report) {
  const highest = Math.max(1, ...report.ledger.flatMap(item => [item.paidCents, item.shareCents]));
  barsArea.replaceChildren();
  report.ledger.forEach(item => {
    const row = el('div', 'bar-item');
    const top = el('div','bar-top');
    top.append(el('strong',null,item.name));
    top.append(el('span',null,formatMoney(item.paidCents, report.currency)));
    const track = el('div','bar-track');
    track.setAttribute('role','img');
    track.setAttribute('aria-label', item.name + ' paid ' + formatMoney(item.paidCents,report.currency) + '; fair share ' + formatMoney(item.shareCents,report.currency));
    const paid = el('div','bar-paid');
    paid.style.width = (item.paidCents / highest * 100).toFixed(2) + '%';
    const fair = el('div','bar-share');
    fair.style.left = Math.min(99.5, item.shareCents / highest * 100).toFixed(2) + '%';
    track.append(paid, fair);
    const caption = el('div','bar-caption');
    caption.append(el('span',null,'Paid amount'));
    caption.append(el('span',null,'Fair share ' + formatMoney(item.shareCents,report.currency)));
    row.append(top,track,caption);
    barsArea.append(row);
  });
}
function paintTransfers(report) {
  transferArea.replaceChildren();
  setText('transfer-count', report.transfers.length + (report.transfers.length === 1 ? ' TRANSFER' : ' TRANSFERS'));
  if (report.transfers.length === 0) {
    transferArea.append(el('div','no-transfers','Perfectly balanced. Nobody needs to send a payment.'));
    return;
  }
  for (const payment of report.transfers) {
    const row = el('article','transfer');
    row.append(el('span','transfer-icon','↗'));
    const main = el('div','transfer-main');
    main.append(el('strong',null,payment.from + ' → ' + payment.to));
    main.append(el('p',null,'Suggested repayment'));
    row.append(main,el('strong','transfer-value',formatMoney(payment.cents,report.currency)));
    transferArea.append(row);
  }
}
function refresh() {
  state.title = titleInput.value;
  state.currency = currencySelect.value;
  try {
    const report = analyzeScenario(state);
    currentReport = report;
    setText('form-error','');
    setText('total-display',formatMoney(report.totalCents,report.currency));
    setText('total-people',report.count);
    setText('share-display',formatMoney(report.perPersonApproxCents,report.currency));
    setText('outstanding-display',formatMoney(report.outstandingCents,report.currency));
    paintBars(report);
    paintTransfers(report);
    exportButton.disabled = false;
  } catch (error) {
    setText('form-error', error.message || 'Check your inputs.');
    resetStats();
  }
}
function selectPreset(key) {
  if (!(key in PRESETS)) return;
  state = structuredClone(PRESETS[key]);
  selectedPreset = key;
  titleInput.value = state.title;
  currencySelect.value = state.currency;
  syncPresets();
  drawPeople();
  refresh();
}
byId('presets').addEventListener('click', event => {
  const button = event.target.closest('button[data-preset]');
  if (button) selectPreset(button.dataset.preset);
});
byId('add-person').addEventListener('click', () => {
  if (state.participants.length >= 12) return;
  sequence += 1;
  const id = 'new_' + Date.now().toString(36) + '_' + sequence;
  state.participants.push({id, name:'Person ' + (state.participants.length+1),paid:'0.00'});
  selectedPreset = null;
  syncPresets();
  drawPeople();
  refresh();
  byId('name-' + id)?.focus();
});
titleInput.addEventListener('input', () => {
  selectedPreset = null; syncPresets(); refresh();
});
currencySelect.addEventListener('change', () => {
  selectedPreset = null; syncPresets(); refresh();
});
exportButton.addEventListener('click', () => {
  if (!currentReport) return;
  const csv = exportScenarioCsv(currentReport);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sovereign-studio-settlements.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
selectPreset('weekend');
