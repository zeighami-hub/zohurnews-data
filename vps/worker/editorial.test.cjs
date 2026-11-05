const test=require('node:test'),assert=require('node:assert/strict');const{editorial,canonicalCategory}=require('./editorial.cjs');
test('editorial gates apply to original text before translation',()=>{
 for(const a of [{title:'نقل و انتقالات تیم فوتبال'},{title:'فوتبال: پیش بینی قهرمان لیگ برتر'},{title:'نمایش فیلم تازه در سینما'},{title:'گفتگو با بازیگر جشنواره کن'},{title:'تمرینات تیم فوتبال برای بازی دوستانه',source_categories:['ورزش']}])assert.equal(editorial(a).allowed,false,a.title);
 for(const a of [{title:'تیم ملی فوتبال به جام جهانی صعود کرد'},{title:'کسب مدال طلای قهرمانی جهان' ,source_categories:['ورزش']},{title:'Iran athlete wins Olympic medal',source_categories:['Sports']},{title:'فیلم ایرانی برنده جایزه اسکار شد'},{title:'حفاظت از میراث جهانی یونسکو'},{title:'مذاکرات وزیر خارجه درباره تحریم ها'}])assert.equal(editorial(a).allowed,true,a.title);
 assert.equal(canonicalCategory('sports'),'society');assert.equal(canonicalCategory('health'),'society');
});
