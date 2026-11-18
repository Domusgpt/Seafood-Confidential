import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: build_workbook.mjs <development-kit-directory> <output-directory>');
const kit = path.resolve(process.argv[2]);
const outputDir = path.resolve(process.argv[3]);
await fs.mkdir(outputDir, { recursive: true });
const backlogSource = JSON.parse(await fs.readFile(path.join(kit, 'planning/BACKLOG.json'), 'utf8'));
const calendarSource = JSON.parse(await fs.readFile(path.join(kit, 'editorial/SIX_WEEK_CALENDAR.json'), 'utf8'));
const tickets = Array.isArray(backlogSource) ? backlogSource : (backlogSource.tickets || backlogSource.backlog || backlogSource.items);
const weeks = Array.isArray(calendarSource) ? calendarSource : (calendarSource.weeks || calendarSource.calendar || calendarSource.items);
if (!Array.isArray(tickets) || !Array.isArray(weeks)) throw new Error('Canonical planning files must contain ticket and week arrays');

const colors = { ink:'#102B3A', warm:'#F3EFE5', teal:'#7FA59A', rust:'#B64D35', line:'#C9D7D6', input:'#FFF3D6', blue:'#0057A8', muted:'#536A75', pale:'#E8F0EC', white:'#FFFFFF' };
const workbook = Workbook.create();
const sheets = Object.fromEntries(['Sprint','Costs','Editorial','Decisions'].map(n=>[n,workbook.worksheets.add(n)]));
function basic(sheet, range, title, context, widths) {
  sheet.showGridLines = false;
  sheet.getRange(range).format = { font:{name:'Arial',size:11,color:colors.ink}, verticalAlignment:'center', rowHeight:23 };
  for (const [col,width] of Object.entries(widths)) sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  sheet.getRange('A1').format.rowHeight = 14;
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format.font = {name:'Arial',size:16,bold:true,color:colors.ink};
  sheet.getRange('A2').format.rowHeight=29;
  sheet.getRange('A3').values=[[context]];
  sheet.getRange('A3').format.font={name:'Arial',size:11,italic:true,color:colors.muted};
  sheet.getRange('A3').format.rowHeight=26;
  const endCol=range.split(':')[1].replace(/\d/g,'');
  sheet.getRange(`A4:${endCol}4`).format.borders={bottom:{style:'thin',color:colors.teal}};
}
function heading(sheet,range) {
  sheet.getRange(range).format={fill:colors.ink,font:{name:'Arial',size:11,bold:true,color:colors.white},horizontalAlignment:'center',verticalAlignment:'center',wrapText:true,rowHeight:36};
}
function inputs(sheet,range,numeric=false) {
  sheet.getRange(range).format.fill=colors.input;
  sheet.getRange(range).format.font.color=numeric?colors.blue:colors.ink;
}
function zebra(sheet,start,end,lastCol) {
  sheet.getRange(`A${start}:${lastCol}${end}`).format.fill=colors.white;
  for(let r=start;r<=end;r++) if((r-start)%2===1) sheet.getRange(`A${r}:${lastCol}${r}`).format.fill='#F6F8F7';
}
function statusRules(sheet,range) {
  const rg=sheet.getRange(range);
  rg.dataValidation={rule:{type:'list',values:['Proposed','Ready','In progress','Blocked','Done']}};
  rg.conditionalFormats.add('containsText',{text:'Blocked',format:{fill:'#FBE8E3',font:{color:colors.rust,bold:true}}});
  rg.conditionalFormats.add('containsText',{text:'Done',format:{fill:colors.pale,font:{color:colors.ink}}});
  rg.conditionalFormats.add('containsText',{text:'In progress',format:{fill:'#EAF1F7',font:{color:colors.blue}}});
}
const listText = v => Array.isArray(v) ? v.join('\n') : (v ?? '');
const dayEnvelope = id => {const n=Number(id.split('-')[1]);return n<=4?'1–4':n<=7?'5–9':n<=11?'10–14':n<=15?'15–17':'18–20';};
function effortOf(t) {
  const h=t.estimate_hours || t.hours || t.effort_hours || {};
  if(Array.isArray(h)) return h;
  return [t.hoursLow ?? t.hours_low ?? t.effort_low ?? h.low ?? h.min, t.hoursHigh ?? t.hours_high ?? t.effort_high ?? h.high ?? h.max];
}

