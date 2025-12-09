const levels = ['debug','info','warn','error'];
let currentLevel = process.env.LOG_LEVEL || 'info';
function shouldLog(l){return levels.indexOf(l)>=levels.indexOf(currentLevel);} 
function ts(){return new Date().toISOString();}
function log(level, msg, meta){
  if(!shouldLog(level)) return;
  const base = { level, time: ts(), msg };
  if (meta && typeof meta === 'object') {
    try { console.log(JSON.stringify({ ...base, ...meta })); } catch { console.log(JSON.stringify(base)); }
  } else {
    console.log(JSON.stringify(base));
  }
}
module.exports = {
  setLevel: (l)=>{ if(levels.includes(l)) currentLevel=l; },
  debug: (m,meta)=>log('debug',m,meta),
  info: (m,meta)=>log('info',m,meta),
  warn: (m,meta)=>log('warn',m,meta),
  error: (m,meta)=>log('error',m,meta)
};
