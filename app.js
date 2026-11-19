// Isi URL Web App Apps Script setelah deployment.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwjLljKf1gFnLh_J5irM-nUcCd5dtC7NrM7eEzYPF4FBgE8UYGl4SJkT5oNVKyXfpIKJQ/exec";
const $ = (id) => document.getElementById(id);
let selectedFile = null;
let capturedAt = null;
let extractedRows = [];

$('photoInput').addEventListener('change', async (event) => {
  selectedFile = event.target.files?.[0] || null;
  if (!selectedFile) return;
  capturedAt = new Date().toISOString();
  $('preview').src = URL.createObjectURL(selectedFile);
  $('previewWrap').hidden = false;
  $('fileInfo').textContent = `${selectedFile.name} · ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`;
  $('analyzeBtn').disabled = false;
  showNotice('Foto siap dianalisis. Pastikan seluruh tabel dan tulisan supplier terlihat jelas.');
});
$('removePhoto').addEventListener('click', () => {
  selectedFile = null; $('photoInput').value = ''; $('previewWrap').hidden = true;
  $('fileInfo').textContent = 'Belum ada foto dipilih'; $('analyzeBtn').disabled = true;
});
$('analyzeBtn').addEventListener('click', analyzePhoto);
$('addRowBtn').addEventListener('click', () => { extractedRows.push(emptyRow()); renderRows(); });
$('saveBtn').addEventListener('click', saveRows);

function showNotice(message, error=false){ $('notice').textContent=message; $('notice').style.color=error?'#a33b36':''; }
function emptyRow(){return {supplier:'',fishDate:'',grade:'',bls:0,sds:0,jamur:0,broken:0,debu:0,glagah:0,bilis:0,keterangan:'',bendaAsing:''};}
async function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});}
async function callBackend(payload){
  if(!APPS_SCRIPT_URL.startsWith('https://script.google.com/')) throw new Error('URL Apps Script belum dipasang di web/app.js.');
  // text/plain menghindari preflight OPTIONS. Deployment Apps Script tetap perlu diuji akses CORS-nya.
  const response=await fetch(APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});
  if(!response.ok) throw new Error(`Server merespons HTTP ${response.status}`);
  const result=await response.json(); if(!result.ok) throw new Error(result.error||'Permintaan gagal.'); return result;
}
async function analyzePhoto(){
  try{
    $('analyzeBtn').disabled=true; $('analyzeBtn').textContent='Menganalisis…'; showNotice('AI sedang membaca foto. Tunggu beberapa saat.');
    const imageBase64=await fileToBase64(selectedFile);
    const result=await callBackend({action:'analyzeSortir1',imageBase64,mimeType:selectedFile.type||'image/jpeg',capturedAt});
    extractedRows=(result.rows||[]).map(r=>({...emptyRow(),...r}));
    if(!extractedRows.length) throw new Error('AI belum menemukan baris data. Coba foto ulang dengan pencahayaan lebih baik.');
    renderRows(); $('resultsPanel').hidden=false; showNotice(`Berhasil membaca ${extractedRows.length} baris. Periksa kembali sebelum menyimpan.`);
  }catch(err){showNotice(err.message,true);}finally{$('analyzeBtn').disabled=!selectedFile;$('analyzeBtn').textContent='✦ Analisis dengan AI';}
}
function calcSusut(r){return Number(r.bls||0)-Number(r.sds||0)-['jamur','broken','debu','glagah','bilis'].reduce((sum,k)=>sum+Number(r[k]||0),0);}
function renderRows(){
  $('rowCount').textContent=`${extractedRows.length} BARIS`;
  $('dataRows').innerHTML=extractedRows.map((r,i)=>{
    const fields=[['supplier','text'],['fishDate','text'],['grade','text'],['bls','number'],['sds','number'],['jamur','number'],['broken','number'],['debu','number'],['glagah','number'],['bilis','number']];
    return `<tr>${fields.map(([key,type])=>`<td><input data-i="${i}" data-k="${key}" type="${type}" value="${escapeHtml(r[key]??'')}" ${type==='number'?'step="any" min="0"':''}></td>`).join('')}<td><input readonly value="${calcSusut(r)}"></td><td><input data-i="${i}" data-k="keterangan" value="${escapeHtml(r.keterangan||'')}"></td><td><input data-i="${i}" data-k="bendaAsing" value="${escapeHtml(r.bendaAsing||'')}"></td></tr>`;
  }).join('');
  $('dataRows').querySelectorAll('input:not([readonly])').forEach(input=>input.addEventListener('input',e=>{const i=Number(e.target.dataset.i),k=e.target.dataset.k;extractedRows[i][k]=e.target.type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value;if(['bls','sds','jamur','broken','debu','glagah','bilis'].includes(k)){const cell=e.target.closest('tr').querySelector('td:nth-child(11) input');cell.value=calcSusut(extractedRows[i]);}}));
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function saveRows(){
  if(!extractedRows.length)return;
  const invalid=extractedRows.findIndex(r=>!r.supplier||!r.fishDate||!r.grade);
  if(invalid>=0){showNotice(`Baris ${invalid+1}: supplier, tanggal ikan, dan grade wajib diisi.`,true);return;}
  try{$('saveBtn').disabled=true;$('saveBtn').textContent='Menyimpan…';
    const result=await callBackend({action:'saveSortir1',capturedAt,rows:extractedRows.map(r=>({...r,susut:calcSusut(r)}))});
    showNotice(`${result.saved} baris berhasil disimpan ke Google Sheets.`);$('saveBtn').textContent='Tersimpan ✓';
  }catch(err){showNotice(err.message,true);$('saveBtn').disabled=false;$('saveBtn').textContent='Simpan ke Google Sheets';}
}