// Sprint: planned work, editable estimates and hours, acceptance criteria.
{
const s=sheets.Sprint;
const start=11,end=start+tickets.length-1,reserveRow=end+3;
basic(s,`A1:L${reserveRow+2}`,'Seafood Confidential development sprint','Proposed four-week plan. Amber cells are editable. Actual hours start blank until work is logged.',{A:11,B:11,C:37,D:18,E:20,F:16,G:11,H:11,I:12,J:12,K:12,L:72});
s.tabColor=colors.ink;
s.getRange('G5:K5').values=[['Low hours','High hours','Midpoint','Actual hours','Done tickets']];
heading(s,'G5:K5');
s.getRange('A6').values=[['Task estimates']];
s.getRange('G6:K6').formulas=[[`=SUM(G${start}:G${end})`,`=SUM(H${start}:H${end})`,`=SUM(I${start}:I${end})`,`=SUM(J${start}:J${end})`,`=COUNTIFS(F${start}:F${end},"Done")`]];
s.getRange('A7').values=[['Delivery reserve']];
s.getRange('G7:H7').formulas=[[`=G${reserveRow}`,`=H${reserveRow}`]];
s.getRange('I7').formulas=[[`=AVERAGE(G7:H7)`]];
s.getRange('A8').values=[['Total development plan']];
s.getRange('G8:I8').formulas=[['=SUM(G6:G7)','=SUM(H6:H7)','=SUM(I6:I7)']];
s.getRange('A8:K8').format.fill=colors.warm;
s.getRange('A8:K8').format.font.bold=true;
s.getRange('G6:K8').setNumberFormat('0.0');
s.getRange('K6').setNumberFormat('0');
s.getRange('A10:L10').values=[['ID','Target days','Work item','Owner','Depends on','Status','Low h','High h','Midpoint h','Actual h','Variance h','Acceptance criteria']];
const rows=tickets.map(t=>{
 const [low,high]=effortOf(t);
 if(typeof low!=='number'||typeof high!=='number') throw new Error(`Missing effort range for ${t.id}`);
 return [t.id,t.week ?? t.sprint_week ?? dayEnvelope(t.id),t.title ?? t.name,t.owner ?? 'Developer',(t.depends_on??t.dependencies??[]).join(', '),'Proposed',low,high,null,null,null,listText(t.acceptance_criteria??t.acceptance??t.done_when??'')];
});
s.getRange(`A${start}:L${end}`).values=rows;
const table=s.tables.add(`A10:L${end}`,true,'SprintBacklog');table.style='TableStyleLight1';
zebra(s,start,end,'L');
heading(s,'A10:L10');
s.getRange(`A${start}:L${end}`).format.rowHeight=70;
s.getRange(`C${start}:F${end}`).format.wrapText=true;
s.getRange(`L${start}:L${end}`).format.wrapText=true;
s.getRange(`C${start}:L${end}`).format.verticalAlignment='top';
s.getRange(`G${start}:K${end}`).format.verticalAlignment='center';
s.getRange(`G${start}:K${end}`).setNumberFormat('0.0');
s.getRange(`I${start}`).formulas=[[`=AVERAGE(G${start}:H${start})`]];
s.getRange(`I${start}:I${end}`).fillDown();
s.getRange(`K${start}`).formulas=[[`=IF(J${start}="","",J${start}-I${start})`]];
s.getRange(`K${start}:K${end}`).fillDown();
inputs(s,`F${start}:H${end}`);s.getRange(`G${start}:H${end}`).format.font.color=colors.blue;
inputs(s,`J${start}:J${end}`,true);
statusRules(s,`F${start}:F${end}`);
s.getRange(`A${reserveRow}`).values=[['Reserve input']];
s.getRange(`C${reserveRow}`).values=[['Connector delays, fixes and launch rehearsal']];
const reserve=backlogSource.reserve_hours || backlogSource.delivery_reserve_hours || {low:backlogSource.engineeringHours.reserve,high:backlogSource.engineeringHours.reserve};
s.getRange(`G${reserveRow}:H${reserveRow}`).values=[[reserve.low??reserve.min,reserve.high??reserve.max]];inputs(s,`G${reserveRow}:H${reserveRow}`,true);
s.getRange(`L${reserveRow}`).values=[['Estimate only. No launch date or developer rate has been approved.']];s.getRange(`L${reserveRow}`).format.wrapText=true;s.getRange(`A${reserveRow}:L${reserveRow}`).format.rowHeight=40;
s.freezePanes.freezeRows(10);s.freezePanes.freezeColumns(2);
}

