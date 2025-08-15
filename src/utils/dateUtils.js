// src/utils/dateUtils.js
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function monthFolder(d = new Date()) {
  return months[d.getMonth()];
}

function monthNameFromDate(d = new Date()) {
return d.toLocaleString('en-US', { month: 'short' }).toLowerCase(); // jan, feb, mar...
}

function displayDateDMY(d = new Date()) {
const dd = String(d.getDate()).padStart(2, '0');
const mm = String(d.getMonth() + 1).padStart(2, '0');
const yyyy = d.getFullYear();
return `${dd}-${mm}-${yyyy}`; // DD-MM-YYYY
}
export function displayDate(d = new Date()) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
