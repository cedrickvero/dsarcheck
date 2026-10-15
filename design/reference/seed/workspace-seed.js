// Extracted verbatim from DSAR Workspace.dc.html. Seed data, enums, color maps and pure helpers (sla, progress, checks, respText).
// "Today" in the prototype is fixed at 13 Oct 2026 (NOW). Replace with real time in production.
const NOW=new Date(2026,9,13);
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pd=iso=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d);};
const fmt=dt=>dt.getDate()+' '+MON[dt.getMonth()]+' '+dt.getFullYear();
const fmtS=dt=>dt.getDate()+' '+MON[dt.getMonth()];
const addM=(dt,n)=>{const r=new Date(dt);r.setMonth(r.getMonth()+n);return r;};
const addD=(dt,n)=>{const r=new Date(dt);r.setDate(r.getDate()+n);return r;};
const diff=(a,b)=>Math.round((b-a)/86400000);
const T={gray:['#EEF1F4','#344054'],info:['#D9E8FF','#175CD3'],teal:['#D7F0EF','#0A6463'],warn:['#FDF0DC','#B54708'],ok:['#D9F2E7','#0E6B4D'],bad:['#FEE4E2','#B42318']};
const pill=(label,tone,icon)=>({label,bg:T[tone][0],fg:T[tone][1],icon:'icon-'+icon});
const STATUS={'New':['gray','circle-dashed'],'Verifying':['info','shield'],'In progress':['teal','circle-dot'],'Awaiting approval':['warn','lock'],'Completed':['ok','circle-check'],'Extended':['info','calendar-clock'],'Rejected':['bad','circle-x']};
const CHK={'Not started':['gray','circle'],'In progress':['teal','circle-dot'],'Completed':['ok','circle-check'],'Not found':['gray','search-x'],'Action required':['warn','triangle-alert'],'Retained under exception':['info','archive']};
const OUT={'Deleted':['ok','trash-2'],'Suppressed / anonymized':['teal','eye-off'],'Retained under exception':['info','archive'],'Not found':['gray','search-x'],'Action required':['warn','triangle-alert']};
const OUTSTATUS={'Deleted':'Completed','Suppressed / anonymized':'Completed','Retained under exception':'Retained under exception','Not found':'Not found','Action required':'Action required'};
const RISK={Low:['ok','shield-check'],Medium:['warn','shield-alert'],High:['bad','shield-x']};
const MATCH={'Match':['ok','circle-check'],'Partial':['warn','circle-alert'],'No match':['bad','circle-x']};
const EMAILV={'Confirmed':['ok','mail-check'],'Pending':['gray','mail']};
const P=(map,k,suffix)=>pill(k+(suffix||''),map[k][0],map[k][1]);
const SYS=[
 {key:'pg',name:'Production database',sub:'PostgreSQL',owner:'Ravi Menon',method:'SQL query by user ID and email',ev:'JSON export',sla:7,ins:'Run the saved query dsar_lookup.sql on the read replica using the customer ID and email. Export the result as JSON. Exclude password hashes and session tokens.'},
 {key:'stripe',name:'Stripe',sub:'Billing',owner:'Ana Costa',method:'Dashboard search by email',ev:'PDF of customer record',sla:7,ins:'Search customers by email. Save the customer record, invoice list and payment-method summary as PDF.'},
 {key:'hubspot',name:'HubSpot',sub:'CRM',owner:'Leo Brandt',method:'Contact search by email',ev:'CSV export or not-found note',sla:7,ins:'Search contacts and companies by email and domain. Export contact properties and timeline as CSV.'},
 {key:'zendesk',name:'Zendesk',sub:'Support',owner:'Priya Shah',method:'Requester search and ticket export',ev:'PDF of tickets',sla:10,ins:'Find all tickets where the requester or CC matches. Export ticket threads as PDF for redaction review.'},
 {key:'intercom',name:'Intercom',sub:'Chat',owner:'Priya Shah',method:'User lookup and conversation export',ev:'JSON export',sla:10,ins:'Look up the user by email and user ID. Export conversations and user attributes.'},
 {key:'mixpanel',name:'Mixpanel',sub:'Analytics',owner:'Ravi Menon',method:'GDPR API by distinct_id',ev:'API response file',sla:10,ins:'Submit a GDPR retrieval or deletion task through the Mixpanel GDPR API using the distinct_id from the database export. Attach the API response.'},
 {key:'gws',name:'Google Workspace',sub:'Email',owner:'Daniel Okafor',method:'Vault search across mailboxes',ev:'Vault search summary',sla:14,ins:'Search Vault for the requester email and name across all mailboxes. Attach the search summary.'}
];
const SYSM=Object.fromEntries(SYS.map(x=>[x.key,x]));
const CODE={n:'Not started',i:'In progress',c:'Completed',f:'Not found',a:'Action required',r:'Retained under exception'};
const PEOPLE=[
 {name:'Priya Shah',email:'priya@lumen.io',role:'Request handler',mfa:true,last:'Active now'},
 {name:'Daniel Okafor',email:'daniel@lumen.io',role:'Approver / DPO',mfa:true,last:'12 min ago'},
 {name:'Ravi Menon',email:'ravi@lumen.io',role:'System owner',mfa:true,last:'1 hour ago'},
 {name:'Ana Costa',email:'ana@lumen.io',role:'System owner',mfa:false,last:'Yesterday'},
 {name:'Leo Brandt',email:'leo@lumen.io',role:'System owner',mfa:true,last:'3 days ago'},
 {name:'Mara Voss',email:'mara@northlight.eu',role:'Workspace admin (agency)',mfa:true,last:'Active now'}
];
const CLIENTS=[
 {key:'lumen',name:'Lumen Analytics',initial:'L',domain:'privacy.lumen.io',email:'privacy@lumen.io',avg:'9.4 days',sender:'Lumen Analytics Privacy'},
 {key:'fernwood',name:'Fernwood Commerce',initial:'F',domain:'privacy.fernwood.shop',email:'privacy@fernwood.shop',avg:'12.1 days',sender:'Fernwood Privacy Team'},
 {key:'kesto',name:'Kesto Health',initial:'K',domain:'requests.kesto.fi',email:'tietosuoja@kesto.fi',avg:'15.8 days',sender:'Kesto Data Protection'},
 {key:'ardent',name:'Ardent Labs',initial:'A',domain:'privacy.ardentlabs.io',email:'privacy@ardentlabs.io',avg:'7.2 days',sender:'Ardent Labs Privacy'}
];
const TEMPLATES=['Access — data copy enclosed','Erasure — confirmation of outcomes','Portability — machine-readable export','Rectification — changes made','Objection — processing stopped','Refusal — documented reason'];
const REDCATS=['Name','Email','Phone number','ID number','Third-party personal data','Confidential free-text note'];
const EXCATS=['Legal obligation — tax and accounting','Establishment or defence of legal claims','Fraud prevention','Other documented exception'];
const META='IP 81.2.69.142 · session 7f3a';
const A=(t,actor,action,cat,reason,obj)=>({t,actor,action,cat,reason:reason||'',obj:obj||'',meta:actor==='System'?'Automated':(actor.indexOf('requester')>-1?'IP 85.230.12.4 · portal':META)});
const DOC=[
 {kind:'h',segs:['Ticket #48213 · Billing question about annual plan']},
 {kind:'meta',segs:['From: Maya Lindqvist <maya.lindqvist@fjordmail.se> · 2 Oct 2026, 08:14']},
 {kind:'p',segs:['Hi, I am writing about our team account. My colleague ',{t:'t1'},' set up the workspace and his card was charged twice. You can reach him on ',{t:'t2'},' or ',{t:'t3'},'.']},
 {kind:'meta',segs:['Reply from ',{t:'t4'},' (Lumen Support) · 2 Oct 2026, 10:02']},
 {kind:'p',segs:['Thanks Maya. I have refunded the duplicate charge of €348 to the card ending 4417. It should appear within 5 business days.']},
 {kind:'note',segs:['Internal note: ',{t:'t5'}]}
];
function mk(o){
 const rec=pd(o.received);
 const short=o.id.slice(-5);
 const systems=SYS.map((x,i)=>({key:x.key,owner:x.owner,status:CODE[(o.chk||'nnnnnnn')[i]],due:fmtS(addD(rec,x.sla)),evidence:[],comments:[],outcome:null,reason:'',exCat:'',outDate:''}));
 const c=Object.assign({type:'Access',status:'In progress',owner:'Priya Shah',approver:'Daniel Okafor',priority:'Normal',risk:'Low',emailV:'Confirmed',idMatch:'Match',idMatchNote:'Email and customer ID match an active account.',idDoc:false,idVerified:true,idDecision:null,extMonths:0,files:[],tokens:[],redLog:[],redReview:'none',exportDone:false,docOpened:false,template:'',approvals:[],comms:[],audit:[],packs:[],notes:[],details:'',revealed:false,closed:'',closedMonth:false,responseSent:false,ident:'',infoRequested:false},o);
 delete c.chk; c.systems=systems;
 systems.forEach(x=>{
  const s=SYSM[x.key];
  if(x.status==='Completed'||x.status==='Retained under exception'){const f=x.key+'_export_'+short+'.'+(x.key==='stripe'?'pdf':'json');x.evidence=[f];c.files.push({id:x.key,name:f,type:x.key==='stripe'?'PDF':'JSON',size:'24 KB',by:x.owner,at:fmtS(addD(rec,5))+' 2026, 14:10',sys:s.name});}
  if(x.status==='Not found') x.reason='No matching records for email or customer ID.';
  if(x.status==='Retained under exception'){x.reason='Invoices retained under statutory accounting obligation.';x.exCat=EXCATS[0];}
 });
 if(!c.audit.length){
  c.audit=[A(fmt(rec)+', 09:00','System','Request received via intake form','Intake','','Case '+c.id),A(fmt(rec)+', 09:01','System','Confirmation email sent','Communications','','We received your data request')];
  if(c.idVerified){c.audit.push(A(fmt(rec)+', 11:20',c.owner,'Identity approved','Identity','Email confirmed and account identifier matches.'));c.audit.push(A(fmt(rec)+', 11:21','System','Checklist generated (7 systems)','Checklist'));c.idDecision={by:c.owner,at:fmt(rec)+', 11:20',reason:'Email confirmed and account identifier matches.'};}
 }
 if(!c.comms.length) c.comms=[{at:fmt(rec)+', 09:01',dir:'Outbound',subject:'We received your data request',ch:'Email'}];
 return c;
}
const RESERVED=['google','apple','microsoft','amazon','meta','facebook','paypal','stripe','admin','www','api','app','status','support','help','login','mail','privacyspace'];
const TAKEN=['acme','nova','privacy','dsar','gdpr'];
const PTYPES=['Access','Erasure','Portability','Rectification','Objection','Restriction'];
const PJUR=[['gdpr','EU GDPR','30 days'],['uk','UK GDPR','1 month'],['ccpa','CCPA / CPRA','45 days']];
const PID=['Email confirmation only','Email confirmation + customer ID','Email + ID document for high-risk requests'];
function seedPortal(){
 const base=o=>Object.assign({sub:'',subInput:'',subStatus:'none',subMatch:false,subMsg:'',subTone:'',brandOk:false,rulesOk:false,types:{Access:true,Erasure:true,Portability:true,Rectification:true,Objection:true,Restriction:false},jur:{gdpr:true,uk:false,ccpa:false},idLevel:PID[1],live:false,published:false,cdDomain:'',cdStatus:'none',mailStatus:'none',log:[]},o);
 return {
  lumen:base({sub:'lumen',subInput:'lumen',subStatus:'claimed',subMatch:true,brandOk:true,cdDomain:'privacy.lumen.io',log:[['12 Oct 2026, 16:02','Sara Lind','Branding confirmed'],['12 Oct 2026, 15:48','Sara Lind','Subdomain lumen.privacyspace.com claimed · matches verified domain lumen.io']]}),
  fernwood:base({sub:'fernwood',subInput:'fernwood',subStatus:'claimed',subMatch:true,brandOk:true,rulesOk:true,live:true,published:true,cdDomain:'privacy.fernwood.shop',cdStatus:'verified',mailStatus:'verified',jur:{gdpr:true,uk:true,ccpa:false},log:[['3 Jun 2026, 11:20','Mara Voss','Link confirmed on privacy policy and website footer'],['2 Jun 2026, 10:15','Mara Voss','Portal went live']]}),
  kesto:base({cdDomain:'requests.kesto.fi'}),
  ardent:base({sub:'ardent',subInput:'ardent',subStatus:'claimed',subMatch:true,brandOk:true,rulesOk:true,live:true,cdDomain:'privacy.ardentlabs.io',cdStatus:'pending',jur:{gdpr:true,uk:false,ccpa:true},log:[['8 Oct 2026, 09:41','Mara Voss','Custom domain privacy.ardentlabs.io added · waiting for DNS'],['8 Oct 2026, 09:30','Mara Voss','Portal went live']]})
 };
}
function seed(){
 const L=[];
 const m418=mk({id:'DSAR-2026-00418',client:'lumen',type:'Access',name:'Maya Lindqvist',email:'maya.lindqvist@fjordmail.se',ident:'Customer ID C-20931',received:'2026-09-24',chk:'ccfcini',details:'Please send me a copy of all personal data you hold about me, including support conversations and billing records, and tell me who it has been shared with.',
  audit:[A('24 Sep 2026, 09:12','System','Request received via intake form','Intake','','Case DSAR-2026-00418'),A('24 Sep 2026, 09:12','System','Confirmation email sent','Communications','','We received your data request'),A('24 Sep 2026, 09:31','Maya Lindqvist (requester)','Email address confirmed','Identity'),A('24 Sep 2026, 11:05','Priya Shah','Identity approved','Identity','Email confirmed; customer ID C-20931 matches the account email.'),A('24 Sep 2026, 11:06','System','Checklist generated (7 systems)','Checklist'),A('24 Sep 2026, 11:10','Priya Shah','Tasks assigned to 5 owners','Checklist'),A('29 Sep 2026, 14:22','Ravi Menon','Production database marked Completed','Checklist','','users_export_00418.json'),A('30 Sep 2026, 10:03','Ana Costa','Stripe marked Completed','Checklist','','stripe_customer_00418.pdf'),A('1 Oct 2026, 16:40','Leo Brandt','HubSpot marked Not found','Checklist','No contact record for email or customer ID.'),A('6 Oct 2026, 09:15','Priya Shah','Zendesk marked Completed','Checklist','','zendesk_tickets_00418.pdf'),A('8 Oct 2026, 09:00','System','Day 14 reminder sent to Intercom, Mixpanel and Google Workspace owners','Communications')],
  comms:[{at:'24 Sep 2026, 09:12',dir:'Outbound',subject:'We received your data request',ch:'Email'},{at:'24 Sep 2026, 09:31',dir:'Inbound',subject:'Email address confirmed',ch:'Portal'}],
  idDecision:{by:'Priya Shah',at:'24 Sep 2026, 11:05',reason:'Email confirmed; customer ID C-20931 matches the account email.'},
  notes:[{by:'Priya Shah',at:'6 Oct 2026, 09:20',text:'Zendesk ticket #48213 contains a colleague’s contact details. Redact before release.'}]});
 m418.files=[{id:'zendesk',name:'zendesk_tickets_00418.pdf',type:'PDF',size:'184 KB',by:'Priya Shah',at:'6 Oct 2026, 09:14',sys:'Zendesk',needsRed:true},{id:'pg',name:'users_export_00418.json',type:'JSON',size:'12 KB',by:'Ravi Menon',at:'29 Sep 2026, 14:21',sys:'Production database'},{id:'stripe',name:'stripe_customer_00418.pdf',type:'PDF',size:'96 KB',by:'Ana Costa',at:'30 Sep 2026, 10:02',sys:'Stripe'}];
 m418.systems[0].evidence=['users_export_00418.json'];m418.systems[1].evidence=['stripe_customer_00418.pdf'];m418.systems[3].evidence=['zendesk_tickets_00418.pdf'];m418.systems[2].reason='No contact record for email or customer ID.';
 m418.systems[4].comments=[{by:'Priya Shah',at:'11 Oct',text:'Export running. Long conversation history, expect it tomorrow.'}];
 m418.tokens=[{id:'t1',text:'Erik Sandström',cat:'Third-party personal data',flag:true,red:false},{id:'t2',text:'+46 70 555 0142',cat:'Phone number',flag:true,red:false},{id:'t3',text:'erik.sandstrom@nordvik.se',cat:'Email',flag:true,red:false},{id:'t4',text:'Tom Becker',cat:'Name',flag:false,red:false},{id:'t5',text:'Customer mentioned a possible chargeback. Leo to review the account for churn risk before the renewal call.',cat:'Confidential free-text note',flag:true,red:false}];
 L.push(m418);
 const m412=mk({id:'DSAR-2026-00412',client:'lumen',type:'Erasure',name:'Jonas Weber',email:'jonas.weber@posteo.de',ident:'Customer ID C-18822',received:'2026-09-16',chk:'crcccaf',priority:'High',details:'Please delete my account and all personal data you hold. I no longer use the service.'});
 const outs=[['Deleted','User row and related records hard-deleted via admin script.','2 Oct'],['Retained under exception','Invoices retained 10 years under German Fiscal Code §147 AO. Customer object stripped of non-required fields.','3 Oct'],['Deleted','Contact deleted and removed from 2 marketing lists.','3 Oct'],['Suppressed / anonymized','Requester anonymized using Zendesk redaction. Ticket metadata kept for reporting.','6 Oct'],['Deleted','User and conversations deleted.','6 Oct'],['Action required','Deletion API job returned error 429 (rate limit). Retry required.','9 Oct'],['Not found','Vault search returned no matching messages.','4 Oct']];
 m412.systems.forEach((x,i)=>{x.outcome=outs[i][0];x.reason=outs[i][1];x.outDate=outs[i][2];if(i===1)x.exCat=EXCATS[0];if(i===0)x.evidence=['deletion_log_00412.txt'];if(i===2||i===4)x.evidence=[x.key+'_deletion_00412.pdf'];if(i===3)x.evidence=['zendesk_redaction_00412.pdf'];if(i===1)x.evidence=['stripe_retention_00412.pdf'];});
 m412.files=m412.systems.filter(x=>x.evidence.length).map(x=>({id:x.key,name:x.evidence[0],type:x.evidence[0].split('.').pop().toUpperCase(),size:'8 KB',by:x.owner,at:x.outDate+' 2026, 15:00',sys:SYSM[x.key].name}));
 m412.audit.push(A('9 Oct 2026, 13:40','Ravi Menon','Mixpanel outcome recorded as Action required','Erasure','Deletion API job returned error 429 (rate limit). Retry required.'));
 L.push(m412);
 L.push(mk({id:'DSAR-2026-00409',client:'lumen',type:'Portability',name:'Amara Okoye',email:'amara.okoye@mailbox.org',ident:'Email',received:'2026-09-13',chk:'ccfcccf',status:'Awaiting approval',template:TEMPLATES[2],redReview:'done',exportDone:true,details:'Please provide my data in a machine-readable format so I can move to another provider.'}));
 L.push(mk({id:'DSAR-2026-00405',client:'lumen',type:'Access',name:'Lucas Moreau',email:'lucas.moreau@orange.fr',ident:'Customer ID C-17140',received:'2026-09-11',chk:'cciannn',owner:'Priya Shah',priority:'High',details:'I want to know what data you have about me and why.'}));
 L.push(mk({id:'DSAR-2026-00421',client:'lumen',type:'Erasure',name:'Sofia Rinaldi',email:'sofia.rinaldi@libero.it',ident:'Email',received:'2026-10-08',status:'Verifying',risk:'Medium',idMatch:'Partial',idMatchNote:'Email matches an account, but the account name is “S. Rinaldi-Conti”.',idVerified:false,details:'Delete all my data, including newsletter subscriptions.'}));
 L.push(mk({id:'DSAR-2026-00423',client:'lumen',type:'Objection',name:'Henrik Dahl',email:'henrik.dahl@outlook.dk',ident:'Customer ID C-21877',received:'2026-10-12',status:'New',emailV:'Pending',idVerified:false,details:'I object to my usage data being used for product analytics.'}));
 L.push(mk({id:'DSAR-2026-00424',client:'lumen',type:'Erasure',name:'Karl Marsh',email:'k.marsh.privacy@proton.me',ident:'Account email karl@marsh-design.co.uk',received:'2026-10-11',status:'Verifying',risk:'High',idMatch:'No match',idMatchNote:'Submitting email has no account. The supplied account email belongs to a different, active customer.',idDoc:true,idVerified:false,priority:'High',details:'Delete everything connected to karl@marsh-design.co.uk immediately.'}));
 L.push(mk({id:'DSAR-2026-00425',client:'lumen',type:'Access',name:'Ines Duarte',email:'ines.duarte@sapo.pt',ident:'Customer ID C-22104',received:'2026-10-13',status:'Verifying',idVerified:false,details:'Copy of my personal data, please.'}));
 L.push(mk({id:'DSAR-2026-00402',client:'lumen',type:'Access',name:'Tomás Herrera',email:'t.herrera@gmx.es',ident:'Customer ID C-15520',received:'2026-09-05',chk:'cccinnn',status:'Extended',extMonths:2,details:'Full copy of my data including call recordings.'}));
 L.push(mk({id:'DSAR-2026-00398',client:'lumen',type:'Rectification',name:'Elena Petrova',email:'elena.petrova@yandex.com',ident:'Customer ID C-19011',received:'2026-09-02',chk:'cfcfccf',status:'Completed',closed:'2 Oct',closedMonth:true,template:TEMPLATES[3],packs:[{v:1,at:'2 Oct 2026, 16:20',by:'Daniel Okafor',draft:false}],details:'My billing address is wrong. Please correct it.'}));
 L.push(mk({id:'DSAR-2026-00395',client:'lumen',type:'Erasure',name:'Noah Fischer',email:'nf.request@tutanota.com',ident:'Email',received:'2026-08-28',status:'Rejected',idVerified:false,closed:'4 Sep',risk:'High',idMatch:'No match',details:'Delete account.'}));
 L.push(mk({id:'DSAR-2026-00117',client:'fernwood',type:'Access',name:'Ruth Abernathy',email:'ruth.a@btinternet.com',received:'2026-09-15',chk:'ccinnnn'}));
 L.push(mk({id:'DSAR-2026-00119',client:'fernwood',type:'Erasure',name:'Pablo Ortega',email:'p.ortega@telefonica.net',received:'2026-10-02',status:'Verifying',risk:'High',idMatch:'Partial',idVerified:false}));
 L.push(mk({id:'DSAR-2026-00061',client:'kesto',type:'Access',name:'Liisa Korhonen',email:'liisa.korhonen@elisa.fi',received:'2026-09-10',chk:'ccccfcc',status:'Awaiting approval',template:TEMPLATES[0],redReview:'done',exportDone:true}));
 L.push(mk({id:'DSAR-2026-00064',client:'kesto',type:'Erasure',name:'Mikko Laine',email:'mikko.laine@kolumbus.fi',received:'2026-10-05',chk:'cacnnnn'}));
 L.push(mk({id:'DSAR-2026-00033',client:'ardent',type:'Portability',name:'Grace Lin',email:'grace.lin@fastmail.com',received:'2026-09-29',chk:'cccccni'}));
 return L;
}
function sla(c){
 if(c.status==='Completed'||c.status==='Rejected') return {label:'Closed '+(c.closed||''),fg:'#475467',bg:'#EEF1F4',bar:'#98A2B3',pct:100,icon:'icon-circle-check',risk:'Closed',deadline:'—',left:999,open:false};
 const rec=pd(c.received);const dl=addM(rec,1+(c.extMonths||0));const left=diff(NOW,dl);const total=diff(rec,dl);
 const pct=Math.min(100,Math.max(4,Math.round((total-Math.max(left,0))/total*100)));
 let o;
 if(left<0) o={label:'Overdue by '+(-left)+(left===-1?' day':' days'),fg:'#B42318',bg:'#FEE4E2',bar:'#B42318',icon:'icon-circle-alert',risk:'Overdue'};
 else if(left===0) o={label:'Due today',fg:'#B54708',bg:'#FDF0DC',bar:'#B54708',icon:'icon-triangle-alert',risk:'Strong warning'};
 else if(left<=7) o={label:left+(left===1?' day':' days')+' left',fg:'#B54708',bg:'#FDF0DC',bar:'#DC6803',icon:'icon-clock',risk:'Due soon'};
 else o={label:left+' days left',fg:'#344054',bg:'#EEF1F4',bar:'#0E7C7B',icon:'icon-clock',risk:c.extMonths?'Extended':'On track'};
 return Object.assign(o,{pct:left<0?100:pct,deadline:fmt(dl),deadlineS:fmtS(dl),left,open:true,received:fmt(rec)});
}
function progress(c){const done=c.systems.filter(x=>['Completed','Not found','Retained under exception'].includes(x.status)).length;return {done,total:c.systems.length,label:done+' of '+c.systems.length,pct:Math.round(done/c.systems.length*100)};}
function checks(c){
 const er=c.type==='Erasure';
 const open=c.systems.filter(x=>x.status==='Not started'||x.status==='In progress'||(!er&&x.status==='Action required'));
 const needEv=c.systems.filter(x=>(x.status==='Completed'||x.status==='Retained under exception')&&!x.evidence.length);
 const act=c.systems.filter(x=>x.status==='Action required');
 const ret=c.systems.filter(x=>x.status==='Retained under exception');
 const unred=c.tokens.filter(t=>t.flag&&!t.red).length;
 const it=[
  {k:'id',label:'Identity verified',ok:c.idVerified,detail:c.idVerified?'Decision recorded by '+(c.idDecision?c.idDecision.by:c.owner):'Identity decision pending',tab:'identity'},
  {k:'sys',label:'All systems searched',ok:!open.length,detail:open.length?open.length+' of '+c.systems.length+' systems still open':c.systems.length+' of '+c.systems.length+' systems searched',tab:'checklist'},
  {k:'ev',label:'Evidence attached',ok:!needEv.length,detail:needEv.length?needEv.length+' systems missing evidence':'Evidence on every completed system',tab:'checklist'}
 ];
 if(er) it.push({k:'er',label:'Erasure outcomes resolved',ok:!act.length&&!open.length,detail:act.length?act.length+(act.length===1?' system requires action':' systems require action'):(open.length?'Outcomes not yet recorded':'No systems in Action required'),tab:'work'});
 else it.push({k:'red',label:'Redaction reviewed',ok:!c.tokens.length||(c.redReview==='done'&&c.exportDone),detail:!c.tokens.length?'No files require redaction':unred?unred+' flagged items not yet redacted':c.redReview!=='done'?(c.redReview==='requested'?'Review requested, not completed':'Review not requested'):!c.exportDone?'Final redacted export not generated':'Reviewed and exported',tab:'work'});
 it.push({k:'tpl',label:'Response template selected',ok:!!c.template,detail:c.template||'No template selected',tab:'approval'});
 it.push({k:'exc',label:'Exceptions documented',ok:ret.every(x=>x.reason&&x.exCat),detail:ret.length?ret.length+' retention exception'+(ret.length>1?'s':'')+' with reason':'No exceptions recorded',tab:er?'work':'checklist'});
 return it;
}
function respText(c,client){
 const first=c.name.split(' ')[0];const rec=fmt(pd(c.received));const sign='\n\n'+client.sender;
 const t=c.template||'';
 if(t.startsWith('Erasure')){
  const g=k=>c.systems.filter(x=>x.outcome===k).map(x=>SYSM[x.key].name).join(', ');
  const lines=[['Deleted',g('Deleted')],['Anonymized',g('Suppressed / anonymized')],['Retained under legal obligation',g('Retained under exception')],['No data found',g('Not found')]].filter(x=>x[1]).map(x=>'• '+x[0]+': '+x[1]).join('\n');
  return 'Dear '+first+',\n\nWe have completed your erasure request received on '+rec+' (reference '+c.id+').\n\nThe outcome in each system we checked:\n'+lines+'\n\nWhere we keep data under a legal obligation, we keep only what that obligation requires and delete it when the retention period ends.\n\nIf you have questions, reply to this email quoting '+c.id+'.'+sign;
 }
 if(t.startsWith('Refusal')) return 'Dear '+first+',\n\nWe are unable to complete your request received on '+rec+' (reference '+c.id+') for the reason set out below.\n\n[Documented reason]\n\nYou have the right to complain to a supervisory authority.'+sign;
 if(!t) return 'Select a response template to preview the message.';
 return 'Dear '+first+',\n\nWe have completed your '+c.type.toLowerCase()+' request received on '+rec+' (reference '+c.id+').\n\nWe searched '+c.systems.length+' systems where your data may be held. Your documents are available in your secure request portal. The download link expires 7 days after it is first opened.\n\nSome information has been removed because it relates to other people or contains confidential internal notes.\n\nIf you have questions, reply to this email quoting '+c.id+'.'+sign;
}
const stop=e=>e.stopPropagation();


export { NOW, T, STATUS, CHK, OUT, OUTSTATUS, RISK, MATCH, EMAILV, SYS, SYSM, PEOPLE, CLIENTS, TEMPLATES, REDCATS, EXCATS, DOC, RESERVED, TAKEN, PTYPES, PJUR, PID, mk, seed, seedPortal, sla, progress, checks, respText };