// Costs: one cost build, with input rates and actual billing cadence visible.
{
const s=sheets.Costs;
basic(s,'A1:K28','Seafood Confidential operating costs','USD. Monthly equivalent is not invoice cadence. Prices checked November 17 2026. Labor, taxes and overages excluded.',{A:31,B:17,C:10,D:12,E:12,F:15,G:15,H:18,I:3,J:70,K:49});
s.tabColor=colors.teal;
s.getRange('F5:H5').values=[['Low per month','High per month','Annual upfront']];heading(s,'F5:H5');
s.getRange('A6:A8').values=[['Core vendor base'],['Operation with allowances'],['Operation plus podcast']];
s.getRange('F6:H6').formulas=[['=SUM(F15:F18)','=SUM(G15:G18)','=SUM(H15:H18)']];
s.getRange('F7:G7').formulas=[['=SUM(F15:F20)','=SUM(G15:G20)']];
s.getRange('F8:G8').formulas=[['=SUM(F15:F22)','=SUM(G15:G22)']];
s.getRange('A7:H7').format.fill=colors.warm;s.getRange('A7:H7').format.font.bold=true;
s.getRange('A11').values=[['Amber rate and quantity cells are editable. Annual upfront includes Ghost and Buffer only.']];
s.getRange('A12').values=[['Optional podcast costs are excluded from the operation subtotal. Mail/domain and AI are planning allowances.']];
s.getRange('A14:H14').values=[['Vendor or allowance','Billing cadence','Quantity','Unit / mo low','Unit / mo high','Monthly low','Monthly high','Annual upfront']];
s.getRange('J14:K14').values=[['Source URL','Basis']];heading(s,'A14:H14');heading(s,'J14:K14');
const costs=[
 ['GhostPro Publisher','Annual',1,29,29,null,null,null,null,'https://ghost.org/pricing/','1,000-member band. Three counted staff users.'],
 ['Buffer Team','Annual',2,10,10,null,null,null,null,'https://buffer.com/pricing','Per channel. LinkedIn and Facebook assumed.'],
 ['Supabase Pro','Monthly',1,25,25,null,null,null,null,'https://supabase.com/pricing','One small operations project. Usage can add cost.'],
 ['Vercel Pro','Monthly',1,20,20,null,null,null,null,'https://vercel.com/docs/plans/pro-plan','One deploying seat. Extra seats and usage cost more.'],
 ['AI usage allowance','Allowance',1,15,50,null,null,null,null,'Planning assumption','Meter usage. Founder has not approved this budget.'],
 ['Mailbox and domain allowance','Allowance',1,10,25,null,null,null,null,'Planning assumption','Vendor and domain remain unselected.'],
 ['Optional Transistor Starter','Monthly',1,19,19,null,null,null,null,'https://transistor.fm/pricing/','Audio podcast hosting. Optional after two pilots.'],
 ['Optional audio editing','Allowance',1,0,30,null,null,null,null,'Planning assumption','Existing tools may cover the work.']
];
s.getRange('A15:K22').values=costs;
zebra(s,15,22,'H');
s.getRange('A15:H22').format.rowHeight=51;s.getRange('A15:B22').format.wrapText=true;
s.getRange('J15:K22').format.wrapText=true;s.getRange('J15:K22').format.verticalAlignment='center';
s.getRange('F15').formulas=[['=C15*D15']];s.getRange('F15:F22').fillDown();
s.getRange('G15').formulas=[['=C15*E15']];s.getRange('G15:G22').fillDown();
s.getRange('H15').formulas=[['=IF(B15="Annual",F15*12,0)']];s.getRange('H15:H22').fillDown();
inputs(s,'C15:D22',true);
for(const r of [15,16,17,18,21])s.getRange(`E${r}`).formulas=[[`=D${r}`]];
inputs(s,'E19:E20',true);inputs(s,'E22',true);
s.getRange('B15:B22').dataValidation={rule:{type:'list',values:['Annual','Monthly','Allowance']}};
s.getRange('D15:H22').setNumberFormat('"$"#,##0;("$"#,##0);"–"');
s.getRange('F6:H9').setNumberFormat('"$"#,##0;("$"#,##0);"–"');
s.getRange('C15:C22').setNumberFormat('0');
s.getRange('A24').values=[['Annual subscriptions are paid in advance. Monthly services still have monthly invoices.']];
s.getRange('A25').values=[['The vendor subtotal depends on the selected plans, member band, channels, seats and included usage.']];
s.getRange('A26').values=[['Podcast adds hosting and editing allowances. The production workload must also be approved.']];
s.freezePanes.freezeRows(14);s.freezePanes.freezeColumns(1);
}

