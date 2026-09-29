const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const fields={};let mapped={source:'2026 Roll Goods',seriesPrice:100,coopPrice:95},year='2026',program='Series Pricing';
const c={mappedProductData:()=>mapped,selectedTakeoffPricingYear:()=>year,selectedTakeoffPricingType:()=>program,normalize:s=>s.toLowerCase().replaceAll('-',' '),byId:id=>fields[id]||(fields[id]={value:''}),state:{filters:{},takeoffManualProducts:[],takeoffEstimates:[],view:'takeoffEstimator'},findRecord:()=>null,takeoffAdjustedArea:()=>100,takeoffEstimatorRows:()=>[],takeoffRowsTotal:()=>0,fillSelect:(id,options,value)=>c.byId(id).value=value,availablePricingYears:()=>['2026','2027'],normalizeProjectTypeLabel:s=>s,pricingPrograms:['Series Pricing','Co-op Pricing'],defaultProjectType:'N/A',renderTakeoffSelectors(){},saveTakeoffManualProducts(){},renderTakeoffEstimator(){}};
vm.createContext(c);
function use(name){let a=src.indexOf('function '+name+'('),b=src.indexOf('\nfunction ',a+1);vm.runInContext(src.slice(a,b),c)}
for(const name of ['productUnitPrice','currentTakeoffEstimateSnapshot','loadTakeoffEstimate'])use(name);
assert.equal(c.productUnitPrice('test'),100);year='2027';assert.equal(c.productUnitPrice('test'),0);year='2026';program='Co-op Pricing';assert.equal(c.productUnitPrice('test'),95);delete mapped.coopPrice;assert.equal(c.productUnitPrice('test'),0);
const saved=c.currentTakeoffEstimateSnapshot();assert.equal(saved.pricingYear,'2026');c.state.takeoffEstimates=[saved];year='2027';c.loadTakeoffEstimate(saved.id);assert.equal(c.state.filters.takeoffPricingYear,'2026');assert.equal(fields.takeoffPricingYearInput.value,'2026');
Object.assign(c,{normalizeProjectTypeLabel:s=>s,takeoffCatalogForType:()=>({warrantyTypes:[],materials:[{name:'test'}]}),projectTypes:[],fillSystemSelect:(id,options)=>{c.byId(id).value=options[0]||''},takeoffMaterial:()=>({systems:[{product:'unrelated'}]}),warrantyOptionSets:()=>({caps:[],terms:[]}),warrantyMaterialSystems:()=>[]});
use('renderWarrantySummaryChart');c.renderWarrantySummaryChart();assert.match(fields.warrantySummaryRows.innerHTML,/No catalog system matches/);assert.equal(fields.warrantySystemInput.value,'');assert.match(fields.warrantySummaryNotes.value,/not been established/);
console.log('PASS: year-specific prices, no cross-program fallback, saved estimate year restored, incompatible warranty selection fails closed.');
// Exercise production catalog and quantity/import functions with exact inputs.
const q={Math,Number,String,Date};vm.createContext(q);
vm.runInContext(src.slice(src.indexOf('const mappedProductNumbers ='),src.indexOf('const stateAbbreviations'))+'\nthis.catalogItems=mappedProductNumbers;',q);
for(const name of ['normalize','escapeRegExp','bestMappedProduct','parseGalPerSquare','estimateGalPerSquare','restorationComponents','productCoverageSqft','takeoffGallons','takeoffPounds','takeoffRollGood','parsePriceBookProducts']){let a=src.indexOf('function '+name+'('),b=src.indexOf('\nfunction ',a+1);if(name==='parsePriceBookProducts')b=src.indexOf('\nasync function ',a+1);vm.runInContext(src.slice(a,b),q)}
q.mappedProductData=name=>q.bestMappedProduct(name);q.takeoffRow=(...args)=>args;q.takeoffRef=()=>'';
assert.equal(q.bestMappedProduct('Cool-Sil unknown grade'),null);
assert.equal(q.parseGalPerSquare('0.5 gal./100 sq. ft.'),.5);
assert.equal(q.parseGalPerSquare('1/3 gal./100 sq. ft.'),1/3);
assert.equal(q.parseGalPerSquare('IP 2-2.5 gal./sq.; FC 4-5 gal./sq.'),0);
assert.equal(q.productCoverageSqft('Garla-Prime'),0);
let components=q.restorationComponents({product:'Cool-Sil Gravel-Surfaced Roof Restoration'});assert.equal(components.length,2);assert.equal(components[0].rate,8);assert.equal(components[1].rate,2);
components=q.restorationComponents({product:'White-Knight Plus - Fully Reinforced',description:'4.0 gal./sq. base coat, fabric reinforcement, 2.0 gal./sq. top coat'});assert.equal(components[0].name,'White-Knight Plus base coat');assert.equal(components[1].name,'White-Knight Plus');
const drum=q.catalogItems.find(x=>x.number==='7612-55');assert(drum);let result=q.takeoffGallons(drum.match,.5,10000,'');assert.equal(result[5],1); // 50 gallons => one 55-gallon drum
const pail=q.catalogItems.find(x=>x.number==='7612-5');result=q.takeoffGallons(pail.match,.5,10000,'');assert.equal(result[5],10);
result=q.takeoffRollGood('Unknown roll',1000);assert.equal(result[5],0);
const opts={year:'2026',program:'Co-op Pricing',type:'Roll Goods',sourceName:'test.pdf'};
let imported=q.parsePriceBookProducts('4701 $635.00 25 100 sq. ft./roll\n4702 $663.00 25',opts);assert.equal(imported.length,2);assert.equal(imported[0].coopPrice,635);assert.equal(imported[0].seriesPrice,undefined);
assert.equal(q.parsePriceBookProducts('4701 $635.00 $628.65 25',opts).length,0);
assert.equal(q.parsePriceBookProducts('4701\n$635.00\n25',opts).length,0);
assert.equal(q.parsePriceBookProducts('4701 $635.00\n4701 $700.00',opts).length,0);
console.log('PASS: exact SKU matching, fractional/application rates, separate coating components, drum/pail conversion, missing roll yields, bounded price-row imports and ambiguous-row rejection.');
use('escapeHtml');use('takeoffConfidenceLabel');c.takeoffRef=()=>'<a>Manufacturer reference</a>';
mapped={source:'2026 catalog <draft>',coverage:'2 gal./100 sq. ft.'};
const label=c.takeoffConfidenceLabel('test');assert.match(label,/&lt;draft&gt;/);assert.match(label,/2 gal/);assert.match(label,/Not independently verified/);
mapped=null;assert.match(c.takeoffConfidenceLabel('unknown'),/No matching price source/);assert.match(c.takeoffConfidenceLabel('unknown'),/Coverage rate missing/);
console.log('PASS: estimate source labels, missing coverage, and escaped source text.');
