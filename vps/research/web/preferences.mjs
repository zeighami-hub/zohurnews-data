export function readPreferences(storage,key){try{const value=JSON.parse(storage.getItem(key)||'null');return value&&value.version===1&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function writePreferences(storage,key,value){try{storage.setItem(key,JSON.stringify({...value,version:1}));return true;}catch{return false;}}
export function cleanIds(value){return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&/^[a-z0-9_-]{1,80}$/.test(x)))].slice(0,80):[];}
export function reconcileOrder(order,known){const valid=new Set(known);return [...cleanIds(order).filter(x=>valid.has(x)),...known.filter(x=>!cleanIds(order).includes(x))];}
export function browserStorage(){try{return window.localStorage;}catch{return {getItem(){return null;},setItem(){throw Error('Storage unavailable');}};}}