// Editorial: canonical six-week launch sequence, with editable assignment and progress.
{
const s=sheets.Editorial;
const start=9,end=start+weeks.length-1;
basic(s,`A1:I${end+3}`,'Seafood Confidential first six weeks','Relative weeks begin after launch. One flagship article and one newsletter per week. Podcast work is optional.',{A:10,B:44,C:22,D:20,E:49,F:55,G:58,H:38,I:17});
s.tabColor=colors.teal;
s.getRange('A5').values=[['Planned weekly editions']];s.getRange('C5').formulas=[[`=COUNTA(A${start}:A${end})`]];
s.getRange('E5').values=[['Completed editions']];s.getRange('F5').formulas=[[`=COUNTIFS(I${start}:I${end},"Done")`]];
s.getRange('A6').values=[['Edit owner and status as contributors commit. A working title is a proposal, not a published factual claim.']];
s.getRange('A8:I8').values=[['Week','Working title','Format','Owner','Question or angle','Sources and guest','Newsletter and social','Podcast option','Status']];
const rows=weeks.map(w=>[w.week,w.title??w.working_title??w.flagship_title,w.format??'Article + newsletter',w.owner??'Managing editor',w.reader_question??w.angle??w.question??w.primary_question??'',listText(w.source_requirements??w.sources??w.sources_and_guest??w.guest??''),[w.newsletter,w.social].filter(Boolean).join('\n'),listText(w.podcast??w.podcast_option??w.podcast_status??''),'Proposed']);
s.getRange(`A${start}:I${end}`).values=rows;
const table=s.tables.add(`A8:I${end}`,true,'EditorialCalendar');table.style='TableStyleLight1';zebra(s,start,end,'I');heading(s,'A8:I8');
s.getRange(`A${start}:I${end}`).format.rowHeight=78;s.getRange(`B${start}:I${end}`).format.wrapText=true;s.getRange(`B${start}:I${end}`).format.verticalAlignment='top';
inputs(s,`D${start}:D${end}`);inputs(s,`I${start}:I${end}`);statusRules(s,`I${start}:I${end}`);
s.freezePanes.freezeRows(8);s.freezePanes.freezeColumns(1);
}

// Decisions: named ownership fields and unresolved launch choices.
const decisions=[
 ['D01','Founders and account owner','Paul and friend','Name the legal account owner, managing editor and backup.','Proposed','Before purchases','Ownership and recovery contacts'],
 ['D02','Name domain and handles','Paul and friend','Review existing name uses and select available domain and handles.','Proposed','Before brand registration','Name and identity checks'],
 ['D03','Primary reader','Paul and friend','Lead with seafood professionals and curious serious food readers.','Proposed','Before launch copy','Audience positioning'],
 ['D04','Launch scope','Managing editor and developer','Ghost publication plus a small private operations portal.','Proposed','Sprint week 1','Product and stack boundary'],
 ['D05','Operating budget','Account owner','Approve monthly allowances and annual prepaid subscriptions.','Proposed','Before purchases','Costs sheet'],
 ['D06','Publication authority','Managing editor','Designate human final approval. Agents create restricted drafts.','Proposed','Sprint week 1','Permissions and account roles'],
 ['D07','Contributor terms','Paul and friend','Set attribution, rights, editing, compensation and withdrawal terms.','Proposed','Before first invitation','Contributor policy'],
 ['D08','Sources and corrections','Managing editor','Set private-source access, corrections handling and disclosure rules.','Proposed','Before pilot publication','Editorial policy'],
 ['D09','Newsletter identity','Account owner','Choose sending domain, working reply address and signup consent wording.','Proposed','Sprint week 2','Domain and email setup'],
 ['D10','Social channels','Managing editor','Begin with LinkedIn and Facebook. Assign account access.','Proposed','Sprint week 3','Buffer connections'],
 ['D11','Kickoff and launch','Paul and friend','Choose kickoff after staffing and access are known. Launch follows acceptance.','Proposed','Before sprint starts','Developer availability'],
 ['D12','Podcast gate','Managing editor','Approve a recurring show after two private pilots meet quality and workload targets.','Proposed','After launch rhythm is tested','Pilot evidence']
];
{
const s=sheets.Decisions;const start=9,end=start+decisions.length-1;
basic(s,`A1:G${end+3}`,'Seafood Confidential founder decisions','All choices are proposed. Update the owner and status when the founders decide.',{A:9,B:31,C:25,D:76,E:18,F:28,G:35});s.tabColor=colors.rust;
s.getRange('A5').values=[['Decisions awaiting agreement']];s.getRange('D5').formulas=[[`=COUNTIFS(E${start}:E${end},"Proposed")+COUNTIFS(E${start}:E${end},"Discussing")`]];
s.getRange('A6').values=[['No account purchase, publication date or external access has been approved by this workbook.']];
s.getRange('A8:G8').values=[['ID','Decision','Owner','Proposed choice or next action','Status','Needed by','Dependency']];
s.getRange(`A${start}:G${end}`).values=decisions;
const table=s.tables.add(`A8:G${end}`,true,'FounderDecisions');table.style='TableStyleLight1';zebra(s,start,end,'G');heading(s,'A8:G8');
s.getRange(`A${start}:G${end}`).format.rowHeight=42;s.getRange(`B${start}:G${end}`).format.wrapText=true;s.getRange(`B${start}:G${end}`).format.verticalAlignment='top';
inputs(s,`C${start}:C${end}`);inputs(s,`E${start}:E${end}`);
s.getRange(`E${start}:E${end}`).dataValidation={rule:{type:'list',values:['Proposed','Discussing','Decided','Deferred']}};
s.getRange(`E${start}:E${end}`).conditionalFormats.add('containsText',{text:'Decided',format:{fill:colors.pale,font:{color:colors.ink}}});
s.freezePanes.freezeRows(8);s.freezePanes.freezeColumns(1);
}

// Verify live recalculation, restore original inputs, then perform final checks.
function value(sheet,cell){return sheet.getRange(cell).values[0][0];}
function equal(actual,expected,label){if(Math.abs(Number(actual)-expected)>1e-8) throw new Error(`${label}: expected ${expected}, got ${actual}`);}
workbook.recalculate();
equal(value(sheets.Costs,'F6'),94,'Core monthly low');equal(value(sheets.Costs,'G6'),94,'Core monthly high');
equal(value(sheets.Costs,'F7'),119,'Operation monthly low');equal(value(sheets.Costs,'G7'),169,'Operation monthly high');equal(value(sheets.Costs,'H6'),588,'Annual upfront');
equal(value(sheets.Sprint,'G8'),118,'Total sprint low');equal(value(sheets.Sprint,'H8'),160,'Total sprint high');
sheets.Costs.getRange('C16').values=[[3]];workbook.recalculate();equal(value(sheets.Costs,'F6'),104,'Channel sensitivity');equal(value(sheets.Costs,'H6'),708,'Annual channel sensitivity');
sheets.Costs.getRange('C16').values=[[2]];
sheets.Sprint.getRange('F11').values=[['Done']];sheets.Sprint.getRange('J11').values=[[2]];workbook.recalculate();equal(value(sheets.Sprint,'K6'),1,'Completion update');equal(value(sheets.Sprint,'J6'),2,'Actual hours update');
sheets.Sprint.getRange('J11').values=[[0]];workbook.recalculate();equal(value(sheets.Sprint,'K11'),-5,'Actual zero is not blank');
sheets.Sprint.getRange('F11').values=[['Proposed']];sheets.Sprint.getRange('J11').values=[[null]];
workbook.recalculate();
const summary=await workbook.inspect({kind:'table',range:'Costs!A5:H9',include:'values,formulas',tableMaxRows:5,tableMaxCols:8,maxChars:5000});
console.log(summary.ndjson);
const scan=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},summary:'Final formula error scan',maxChars:2000});
console.log(scan.ndjson);
for(const [name,range] of [['Sprint','A1:L16'],['Costs','A1:H26'],['Editorial','A1:I14'],['Decisions','A1:G20']]){
 const preview=await workbook.render({sheetName:name,range,scale:1.4,format:'png'});
 await fs.writeFile(path.join(outputDir,`${name.toLowerCase()}_preview.png`),new Uint8Array(await preview.arrayBuffer()));
}
for(const [name,range,file] of [['Sprint','A17:L29','sprint_lower_preview.png'],['Costs','J14:K22','cost_sources_preview.png']]){
 const preview=await workbook.render({sheetName:name,range,scale:1.4,format:'png'});
 await fs.writeFile(path.join(outputDir,file),new Uint8Array(await preview.arrayBuffer()));
}
const exported=await SpreadsheetFile.exportXlsx(workbook);
const xlsxPath=path.join(outputDir,'Seafood_Confidential_Sprint_Workbook.xlsx');
await exported.save(xlsxPath);
const verification={created_at:'2026-11-17',sheets:Object.keys(sheets),tickets:tickets.length,weeks:weeks.length,sprint_low:value(sheets.Sprint,'G8'),sprint_high:value(sheets.Sprint,'H8'),vendor_base:value(sheets.Costs,'F6'),monthly_low:value(sheets.Costs,'F7'),monthly_high:value(sheets.Costs,'G7'),annual_upfront:value(sheets.Costs,'H6'),input_mutation_tests:'Passed and restored, including actual zero versus blank',engine:'Artifact Tool',native_excel_execution:'Not performed'};
await fs.writeFile(path.join(outputDir,'verification.json'),JSON.stringify(verification,null,2));
await fs.writeFile(path.join(kit,'planning/WORKBOOK_DECISIONS.json'),JSON.stringify({status:'Proposed',columns:['id','decision','owner','choice','status','needed_by','dependency'],decisions},null,2));
console.log(JSON.stringify({file:xlsxPath,verification}));
