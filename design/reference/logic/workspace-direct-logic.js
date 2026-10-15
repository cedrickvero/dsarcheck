// Verbatim logic class from DSAR Workspace Single Company.dc.html (direct org variant, includes Settings › Billing & usage).
class Component extends DCLogic {
 state={
  screen:['intake','email'].includes(this.props.startScreen)?'cases':(this.props.startScreen||'cases'),client:'lumen',caseId:'DSAR-2026-00418',tab:'overview',
  role:this.props.defaultRole||'Handler',cases:seed(),clock:10*60+42,nextId:426,
  view:'all',search:'',fType:'All',fStatus:'All',sel:{},
  vqSel:'DSAR-2026-00424',vqFilter:'all',vqNote:'',
  expanded:null,clSel:{},sysErr:null,commentDraft:'',noteDraft:'',
  fileSel:'zendesk',selTok:null,redCat:'',redReason:'',redErr:'',
  auditFilter:'All',railOpen:true,wsOpen:false,modal:null,toast:null,
  ik:{type:'Access',name:'',email:'',identKind:'Customer ID',ident:'',details:'',consent:false,human:false},ikErr:{},ikDone:null,ikTried:false,
  settingsTab:'team',mfa:true,reminders:[1,7,14,21,28,30],extReview:true,autoSend:false,srcActive:{pg:true,stripe:true,hubspot:true,zendesk:true,intercom:true,mixpanel:true,gws:true},
  clientsTab:'setup',portal:seedPortal(),brandColor:null,poweredBy:true
 };
 componentWillUnmount(){clearTimeout(this._t);}
 actor(s){return (s||this.state).role==='Approver'?'Daniel Okafor':'Priya Shah';}
 stamp(clock){const h=Math.floor(clock/60),m=clock%60;return '13 Oct 2026, '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
 show(msg){this.setState({toast:msg});clearTimeout(this._t);this._t=setTimeout(()=>this.setState({toast:null}),4000);}
 go(screen){this.setState({screen,wsOpen:false});if(typeof window!=='undefined')window.scrollTo(0,0);}
 openCase(id,tab){this.setState({screen:'cockpit',caseId:id,tab:tab||'overview',expanded:null,clSel:{},selTok:null,fileSel:'zendesk'});window.scrollTo(0,0);}
 upd(id,fn){
  this.setState(s=>{
   const t=this.stamp(s.clock);const actor=this.actor(s);
   const cases=s.cases.map(c=>{if(c.id!==id)return c;const n=JSON.parse(JSON.stringify(c));const log=(action,cat,reason,obj,who)=>n.audit.push({t,actor:who||actor,action,cat,reason:reason||'',obj:obj||'',meta:who==='System'?'Automated':META});fn(n,log,t,actor);return n;});
   return {cases,clock:s.clock+1};
  });
 }
 modal(cfg){this.setState({modal:Object.assign({reason:'',option:null,category:null,err:''},cfg)});}
 confirmModal(){
  const m=this.state.modal;if(!m)return;
  if(m.options&&!m.option)return this.setState({modal:{...m,err:'Select '+(m.optionLabel||'an option').toLowerCase()+'.'}});
  if(m.catFor&&m.option===m.catFor&&!m.category)return this.setState({modal:{...m,err:'Select an exception category.'}});
  if(!m.reasonOptional&&m.reason.trim().length<3)return this.setState({modal:{...m,err:'A reason is required. It is stored in the audit log.'}});
  this.setState({modal:null});m.onConfirm(m.reason.trim(),m.option,m.category);
 }
 // identity
 idApprove(id){const c=this.find(id);this.modal({title:'Approve identity',desc:'Fulfillment starts once identity is approved. The checklist of 7 systems is generated and tasks are assigned to owners.',confirmLabel:'Approve identity',action:'Identity approved · '+id,reasonLabel:'Reason for approval',placeholder:'e.g. Email confirmed and customer ID matches the account',onConfirm:(r)=>{this.upd(id,(n,log,t,actor)=>{n.idVerified=true;n.idDecision={by:actor,at:t,reason:r};if(n.status==='New'||n.status==='Verifying')n.status='In progress';log('Identity approved','Identity',r);log('Checklist generated (7 systems)','Checklist','','', 'System');n.verifiedToday=true;});this.show('Identity approved for '+id+'. Checklist generated.');}});}
 idInfo(id){this.modal({title:'Request more information',desc:'The requester receives a secure portal message. The SLA keeps running while you wait.',confirmLabel:'Send request',action:'More information requested · '+id,options:['Additional account identifier','Proof of address','Government ID (masked)'],optionLabel:'What to request',reasonLabel:'Reason (shared internally only)',placeholder:'Why the current evidence is insufficient',onConfirm:(r,o)=>{this.upd(id,(n,log,t)=>{n.status='Verifying';n.infoRequested=true;log('More information requested: '+o,'Identity',r);n.comms.push({at:t,dir:'Outbound',subject:'We need more information to verify your identity',ch:'Portal'});});this.show('Information request sent to requester.');}});}
 idReject(id){this.modal({title:'Reject request',danger:true,desc:'The case closes as Rejected and the requester is told why. This cannot be undone without reopening the case.',confirmLabel:'Reject request',action:'Request rejected · '+id,reasonLabel:'Documented reason for rejection',placeholder:'e.g. Identity could not be verified after two information requests',onConfirm:(r)=>{this.upd(id,(n,log,t)=>{n.status='Rejected';n.closed='13 Oct';n.idDecision={by:this.actor(),at:t,reason:r,rejected:true};log('Request rejected','Identity',r);n.comms.push({at:t,dir:'Outbound',subject:'Your request could not be completed',ch:'Email'});});this.show(id+' rejected. Reason recorded.');}});}
 find(id){return this.state.cases.find(c=>c.id===id);}
 setSys(id,key,st){
  const c=this.find(id);const sys=c.systems.find(x=>x.key===key);const nm=SYSM[key].name;
  if(st==='Completed'&&!sys.evidence.length)return this.setState({sysErr:key});
  this.setState({sysErr:null});
  if(st==='In progress'||st==='Completed')return this.upd(id,(n,log)=>{n.systems.find(x=>x.key===key).status=st;log(nm+' marked '+st,'Checklist');});
  this.modal({title:'Mark '+nm+' as '+st,desc:st==='Retained under exception'?'Retention requires a documented exception. It appears in the evidence pack and must be reviewed by the approver.':'This status change is recorded with your reason.',confirmLabel:'Record status',action:nm+' marked '+st,options:st==='Retained under exception'?null:null,cats:st==='Retained under exception'?EXCATS:null,catAlways:st==='Retained under exception',reasonLabel:'Reason',placeholder:st==='Not found'?'e.g. No records for email or customer ID':'Describe what was found and why',onConfirm:(r,o,cat)=>{this.upd(id,(n,log)=>{const x=n.systems.find(y=>y.key===key);x.status=st;x.reason=r;if(cat)x.exCat=cat;log(nm+' marked '+st,'Checklist',r);});}});
 }
 attach(id,key){this.upd(id,(n,log,t,actor)=>{const x=n.systems.find(y=>y.key===key);const f=key+'_export_'+id.slice(-5)+(x.evidence.length?'_'+(x.evidence.length+1):'')+'.json';x.evidence.push(f);n.files.push({id:key+x.evidence.length,name:f,type:'JSON',size:'31 KB',by:actor,at:t,sys:SYSM[key].name});log('Evidence uploaded','Checklist','',f);});this.setState({sysErr:null});this.show('Evidence attached. Stored encrypted with a signed, expiring link.');}
 outcome(id,key){
  const c=this.find(id);const x=c.systems.find(y=>y.key===key);const nm=SYSM[key].name;
  this.modal({title:'Record outcome · '+nm,desc:'Deletion, suppression and retention are recorded separately in the evidence pack. Retention requires a documented exception.',confirmLabel:'Record outcome',action:nm+' outcome recorded',options:Object.keys(OUT),optionLabel:'Outcome',option:x.outcome,cats:EXCATS,catFor:'Retained under exception',reasonLabel:'Reason',placeholder:'What was done in this system, and how it was verified',onConfirm:(r,o,cat)=>{this.upd(id,(n,log,t)=>{const y=n.systems.find(z=>z.key===key);y.outcome=o;y.reason=r;y.status=OUTSTATUS[o];y.outDate='13 Oct';if(cat&&o==='Retained under exception')y.exCat=cat;if(o!=='Action required'&&!y.evidence.length){const f=key+'_outcome_'+id.slice(-5)+'.pdf';y.evidence.push(f);n.files.push({id:key+'o',name:f,type:'PDF',size:'6 KB',by:this.actor(),at:t,sys:nm});}log(nm+' outcome recorded as '+o,'Erasure',r);});this.show(nm+': '+o+' recorded.');}});
 }
 extend(id){this.modal({title:'Extend deadline',desc:'GDPR allows up to two further months for complex or numerous requests. The requester must be told within the first month, with reasons.',confirmLabel:'Extend and notify requester',action:'Deadline extended · '+id,options:['+1 month','+2 months'],optionLabel:'Extension',reasonLabel:'Reason for extension',placeholder:'e.g. Large volume of support history across 3 systems',onConfirm:(r,o)=>{this.upd(id,(n,log,t)=>{n.extMonths=o==='+2 months'?2:1;n.status='Extended';log('Deadline extended '+o,'SLA',r);log('Extension notice sent to requester','Communications','','','System');n.comms.push({at:t,dir:'Outbound',subject:'We need more time to complete your request',ch:'Email'});});this.show('Deadline extended. Requester notified.');}});}
 sendForApproval(id){this.modal({title:'Send for approval',desc:'Daniel Okafor (Approver / DPO) is asked to review the case before closure.',confirmLabel:'Send for approval',action:'Sent for approval · '+id,reasonOptional:true,reasonLabel:'Note for approver (optional)',placeholder:'Anything the approver should check',onConfirm:(r)=>{this.upd(id,(n,log)=>{n.status='Awaiting approval';log('Sent for approval','Approval',r);});this.setState({tab:'approval'});this.show('Sent to Daniel Okafor for approval.');}});}
 approve(id){this.modal({title:'Approve and close',desc:'Your name and the time are recorded as the approver. The case closes and the evidence pack becomes final.',confirmLabel:'Approve and close',action:'Approved and closed · '+id,reasonLabel:'Approval note',placeholder:'e.g. Reviewed outcomes and retention exception; response is accurate',onConfirm:(r)=>{this.upd(id,(n,log,t,actor)=>{n.status='Completed';n.closed='13 Oct';n.closedMonth=true;n.approvals.push({by:actor,at:t,decision:'Approved',note:r});log('Case approved and closed','Approval',r);n.packs.push({v:n.packs.length+1,at:t,by:'System',draft:false});log('Evidence pack v'+n.packs.length+' generated','Evidence','','','System');});this.show('Approval recorded by Daniel Okafor. Evidence pack generated.');}});}
 requestChanges(id){this.modal({title:'Request changes',desc:'The case returns to In progress for the handler.',confirmLabel:'Request changes',action:'Changes requested · '+id,reasonLabel:'What needs to change',placeholder:'Be specific so the handler can act',onConfirm:(r)=>{this.upd(id,(n,log,t,actor)=>{n.status='In progress';n.approvals.push({by:actor,at:t,decision:'Changes requested',note:r});log('Changes requested','Approval',r);});}});}
 refuse(id){this.modal({title:'Reject with documented reason',danger:true,desc:'The request is refused and the case closes as Rejected. The requester must be told the reason and their right to complain.',confirmLabel:'Reject request',action:'Request refused · '+id,reasonLabel:'Documented reason',placeholder:'Legal basis and facts relied on',onConfirm:(r)=>{this.upd(id,(n,log,t,actor)=>{n.status='Rejected';n.closed='13 Oct';n.template=TEMPLATES[5];n.approvals.push({by:actor,at:t,decision:'Refused',note:r});log('Request refused','Approval',r);});}});}
 sendResp(id){this.modal({title:'Send response',desc:'The response is sent from '+CLIENTS.find(x=>x.key===this.state.client).email+' and attached to the evidence pack. Nothing is sent automatically.',confirmLabel:'Send response',action:'Response sent · '+id,reasonOptional:true,reasonLabel:'Internal note (optional)',placeholder:'',onConfirm:(r)=>{this.upd(id,(n,log,t)=>{n.responseSent=true;n.comms.push({at:t,dir:'Outbound',subject:'Your request is complete',ch:'Email'});log('Final response sent','Communications',r);});this.show('Response sent and logged.');}});}
 copyResp(c){try{navigator.clipboard.writeText(respText(c,CLIENTS.find(x=>x.key===c.client)));}catch(e){}this.upd(c.id,(n,log)=>log('Response copied for manual send','Communications'));this.show('Response copied. Logged as manual send.');}
 genPack(id){this.upd(id,(n,log,t,actor)=>{n.packs.push({v:n.packs.length+1,at:t,by:actor,draft:n.status!=='Completed'&&n.status!=='Rejected'});log('Evidence pack v'+n.packs.length+' generated','Evidence');});this.show('New evidence pack version generated. Earlier versions are kept.');}
 sharePack(id){this.modal({title:'Share signed link',desc:'Anyone with the link can download this evidence pack until it expires. Access is logged.',confirmLabel:'Create link',action:'Signed link created · '+id,options:['24 hours','7 days','30 days'],optionLabel:'Link expiry',option:'7 days',reasonLabel:'Recipient and purpose',placeholder:'e.g. External auditor review',onConfirm:(r,o)=>{this.upd(id,(n,log)=>log('Signed evidence link created (expires in '+o+')','Evidence',r));this.show('Link copied: https://'+CLIENTS[0].domain+'/e/'+id.slice(-5)+'-8f2c · expires in '+o);}});}
 dlPack(id,kind){this.upd(id,(n,log)=>log('Evidence pack '+kind+' downloaded','Evidence','','evidence_'+id+'_v'+n.packs.length+'.'+(kind==='ZIP'?'zip':'pdf')));this.show('evidence_'+id+'.'+(kind==='ZIP'?'zip':'pdf')+' prepared. Signed link expires in 24 hours.');}
 applyRed(id){
  const s=this.state;if(!s.redReason.trim()||s.redReason.trim().length<3)return this.setState({redErr:'A redaction reason is required.'});
  const tok=s.selTok,cat=s.redCat,reason=s.redReason.trim();
  this.upd(id,(n,log,t,actor)=>{const k=n.tokens.find(x=>x.id===tok);k.red=true;k.cat=cat;n.redLog.push({cat,snippet:k.text.slice(0,4)+'…',reason,by:actor,at:t});if(n.redReview==='done')n.redReview='none';log('Redaction applied ('+cat+')','Redaction',reason,'zendesk_tickets_00418.pdf');});
  this.setState({selTok:null,redReason:'',redErr:''});
 }
 submitIntake(){
  const k=this.state.ik;const e={};
  if(!k.name.trim())e.name='Enter your full name.';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email.trim()))e.email='Enter a valid email address, like name@example.com.';
  if(!k.ident.trim())e.ident='Enter an identifier so we can find your account.';
  if(!k.details.trim())e.details='Describe your request.';
  if(!k.consent)e.consent='You must agree before we can process your request.';
  if(!k.human)e.human='Complete the anti-spam check.';
  if(Object.keys(e).length)return this.setState({ikErr:e,ikTried:true});
  const id='DSAR-2026-00'+this.state.nextId;
  const c=mk({id,client:this.state.client,type:k.type,name:k.name.trim(),email:k.email.trim(),ident:k.identKind+' '+k.ident.trim(),received:'2026-10-13',status:'New',emailV:'Pending',idVerified:false,details:k.details.trim()});
  this.setState(s=>({cases:[c,...s.cases],nextId:s.nextId+1,ikDone:id,ikErr:{}}));
 }
 setIk(f,v){this.setState(s=>{const ik={...s.ik,[f]:v};const ikErr={...s.ikErr};delete ikErr[f];return {ik,ikErr};});}
 pset(key,fn,msg){this.setState(s=>{const p={...s.portal};const n=JSON.parse(JSON.stringify(p[key]));fn(n);if(msg)n.log.unshift([this.stamp(typeof s.clock==='number'?s.clock:600),this.actor(s),msg]);p[key]=n;return {portal:p};});}
 copyTxt(t){try{navigator.clipboard.writeText(t);}catch(e){}}
 checkSub(key,vdom,root){
  const s=this.state,p=s.portal[key],v=(p.subInput||'').trim().toLowerCase();
  const fail=m=>this.pset(key,n=>{n.subMsg=m;n.subTone='err';});
  if(!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(v))return fail('Use 3–30 lowercase letters, numbers or hyphens. It can’t start or end with a hyphen.');
  if(RESERVED.indexOf(v)>-1)return fail('“'+v+'” is reserved. Brand and system names are protected and can’t be claimed.');
  if(TAKEN.indexOf(v)>-1||Object.keys(s.portal).some(k=>k!==key&&s.portal[k].sub===v))return fail(v+'.privacyspace.com is already in use.');
  const match=v.length>=3&&(v.indexOf(root)>-1||root.indexOf(v)===0);
  if(match)this.pset(key,n=>{n.sub=v;n.subStatus='claimed';n.subMatch=true;n.subMsg='';},'Subdomain '+v+'.privacyspace.com claimed · matches verified domain '+vdom);
  else this.pset(key,n=>{n.sub=v;n.subStatus='review';n.subMatch=false;n.subTone='warn';n.subMsg=v+'.privacyspace.com doesn’t match your verified domain ('+vdom+'), so a person checks it before it’s released. This usually takes one business day.';},'Subdomain '+v+'.privacyspace.com submitted for review');
 }
 portalVals(s,client,brand){
  const key=client.key,p=s.portal[key],v={};
  const vdom=client.email.split('@')[1],root=vdom.split('.')[0];
  const sub=p.sub,subHost=sub?sub+'.privacyspace.com':'';
  const cdOk=p.cdStatus==='verified';
  const host=cdOk?p.cdDomain:(subHost||'');
  v.psHost=host||'Not set';v.psUrl=host?'https://'+host:'Claim a subdomain first';v.psSubHost=subHost;v.psRootDomain=vdom;
  const d1=p.subStatus==='claimed',d2=p.brandOk,d3=p.rulesOk,d4=p.published&&p.live;
  const reqDone=[d1,d2,d3].filter(Boolean).length;
  v.psCanLive=d1&&d2&&d3&&!p.live;v.psCantLive=!v.psCanLive;
  const ui=(n,done,pend,later)=>({mark:done?'✓':String(n),bg:done?'#0E7C7B':'#FFFFFF',fg:done?'#FFFFFF':'#344054',bd:done?'#0E7C7B':'#D0D5DD',pill:done?'Done':pend?'In review':later?'After go-live':'To do',pillBg:done?'#E6F4F1':pend?'#FEF0C7':'#F2F4F7',pillFg:done?'#0B5F5E':pend?'#93370D':'#475467'});
  v.st1=ui(1,d1,p.subStatus==='review');v.st2=ui(2,d2);v.st3=ui(3,d3);v.st4=ui(4,d4,false,!p.live);
  v.s1Editing=p.subStatus==='none';v.s1Claimed=d1;v.s1Review=p.subStatus==='review';
  v.psSubInput=p.subInput;v.onSubInput=e=>{const val=e.target.value.toLowerCase().replace(/\s/g,'');this.pset(key,n=>{n.subInput=val;n.subMsg='';});};
  const tones={err:['#FEF3F2','#B42318'],warn:['#FFFAEB','#93370D']};const tn=tones[p.subTone]||tones.warn;
  v.psHasSubMsg=!!p.subMsg;v.psSubMsg=p.subMsg;v.psSubMsgBg=tn[0];v.psSubMsgFg=tn[1];
  v.checkSub=()=>this.checkSub(key,vdom,root);
  v.psSubMatch=p.subMatch?'Matches verified domain '+vdom:'Approved after manual review';
  v.psCanChangeSub=d1&&!p.live;v.psSubLocked=d1&&p.live;
  v.changeSub=()=>this.pset(key,n=>{n.subStatus='none';n.sub='';n.subMsg='';},'Subdomain '+subHost+' released');
  v.withdrawSub=()=>this.pset(key,n=>{n.subStatus='none';n.sub='';n.subMsg='';},'Subdomain review withdrawn');
  v.psBrandHex=brand;v.psBrandTodo=!d2;
  v.editBrand=()=>this.setState({clientsTab:'portal'});
  v.confirmBrand=()=>this.pset(key,n=>{n.brandOk=true;},'Branding confirmed · '+brand);
  const chip=on=>({on:on?'true':'false',bg:on?'#0B1F3A':'#FFFFFF',fg:on?'#FFFFFF':'#344054',bd:on?'#0B1F3A':'#D0D5DD'});
  v.psTypes=PTYPES.map(t=>Object.assign({label:t,go:()=>this.pset(key,n=>{n.types[t]=!n.types[t];n.rulesOk=false;})},chip(!!p.types[t])));
  v.psJur=PJUR.map(([k,label,days])=>Object.assign({label,days,go:()=>this.pset(key,n=>{n.jur[k]=!n.jur[k];n.rulesOk=false;})},chip(!!p.jur[k])));
  v.psIdOpts=PID.map(x=>({label:x,value:x}));v.psId=p.idLevel;
  v.onIdLevel=e=>{const val=e.target.value;this.pset(key,n=>{n.idLevel=val;n.rulesOk=false;});};
  const days=PJUR.filter(j=>p.jur[j[0]]).map(j=>j[0]==='ccpa'?45:30);const sla=days.length?Math.min(...days):null;
  v.psSlaNote=sla?'New cases get a '+sla+'-day deadline, the shortest that applies.':'Select at least one law.';
  v.psRulesSaved=d3;v.psRulesUnsaved=!d3;
  v.saveRules=()=>{const ts=PTYPES.filter(t=>p.types[t]);if(!ts.length||!sla)return this.show('Select at least one request type and one law.');this.pset(key,n=>{n.rulesOk=true;},'Request rules saved · '+ts.length+' request types · '+sla+'-day deadline · '+p.idLevel);this.show('Request rules saved');};
  const snippet='<a href="'+(host?'https://'+host:'https://yourcompany.privacyspace.com')+'">Make a privacy request</a>';v.psSnippet=snippet;
  v.copyLink=()=>{if(!host)return this.show('Claim a subdomain first');this.copyTxt('https://'+host);this.show('Link copied');};
  v.copySnippet=()=>{this.copyTxt(snippet);this.show('Footer snippet copied');};
  v.psCanPublish=p.live&&!p.published;v.psPublished=p.published;v.psPubBlocked=!p.live;
  v.markPublished=()=>this.pset(key,n=>{n.published=true;},'Link confirmed on privacy policy and website footer');
  v.psLive=p.live;v.psNotLive=!p.live;
  v.psStatusLine=p.live?'Accepting requests at '+host:reqDone+' of 3 required steps done';
  v.psChecks=[['Subdomain claimed',d1],['Branding confirmed',d2],['Request rules saved',d3],['Link published',d4]].map(([label,done])=>({label,mark:done?'✓':'○',fg:done?'#0B5F5E':'#98A2B3',tc:done?'#344054':'#667085'}));
  v.psLiveBg=v.psCanLive?'#0E7C7B':'#E4E7EC';v.psLiveFg=v.psCanLive?'#FFFFFF':'#667085';
  v.psLiveHint=v.psCanLive?'Ready to go live.':'Finish steps 1–3 to go live.';
  v.goLive=()=>{if(!v.psCanLive)return;this.modal({title:'Put portal live',desc:'Requesters can submit at https://'+host+'. Each submission creates a case here and starts the deadline.',confirmLabel:'Go live',action:'Portal went live',reasonOptional:true,reasonLabel:'Note (optional)',onConfirm:r=>{this.pset(key,n=>{n.live=true;},'Portal went live'+(r?' · '+r:''));this.show('Portal is live');}});};
  v.goOffline=()=>this.modal({title:'Take portal offline',danger:true,desc:'The form stops accepting requests and shows '+client.email+' instead. Open cases are not affected.',confirmLabel:'Take offline',action:'Portal taken offline',reasonLabel:'Reason',onConfirm:r=>this.pset(key,n=>{n.live=false;},'Portal taken offline · '+r)});
  v.psLog=p.log.slice(0,6).map(([t,a,x])=>({t,a,x}));v.psHasLog=p.log.length>0;
  v.psCdNone=p.cdStatus==='none';v.psCdSet=!v.psCdNone;v.psCdPending=p.cdStatus==='pending';v.psCdInput=p.cdDomain;
  v.onCdInput=e=>{const val=e.target.value.trim().toLowerCase();this.pset(key,n=>{n.cdDomain=val;});};
  v.addCd=()=>{if(!/^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/.test(p.cdDomain||''))return this.show('Enter a subdomain such as privacy.'+vdom);this.pset(key,n=>{n.cdStatus='pending';},'Custom domain '+p.cdDomain+' added · waiting for DNS');};
  const hp=(p.cdDomain||'').split('.')[0];
  v.psCdRecords=[{type:'CNAME',name:hp,value:'portals.privacyspace.com'},{type:'TXT',name:'_privacyspace.'+hp,value:'ps-verify='+key+'-7f3a91'}];
  v.psCdPill=cdOk?'Verified':'Waiting for DNS';v.psCdPillBg=cdOk?'#E6F4F1':'#FEF0C7';v.psCdPillFg=cdOk?'#0B5F5E':'#93370D';
  v.verifyCd=()=>{this.pset(key,n=>{n.cdStatus='verified';},'Custom domain '+p.cdDomain+' verified · SSL certificate issued');this.show('Verified. '+(subHost||'The subdomain')+' now redirects to '+p.cdDomain);};
  v.removeCd=()=>this.modal({title:'Remove custom domain',danger:true,desc:'Requesters are sent back to '+(subHost||'the privacyspace.com address')+'. Links to '+p.cdDomain+' stop working.',confirmLabel:'Remove domain',action:'Custom domain removed',reasonLabel:'Reason',onConfirm:r=>this.pset(key,n=>{n.cdStatus='none';},'Custom domain '+p.cdDomain+' removed · '+r)});
  const mOk=p.mailStatus==='verified';
  v.psMailRecords=[{type:'TXT',name:vdom,value:'v=spf1 include:mail.privacyspace.com ~all'},{type:'CNAME',name:'ps1._domainkey',value:'ps1.dkim.privacyspace.com'},{type:'CNAME',name:'ps2._domainkey',value:'ps2.dkim.privacyspace.com'}];
  v.psMailTodo=!mOk;v.psMailPill=mOk?'Verified':'Not set up';v.psMailPillBg=mOk?'#E6F4F1':'#F2F4F7';v.psMailPillFg=mOk?'#0B5F5E':'#475467';
  v.psMailNote=mOk?'Confirmation and status emails send from '+client.email+'.':'Until this is verified, emails send from no-reply@privacyspace.com with reply-to '+client.email+'.';
  v.verifyMail=()=>{this.pset(key,n=>{n.mailStatus='verified';},'Email sending verified for '+vdom);this.show('Sender verified');};
  return v;
 }
 renderVals(){
  const s=this.state;const role=s.role;const isApprover=role==='Approver';
  const brand=s.brandColor||this.props.brandColor||'#3B4CCA';
  const client=CLIENTS.find(c=>c.key===s.client);
  const mine=s.cases.filter(c=>c.client===s.client);
  const openC=mine.filter(c=>c.status!=='Completed'&&c.status!=='Rejected');
  const queue=mine.filter(c=>c.status==='New'||c.status==='Verifying');
  const scr=s.screen;
  const v={brand,client,isApprover,isHandler:!isApprover,role,stop};
  v.isIntake=scr==='intake';v.isEmail=scr==='email';v.isApp=!v.isIntake&&!v.isEmail;
  v.backToApp=()=>this.go('cases');
  const nav=[['dashboard','Dashboard','icon-layout-dashboard'],['cases','Cases','icon-inbox',openC.length],['verify','Identity verification','icon-user-check',queue.length],['clients','Request portal','icon-globe'],['settings','Settings','icon-settings']];
  v.nav=nav.map(([key,label,icon,count])=>{const active=scr===key||(key==='cases'&&scr==='cockpit');return {label,icon,count:count||'',hasCount:!!count,bg:active?'#173A5E':'transparent',fg:active?'#FFFFFF':'#C7D2E0',bar:active?'#14919B':'transparent',current:active?'page':undefined,go:()=>this.go(key)};});
  v.pubNav=[['intake','Intake form','icon-file-input'],['email','Confirmation email','icon-mail']].map(([key,label,icon])=>({label,icon,go:()=>this.go(key)}));
  v.wsOpen=s.wsOpen;v.toggleWs=()=>this.setState({wsOpen:!s.wsOpen});
  v.wsList=CLIENTS.map(c=>({name:c.name,initial:c.initial,cur:c.key===s.client,go:()=>this.setState({client:c.key,wsOpen:false,screen:scr==='cockpit'?'cases':scr,sel:{}})}));
  v.roles=['Handler','Approver'].map(r=>({label:r,bg:r===role?'#FFFFFF':'transparent',fg:r===role?'#0B1F3A':'#C7D2E0',pressed:r===role?'true':'false',go:()=>this.setState({role:r})}));
  v.me=isApprover?{name:'Daniel Okafor',role:'Approver / DPO',initials:'DO'}:{name:'Priya Shah',role:'Request handler',initials:'PS'};
  v.roleHint=isApprover?'Approver (DPO): signs off before a case closes, decides high-risk identity checks and completes redaction review. Doesn’t work the case.':'Handler: runs the case day to day. Verifies identity, collects data from each system, redacts and drafts the response, then sends it for approval.';
  {const nr=s.notifRead||{},N=[];
   s.cases.filter(c=>c.client===s.client).forEach(c=>{const sl=sla(c);if(!sl.open&&sl.open!==undefined)return;const last=(c.audit||[])[c.audit.length-1]||{};
    const add=(k,icon,tone,title,sub,tab)=>N.push({k:c.id+k,icon,tone,title,sub,meta:c.id+' · '+sl.label,id:c.id,tab});
    if(isApprover){
     if(c.status==='Awaiting approval')add('ap','icon-stamp','warn','Approval needed',c.type+' request from '+c.name+' is ready for sign-off.','overview');
     if(c.risk==='High'&&(c.status==='Verifying'||c.status==='New'))add('hr','icon-shield-alert','bad','High-risk identity check',c.name+' needs an Approver decision before work starts.','identity');
    }else{
     if(c.status==='New')add('nw','icon-inbox','info','New request',c.type+' from '+c.name+' arrived through the portal.','overview');
     if(String(last.action||'').indexOf('Changes requested')===0)add('cr','icon-message-square-warning','warn','Changes requested',(last.reason||'The approver returned this case.'),'overview');
     const ar=(c.systems||[]).filter(x=>x.status==='Action required'||x.outcome==='Action required');
     if(ar.length&&c.status!=='Awaiting approval')add('ar','icon-triangle-alert','warn','System needs action',ar.map(x=>SYSM[x.key].name).join(', ')+' on '+c.name+'’s case.','checklist');
     if(c.status!=='Awaiting approval'&&typeof sl.left==='number'&&sl.left<=5)add('dl','icon-clock-alert','bad',sl.left<0?'Overdue by '+(-sl.left)+' day'+(sl.left===-1?'':'s'):sl.left===0?'Due today':'Deadline in '+sl.left+' day'+(sl.left===1?'':'s'),c.type+' for '+c.name+' is due '+sl.deadline+'.','overview');
    }});
   const tones={warn:['#FDF0DC','#B54708'],bad:['#FEE4E2','#B42318'],info:['#D9E8FF','#175CD3']};
   v.notifs=N.map(n=>{const u=!nr[n.k];return {...n,unread:u,w:u?'650':'500',bg:u?'#F5FBFB':'#FFFFFF',iconBg:tones[n.tone][0],iconFg:tones[n.tone][1],open:()=>{this.setState(st=>({notifOpen:false,notifRead:{...(st.notifRead||{}),[n.k]:true}}));this.openCase(n.id,n.tab);}};});
   const un=v.notifs.filter(n=>n.unread).length;
   v.notifUnread=un>9?'9+':String(un);v.notifHasUnread=un>0;v.notifNone=!N.length;v.notifOpen=!!s.notifOpen;
   v.notifBtnBg=s.notifOpen?'#173A5E':'transparent';
   v.notifAria='Notifications, '+un+' unread';v.notifFor='For '+v.me.name+' · '+v.me.role;
   v.toggleNotif=()=>this.setState({notifOpen:!s.notifOpen,wsOpen:false});v.closeNotif=()=>this.setState({notifOpen:false});
   v.readAllNotif=()=>this.setState(st=>{const r={...(st.notifRead||{})};N.forEach(n=>r[n.k]=true);return {notifRead:r};});}
  // ---------- intake
  const k=s.ik;
  v.ik=k;v.ikErr=s.ikErr;v.ikDone=!!s.ikDone;v.ikForm=!s.ikDone;v.ikId=s.ikDone||'';
  const bd=f=>s.ikErr[f]?'#B42318':'#D0D5DD';
  v.ikB={name:bd('name'),email:bd('email'),ident:bd('ident'),details:bd('details')};
  v.ikSet={name:e=>this.setIk('name',e.target.value),email:e=>this.setIk('email',e.target.value),ident:e=>this.setIk('ident',e.target.value),details:e=>this.setIk('details',e.target.value),identKind:e=>this.setIk('identKind',e.target.value),consent:e=>this.setIk('consent',e.target.checked),human:()=>this.setIk('human',!k.human)};
  v.ikTypes=[['Access','Get a copy of the personal data we hold about you.'],['Rectification','Correct inaccurate or incomplete data.'],['Erasure','Ask us to delete your personal data.'],['Portability','Receive your data in a machine-readable format.'],['Objection','Object to how we use your data.']].map(([label,desc])=>{const sel=k.type===label;return {label,desc,sel:sel?'true':'false',border:sel?brand:'#D0D5DD',bg:sel?'#F5F6FF':'#FFFFFF',dot:sel?brand:'#FFFFFF',dotB:sel?brand:'#98A2B3',pick:()=>this.setIk('type',label)};});
  const dup=s.cases.find(c=>c.email.toLowerCase()===k.email.trim().toLowerCase()&&c.status!=='Completed'&&c.status!=='Rejected');
  v.ikDup=!!dup&&!s.ikDone;v.ikDupId=dup?dup.id:'';
  v.ikHumanBox=k.human?{bg:brand,icon:'icon-check',label:'Verified'}:{bg:'#FFFFFF',icon:'',label:'Click to verify'};
  v.ikHasErrors=s.ikTried&&Object.keys(s.ikErr).length>0;v.ikErrCount=Object.keys(s.ikErr).length;
  v.submitIntake=()=>this.submitIntake();
  v.ikDeadline=fmt(addM(NOW,1));v.today=fmt(NOW);
  v.ikReset=()=>this.setState({ikDone:null,ikTried:false,ik:{type:'Access',name:'',email:'',identKind:'Customer ID',ident:'',details:'',consent:false,human:false}});
  v.toEmail=()=>this.go('email');v.toNewCase=()=>this.openCase(s.ikDone);v.toIntake=()=>this.go('intake');
  const ec=s.cases.find(c=>c.id===(s.ikDone||'DSAR-2026-00418'));
  v.em={id:ec.id,type:ec.type,name:ec.name.split(' ')[0],email:ec.email,received:fmt(pd(ec.received)),deadline:sla(ec).deadline==='—'?fmt(addM(pd(ec.received),1)):sla(ec).deadline};
  // ---------- dashboard
  const stat=cs=>{const o=cs.filter(c=>c.status!=='Completed'&&c.status!=='Rejected');return {open:o.length,due:o.filter(c=>{const l=sla(c).left;return l>=0&&l<=7;}).length,overdue:o.filter(c=>sla(c).left<0).length,awaiting:o.filter(c=>c.status==='Awaiting approval').length,risk:o.filter(c=>(c.status==='Verifying'||c.status==='New')&&c.risk==='High').length,action:o.reduce((a,c)=>a+c.systems.filter(x=>x.status==='Action required').length,0),done:cs.filter(c=>c.closedMonth).length};};
  const all=stat(mine);
  v.widgets=[['Open cases',all.open,'icon-inbox','#0B1F3A'],['Due within 7 days',all.due,'icon-clock','#B54708'],['Overdue',all.overdue,'icon-circle-alert','#B42318'],['Awaiting approval',all.awaiting,'icon-lock','#B54708'],['High-risk verifications',all.risk,'icon-shield-x','#B42318'],['Systems in Action required',all.action,'icon-triangle-alert','#B54708'],['Completed this month',all.done,'icon-circle-check','#0E6B4D'],['Average time to closure',client.avg,'icon-timer','#0B1F3A']].map(([label,val,icon,fg])=>({label,val,icon,fg}));
  v.attention=openC.map(c=>{const sl=sla(c);const act=c.systems.filter(x=>x.status==='Action required').length;let why,rk;
   if(sl.left<0){why='Statutory deadline passed';rk=0;}
   else if(c.status==='Awaiting approval'){why='Awaiting approval by '+c.approver;rk=1;}
   else if((c.status==='Verifying'||c.status==='New')&&c.risk==='High'){why='High-risk identity check';rk=2;}
   else if(act){why=act+(act===1?' system':' systems')+' in Action required';rk=3;}
   else if(sl.left<=7){why='Due within 7 days';rk=4;}
   else if(c.status==='Verifying'||c.status==='New'){why='Identity verification pending';rk=5;}
   else return null;
   return {rk,left:sl.left,id:c.id,name:c.name,type:c.type,owner:c.owner,why,status:P(STATUS,c.status),sla:sl,open:()=>this.openCase(c.id)};}).filter(Boolean).sort((a,b)=>a.rk-b.rk||a.left-b.left);
  v.noAttention=!v.attention.length;
  v.clientRows=CLIENTS.map(c=>{const st=stat(s.cases.filter(x=>x.client===c.key));const nextDue=s.cases.filter(x=>x.client===c.key&&sla(x).open).sort((a,b)=>sla(a).left-sla(b).left)[0];return Object.assign(st,{name:c.name,initial:c.initial,domain:c.domain,avg:c.avg,next:nextDue?sla(nextDue):{label:'No open cases',fg:'#667085',icon:'icon-minus'},nextId:nextDue?nextDue.id:'',overFg:st.overdue?'#B42318':'#344054',overW:st.overdue?'700':'400',actFg:st.action?'#B54708':'#344054',open:()=>this.setState({client:c.key,screen:'cases',view:'all'})});});
  // ---------- case list
  const views=[['all','All open',c=>sla(c).open],['mine','My cases',c=>sla(c).open&&c.owner==='Priya Shah'],['due','Due soon',c=>sla(c).open&&sla(c).left>=0&&sla(c).left<=7],['approval','Awaiting approval',c=>c.status==='Awaiting approval'],['overdue','Overdue',c=>sla(c).open&&sla(c).left<0],['closed','Closed',c=>!sla(c).open]];
  v.views=views.map(([key,label,f])=>{const a=s.view===key;return {label,count:mine.filter(f).length,bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',pressed:a?'true':'false',go:()=>this.setState({view:key,sel:{}})};});
  const vf=views.find(x=>x[0]===s.view)[2];const q=s.search.trim().toLowerCase();
  let rows=mine.filter(vf).filter(c=>!q||c.id.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.email.toLowerCase().includes(q));
  if(s.fType!=='All')rows=rows.filter(c=>c.type===s.fType);
  if(s.fStatus!=='All')rows=rows.filter(c=>c.status===s.fStatus);
  rows.sort((a,b)=>sla(a).left-sla(b).left);
  v.search=s.search;v.onSearch=e=>this.setState({search:e.target.value});
  v.fType=s.fType;v.fStatus=s.fStatus;v.onFType=e=>this.setState({fType:e.target.value});v.onFStatus=e=>this.setState({fStatus:e.target.value});
  v.typeOpts=['All','Access','Erasure','Portability','Rectification','Objection'];v.statusOpts=['All',...Object.keys(STATUS)];
  v.caseRows=rows.map(c=>{const sl=sla(c),pr=progress(c),sel=!!s.sel[c.id];return {id:c.id,name:c.name,email:c.email,type:c.type,status:P(STATUS,c.status),owner:c.owner,received:fmtS(pd(c.received)),sla:sl,pr,high:c.priority==='High',bg:sel?'#D7F0EF':'#FFFFFF',checked:sel,toggle:e=>{e.stopPropagation();this.setState(st=>({sel:{...st.sel,[c.id]:!st.sel[c.id]}}));},open:()=>this.openCase(c.id),key:e=>{if(e.key==='Enter')this.openCase(c.id);}};});
  v.noRows=!rows.length;
  const selIds=Object.keys(s.sel).filter(x=>s.sel[x]);
  v.selCount=selIds.length;v.hasSel=selIds.length>0;v.allChecked=rows.length>0&&rows.every(c=>s.sel[c.id]);
  v.toggleAll=()=>this.setState({sel:v.allChecked?{}:Object.fromEntries(rows.map(c=>[c.id,true]))});
  v.clearSel=()=>this.setState({sel:{}});
  v.bulkAssign=()=>this.modal({title:'Assign owner to '+selIds.length+' cases',desc:'Each case records the reassignment in its audit log.',confirmLabel:'Assign owner',action:'Owner reassigned',options:['Priya Shah','Ravi Menon','Daniel Okafor'],optionLabel:'New owner',reasonLabel:'Reason',placeholder:'e.g. Rebalancing queue for annual leave',onConfirm:(r,o)=>{selIds.forEach(id=>this.upd(id,(n,log)=>{n.owner=o;log('Owner changed to '+o,'Case',r);}));this.setState({sel:{}});this.show(selIds.length+' cases assigned to '+o+'.');}});
  v.bulkExport=()=>{selIds.forEach(id=>this.upd(id,(n,log)=>log('Case included in CSV export','Case')));this.show(selIds.length+' cases exported to CSV. Export logged on each case.');};
  v.newCase=()=>this.go('intake');
  // ---------- verification queue
  let vq=queue;if(s.vqFilter==='high')vq=vq.filter(c=>c.risk==='High');if(s.vqFilter==='email')vq=vq.filter(c=>c.emailV==='Pending');
  v.vqFilters=[['all','All',queue.length],['high','High risk',queue.filter(c=>c.risk==='High').length],['email','Email pending',queue.filter(c=>c.emailV==='Pending').length]].map(([key,label,n])=>{const a=s.vqFilter===key;return {label,n,bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',pressed:a?'true':'false',go:()=>this.setState({vqFilter:key})};});
  const vqSelId=vq.find(c=>c.id===s.vqSel)?s.vqSel:(vq[0]&&vq[0].id);
  v.vqRows=vq.map(c=>({id:c.id,name:c.name,email:c.email,type:c.type,match:P(MATCH,c.idMatch),emailV:P(EMAILV,c.emailV),doc:c.idDoc?'Provided':'None',docFg:c.idDoc?'#101828':'#667085',risk:P(RISK,c.risk),sla:sla(c),received:fmtS(pd(c.received)),reviewer:c.owner.split(' ')[0],bg:c.id===vqSelId?'#D7F0EF':'#FFFFFF',bar:c.id===vqSelId?'#0E7C7B':'transparent',pick:()=>this.setState({vqSel:c.id,vqNote:''})}));
  v.vqEmpty=!vq.length;v.vqHas=!!vq.length;
  const verifiedToday=2+s.cases.filter(c=>c.verifiedToday).length;
  v.vqCards=[['Awaiting review',queue.length,'icon-hourglass','#0B1F3A'],['High risk',queue.filter(c=>c.risk==='High').length,'icon-shield-x','#B42318'],['Verified today',verifiedToday,'icon-shield-check','#0E6B4D'],['Rejected (30 days)',mine.filter(c=>c.status==='Rejected').length,'icon-circle-x','#344054']].map(([label,val,icon,fg])=>({label,val,icon,fg}));
  if(vqSelId){const c=s.cases.find(x=>x.id===vqSelId);
   v.vd={id:c.id,name:c.name,email:c.email,ident:c.ident||'—',type:c.type,received:fmt(pd(c.received)),match:P(MATCH,c.idMatch),matchNote:c.idMatchNote,emailV:P(EMAILV,c.emailV),emailNote:c.emailV==='Confirmed'?'Confirmation link opened from the submitting address.':'Confirmation link sent '+fmtS(pd(c.received))+'. Not yet opened.',risk:P(RISK,c.risk,' risk'),high:c.risk==='High',sla:sla(c),hasDoc:c.idDoc,noDoc:!c.idDoc,revealed:c.revealed,notRevealed:!c.revealed,blur:c.revealed?'none':'blur(7px)',infoRequested:c.infoRequested,
    canDecide:!(c.risk==='High'&&!isApprover),blockedHigh:c.risk==='High'&&!isApprover,
    approve:()=>this.idApprove(c.id),info:()=>this.idInfo(c.id),reject:()=>this.idReject(c.id),open:()=>this.openCase(c.id,'identity'),
    reveal:()=>this.modal({title:'Open ID document',desc:'Viewing an identity document is a sensitive action. Your access is logged against this case.',confirmLabel:'Open document',action:'ID document viewed · '+c.id,reasonLabel:'Reason for viewing',placeholder:'e.g. Compare name and photo against account record',onConfirm:(r)=>this.upd(c.id,(n,log)=>{n.revealed=true;log('ID document opened','Identity',r,'id_document_'+c.id.slice(-5)+'.jpg');})})};
  }
  v.vdHas=!!vqSelId;
  v.vqNote=s.vqNote;v.onVqNote=e=>this.setState({vqNote:e.target.value});
  v.saveVqNote=()=>{if(!s.vqNote.trim())return;this.upd(vqSelId,(n,log,t,actor)=>{n.notes.push({by:actor,at:t,text:s.vqNote.trim()});log('Reviewer note added','Identity',s.vqNote.trim());});this.setState({vqNote:''});this.show('Note saved to case.');};
  // ---------- cockpit
  const c=s.cases.find(x=>x.id===s.caseId)||s.cases[0];
  v.isCockpit=scr==='cockpit';
  if(v.isCockpit) Object.assign(v,this.cockpit(c,s,client,isApprover));
  // ---------- clients / portal
  v.clientsTabs=[['setup','Setup'],['portal','Branding']].map(([key,label])=>{const a=s.clientsTab===key;return {label,fg:a?'#0B1F3A':'#667085',bd:a?'#0E7C7B':'transparent',sel:a?'true':'false',go:()=>this.setState({clientsTab:key})};});
  v.ctSetup=s.clientsTab==='setup';v.ctPortal=s.clientsTab==='portal';v.ctAccess=s.clientsTab==='access';
  v.wlClients=CLIENTS.map(x=>{const a=x.key===s.client;return {name:x.name,bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',go:()=>this.setState({client:x.key})};});
  v.swatches=['#3B4CCA','#0E7C7B','#B8432F','#1F2937','#7A3E9D'].map(col=>({col,ring:col===brand?'#0B1F3A':'transparent',label:'Brand color '+col,go:()=>this.setState({brandColor:col})}));
  v.poweredBy=s.poweredBy;v.togglePowered=()=>this.setState({poweredBy:!s.poweredBy});
  v.pbTrack=s.poweredBy?'#0E7C7B':'#D0D5DD';v.pbKnob=s.poweredBy?'22px':'2px';
  Object.assign(v,this.portalVals(s,client,brand));
  const accessRoles=[['Mara Voss','Northlight Privacy','Agency admin','All clients'],['Jakob Lund','Northlight Privacy','Handler','Lumen, Fernwood'],['Priya Shah','Lumen Analytics','Handler','Lumen'],['Daniel Okafor','Lumen Analytics','Approver / DPO','Lumen'],['Ruth Calder','Fernwood Commerce','Approver','Fernwood'],['Aino Virtanen','Kesto Health','Approver / DPO','Kesto']];
  v.accessRows=accessRoles.map(([name,org,r,scope])=>({name,org,role:r,scope}));
  v.openIntake=()=>this.go('intake');
  // ---------- settings
  v.setTabs=[['team','Team & roles'],['sources','Data sources'],['sla','SLA & notifications'],['billing','Billing & usage']].map(([key,label])=>{const a=s.settingsTab===key;return {label,fg:a?'#0B1F3A':'#667085',bd:a?'#0E7C7B':'transparent',sel:a?'true':'false',go:()=>this.setState({settingsTab:key})};});
  v.stTeam=s.settingsTab==='team';v.stSources=s.settingsTab==='sources';v.stSla=s.settingsTab==='sla';v.stBilling=s.settingsTab==='billing';
  {const plan=s.billPlan||'Growth';const P={Starter:[79,5,15,1],Growth:[199,25,10,3],Agency:[499,100,8,15]}[plan];const used=mine.filter(c=>c.received>='2026-10-01').length+9;
   v.bill={plan,cycle:'Billed monthly',renews:'1 Nov 2026',price:'€'+P[0],includes:P[1]+' DSARs / month · '+P[3]+(P[3]===1?' workspace':' workspaces'),overage:'€'+P[2]+' per extra DSAR',period:'1–31 Oct 2026',
    usage:[{label:'DSARs received',val:used+' of '+P[1],pct:Math.min(100,Math.round(used/P[1]*100))+'%'},{label:'Workspaces',val:'1 of '+P[3],pct:Math.round(100/P[3])+'%'}],
    method:'Visa •••• 4417 · expires 08/28',email:'finance@lumen.io',address:'Lumen Analytics AB, Kungsgatan 8, 111 43 Stockholm, Sweden',vat:'SE556677889901',
    invoices:[['INV-2026-0142','Oct 2026','Growth plan','€199','Paid 1 Oct'],['INV-2026-0127','Sep 2026','Growth plan + 1 overage DSAR','€209','Paid 1 Sep'],['INV-2026-0110','Aug 2026','Growth plan','€199','Paid 1 Aug']].map(([no,period,detail,amt,status])=>({no,period,detail,amt,status,pdf:()=>this.show(no+'.pdf prepared.')})),
    change:()=>this.modal({title:'Change plan',desc:'Upgrades apply straight away and are prorated. Downgrades apply at the next renewal on 1 Nov 2026. Evidence packs are included on every plan.',confirmLabel:'Change plan',action:'Plan change requested',options:['Starter · €79 / month','Growth · €199 / month','Agency · €499 / month'],optionLabel:'Plan',option:plan+' · €'+P[0]+' / month',reasonOptional:true,reasonLabel:'Note (optional)',onConfirm:(r,o)=>{const np=o.split(' ')[0];this.setState({billPlan:np});this.show(np===plan?'No change.':'Plan changed to '+np+'. Logged in the workspace audit.');}}),
    cancel:()=>this.modal({title:'Cancel subscription',danger:true,desc:'Your plan stays active until 1 Nov 2026. After that, members lose access and the portal stops accepting requests. Open cases and evidence packs stay downloadable for 30 days. Tell requesters how else to reach you.',confirmLabel:'Cancel subscription',action:'Subscription cancellation requested',reasonLabel:'Why are you cancelling?',onConfirm:()=>this.show('Subscription cancels on 1 Nov 2026. You can resume any time before then.')}),
    updateMethod:()=>this.show('Opens the secure payment page from our payment provider.'),editDetails:()=>this.show('Billing details form opens here.')};}
  v.people=PEOPLE.map(p=>({...p,initials:p.name.split(' ').map(x=>x[0]).join(''),mfaPill:p.mfa?pill('MFA on','ok','shield-check'):pill('MFA not set up','warn','shield-alert'),deactivate:()=>this.modal({title:'Deactivate '+p.name,danger:true,desc:'Open tasks assigned to this user must be reassigned. Their audit history is kept.',confirmLabel:'Deactivate user',action:'User deactivated · '+p.name,reasonLabel:'Reason',placeholder:'e.g. Left the company',onConfirm:()=>this.show(p.name+' deactivated. Logged in workspace audit.')})}));
  v.mfa=s.mfa;v.toggleMfa=()=>this.setState({mfa:!s.mfa});v.mfaTrack=s.mfa?'#0E7C7B':'#D0D5DD';v.mfaKnob=s.mfa?'22px':'2px';
  v.invite=()=>this.show('Invitation sent. Invitee must set up MFA before first sign-in.');
  const Y={label:'Allowed',icon:'icon-check',fg:'#0E6B4D'},N={label:'Not allowed',icon:'icon-minus',fg:'#98A2B3'};
  v.perms=[['View and update cases',[Y,Y,Y,Y]],['Record system outcomes',[Y,Y,Y,Y]],['Approve identity',[Y,N,Y,Y]],['Approve closure',[N,N,Y,Y]],['Export evidence packs',[Y,N,Y,Y]],['Configure workspace',[N,N,N,Y]]].map(([label,cells])=>({label,cells}));
  v.permRoles=['Handler','System owner','Approver','Admin'];
  v.sources=SYS.map(x=>{const on=s.srcActive[x.key];return {...x,on,track:on?'#0E7C7B':'#D0D5DD',knob:on?'22px':'2px',state:on?'Active':'Inactive',checked:on?'true':'false',toggle:()=>this.setState({srcActive:{...s.srcActive,[x.key]:!on}})};});
  v.reminders=[1,7,14,21,28,30].map(d=>{const on=s.reminders.includes(d);return {label:'Day '+d,bg:on?'#D7F0EF':'#FFFFFF',fg:on?'#0A6463':'#475467',bd:on?'#0E7C7B':'#D0D5DD',icon:on?'icon-check':'icon-plus',pressed:on?'true':'false',go:()=>this.setState({reminders:on?s.reminders.filter(x=>x!==d):[...s.reminders,d].sort((a,b)=>a-b)})};});
  v.extReview=s.extReview;v.toggleExtReview=()=>this.setState({extReview:!s.extReview});v.erTrack=s.extReview?'#0E7C7B':'#D0D5DD';v.erKnob=s.extReview?'22px':'2px';
  v.autoSend=s.autoSend;v.toggleAuto=()=>this.setState({autoSend:!s.autoSend});v.asTrack=s.autoSend?'#0E7C7B':'#D0D5DD';v.asKnob=s.autoSend?'22px':'2px';
  v.isDashboard=scr==='dashboard';v.isCases=scr==='cases';v.isVerify=scr==='verify';v.isClients=scr==='clients';v.isSettings=scr==='settings';
  // ---------- modal / toast
  const m=s.modal;v.hasModal=!!m;
  if(m){v.md={title:m.title,desc:m.desc,confirmLabel:m.confirmLabel,btnBg:m.danger?'#B42318':'#0E7C7B',hasOptions:!!m.options,optionLabel:m.optionLabel||'Option',options:(m.options||[]).map(o=>{const a=m.option===o;return {label:o,bg:a?'#D7F0EF':'#FFFFFF',bd:a?'#0E7C7B':'#D0D5DD',dot:a?'#0E7C7B':'#FFFFFF',dotB:a?'#0E7C7B':'#98A2B3',pick:()=>this.setState({modal:{...m,option:o,err:''}}),checked:a?'true':'false'};}),showCats:!!m.cats&&(m.catAlways||m.option===m.catFor),cats:['',...(m.cats||[])].map(x=>({label:x||'Select a category',value:x})),category:m.category||'',onCat:e=>this.setState({modal:{...m,category:e.target.value,err:''}}),reason:m.reason,onReason:e=>this.setState({modal:{...m,reason:e.target.value,err:''}}),reasonLabel:m.reasonLabel||'Reason',required:m.reasonOptional?'':' (required)',placeholder:m.placeholder||'',err:m.err,hasErr:!!m.err,audit:this.actor()+' · '+this.stamp(s.clock)+' · '+m.action,confirm:()=>this.confirmModal(),cancel:()=>this.setState({modal:null}),key:e=>{if(e.key==='Escape')this.setState({modal:null});}};}
  v.toast=s.toast;v.hasToast=!!s.toast;
  return v;
 }
 cockpit(c,s,client,isApprover){
  const v={};const er=c.type==='Erasure';const sl=sla(c);const pr=progress(c);const ch=checks(c);const open=sl.open;
  const blockers=ch.filter(x=>!x.ok);
  v.cv={id:c.id,name:c.name,email:c.email,ident:c.ident||'—',type:c.type,details:c.details||'—',status:P(STATUS,c.status),high:c.priority==='High',owner:c.owner,approver:c.approver,received:fmt(pd(c.received)),sla:sl,pr,isErasure:er,notErasure:!er,
   notes:c.notes.slice().reverse(),hasNotes:c.notes.length>0,files:c.files.map(f=>({...f})),hasFiles:c.files.length>0,
   approvals:c.approvals.slice().reverse(),hasApprovals:c.approvals.length>0,
   copy:()=>{try{navigator.clipboard.writeText(c.id);}catch(e){}this.show(c.id+' copied.');},
   canExtend:open&&(c.extMonths||0)<2,extend:()=>this.extend(c.id),extended:c.extMonths>0,extLabel:'Extended '+(c.extMonths===2?'2 months':'1 month'),
   nextReminder:open?(sl.left>9?'Day 21 reminder on 15 Oct':sl.left>2?'Day 28 reminder in '+(sl.left-2)+' days':'Escalation sent to Daniel Okafor'):'Case closed',
   remaining:blockers.length,remainLabel:blockers.length?blockers.length+(blockers.length===1?' item remains':' items remain')+' before closure':(c.status==='Completed'?'Closed with evidence':'Ready for approval'),remainFg:blockers.length?'#B54708':'#0E6B4D',
   railOpen:s.railOpen,railClosed:!s.railOpen,cols:s.railOpen?'minmax(0,1fr) 340px':'minmax(0,1fr) 56px',toggleRail:()=>this.setState({railOpen:!s.railOpen})};
  v.cvChecks=ch.map(x=>({label:x.label,detail:x.detail,icon:x.ok?'icon-circle-check':'icon-circle-alert',fg:x.ok?'#0E6B4D':'#B54708',status:x.ok?'Done':'Open',go:()=>this.setState({tab:x.tab})}));
  v.checksDone=ch.filter(x=>x.ok).length;v.checksTotal=ch.length;
  // CTA
  let cta;
  const st=c.status;
  if(st==='New')cta={label:'Start verification',icon:'icon-shield',on:()=>{this.upd(c.id,(n,log)=>{n.status='Verifying';log('Verification started','Identity');});this.setState({tab:'identity'});}};
  else if(st==='Verifying')cta={label:'Approve identity',icon:'icon-user-check',on:()=>{this.setState({tab:'identity'});this.idApprove(c.id);},dis:c.risk==='High'&&!isApprover,note:'High-risk: approver role required'};
  else if(st==='In progress'||st==='Extended')cta={label:'Send for approval',icon:'icon-send',on:()=>this.sendForApproval(c.id),dis:blockers.length>0,note:blockers.length+(blockers.length===1?' item remains':' items remain')};
  else if(st==='Awaiting approval')cta={label:'Approve and close',icon:'icon-lock',on:()=>{this.setState({tab:'approval'});this.approve(c.id);},dis:!isApprover||blockers.length>0,note:!isApprover?'Approver role required':'Resolve open items first'};
  else cta={label:'Download evidence pack',icon:'icon-download',on:()=>this.setState({tab:'evidence'})};
  v.cta={...cta,enabled:!cta.dis,disabled:!!cta.dis,note:cta.note||''};
  // stepper
  const stepsDef=[['Received',true,'overview'],['Identity',c.idVerified,'identity'],['Checklist',ch[1].ok&&ch[2].ok,'checklist'],[er?'Erasure outcomes':'Collection & redaction',ch[3].ok,'work'],['Approval',st==='Completed',  'approval'],['Evidence pack',st==='Completed'&&c.packs.length>0,'evidence']];
  let cur=stepsDef.findIndex(x=>!x[1]);if(st==='Rejected')cur=-1;
  v.steps=stepsDef.map(([label,done,tab],i)=>{const isCur=i===cur;return {label,n:i+1,done,notDone:!done,bg:done?'#0E7C7B':isCur?'#FFFFFF':'#FFFFFF',fg:done?'#FFFFFF':isCur?'#0E7C7B':'#667085',bd:done?'#0E7C7B':isCur?'#0E7C7B':'#D0D5DD',lfg:done||isCur?'#0B1F3A':'#667085',lw:isCur?'600':'500',line:i<stepsDef.length-1,lineBg:done?'#0E7C7B':'#D0D5DD',state:done?'complete':isCur?'current step':'not started',go:()=>this.setState({tab})};});
  // tabs
  const tabs=[['overview','Overview',''],['identity','Identity',c.idVerified?'':'!'],['checklist','Data-source checklist',pr.done+'/'+pr.total],['work',er?'Erasure outcomes':'Collection & redaction',er?String(c.systems.filter(x=>x.status==='Action required').length||''):String(c.tokens.filter(t=>t.flag&&!t.red).length||'')],['approval','Approval & response',''],['evidence','Evidence pack',c.packs.length?'v'+c.packs.length:''],['audit','Audit log',String(c.audit.length)]];
  v.tabs=tabs.map(([key,label,badge])=>{const a=s.tab===key;return {label,badge,hasBadge:!!badge,fg:a?'#0B1F3A':'#667085',bd:a?'#0E7C7B':'transparent',w:a?'600':'500',sel:a?'true':'false',go:()=>this.setState({tab:key,expanded:null})};});
  v.tb={};tabs.forEach(([k])=>v.tb[k]=s.tab===k);
  v.recent=c.audit.slice(-5).reverse().map(a=>({...a,hasReason:!!a.reason}));
  v.toAudit=()=>this.setState({tab:'audit'});
  // systems
  const people=['Priya Shah','Ravi Menon','Ana Costa','Leo Brandt','Daniel Okafor'];
  v.sysRows=c.systems.map(x=>{const d=SYSM[x.key];const exp=s.expanded===x.key;const sel=!!s.clSel[x.key];const last=c.audit.slice().reverse().find(a=>a.action.indexOf(d.name)===0);
   return {key:x.key,name:d.name,sub:d.sub,owner:x.owner,method:d.method,due:x.due,ins:d.ins,evReq:d.ev,pill:P(CHK,x.status),evCount:x.evidence.length,evLabel:x.evidence.length?x.evidence.length+(x.evidence.length===1?' file':' files'):'None',evFg:x.evidence.length?'#101828':'#667085',cmLabel:x.comments.length?x.comments.length+' comment'+(x.comments.length>1?'s':''):'',evidence:x.evidence,hasEvidence:x.evidence.length>0,comments:x.comments,hasComments:x.comments.length>0,reason:x.reason,hasReason:!!x.reason,exCat:x.exCat,hasExCat:!!x.exCat,
    expanded:exp,chev:exp?'icon-chevron-up':'icon-chevron-down',bg:sel?'#D7F0EF':exp?'#FAFBFC':'#FFFFFF',checked:sel,ariaExp:exp?'true':'false',
    toggle:()=>this.setState({expanded:exp?null:x.key,sysErr:null,commentDraft:''}),toggleSel:e=>{e.stopPropagation();this.setState(st2=>({clSel:{...st2.clSel,[x.key]:!st2.clSel[x.key]}}));},
    err:s.sysErr===x.key,attach:()=>this.attach(c.id,x.key),
    lastAudit:last?last.actor+' · '+last.t:'No activity yet',
    owners:people.map(p=>({label:p,value:p})),onOwner:e=>{const val=e.target.value;this.upd(c.id,(n,log)=>{n.systems.find(y=>y.key===x.key).owner=val;log(d.name+' task reassigned to '+val,'Checklist');});},
    statusBtns:['In progress','Completed','Not found','Action required','Retained under exception'].map(sv=>{const a=x.status===sv;const t=CHK[sv];return {label:sv,icon:'icon-'+t[1],bg:a?T[t[0]][0]:'#FFFFFF',fg:a?T[t[0]][1]:'#344054',bd:a?T[t[0]][1]:'#D0D5DD',pressed:a?'true':'false',go:()=>{if(!a)this.setSys(c.id,x.key,sv);}};}),
    addComment:()=>{const tx=s.commentDraft.trim();if(!tx)return;this.upd(c.id,(n,log,t,actor)=>{n.systems.find(y=>y.key===x.key).comments.push({by:actor,at:'13 Oct',text:tx});log('Comment added on '+d.name,'Checklist',tx);});this.setState({commentDraft:''});}
   };});
  v.commentDraft=s.commentDraft;v.onComment=e=>this.setState({commentDraft:e.target.value});
  v.idPending=!c.idVerified;v.idDone=c.idVerified;
  const clIds=Object.keys(s.clSel).filter(x=>s.clSel[x]);v.clCount=clIds.length;v.clHas=clIds.length>0;v.clNone=!clIds.length;
  v.clRemind=()=>{const ks=clIds.length?clIds:c.systems.filter(x=>x.status==='Not started'||x.status==='In progress').map(x=>x.key);this.upd(c.id,(n,log)=>log('Reminders sent to '+[...new Set(ks.map(k=>n.systems.find(y=>y.key===k).owner))].join(', '),'Communications'));this.setState({clSel:{}});this.show('Reminders sent to '+ks.length+' task owners.');};
  v.clNotFound=()=>this.modal({title:'Mark '+clIds.length+' systems as Not found',desc:'Each system records this reason. Not found still counts as searched.',confirmLabel:'Mark as not found',action:'Systems marked Not found',reasonLabel:'Reason',placeholder:'e.g. No records for email or customer ID',onConfirm:(r)=>{this.upd(c.id,(n,log)=>{clIds.forEach(k=>{const y=n.systems.find(z=>z.key===k);y.status='Not found';y.reason=r;log(SYSM[k].name+' marked Not found','Checklist',r);});});this.setState({clSel:{}});}});
  v.clAssign=()=>this.modal({title:'Assign '+clIds.length+' tasks',desc:'The new owner is notified by email.',confirmLabel:'Assign tasks',action:'Tasks reassigned',options:people,optionLabel:'Owner',reasonOptional:true,reasonLabel:'Note (optional)',onConfirm:(r,o)=>{this.upd(c.id,(n,log)=>{clIds.forEach(k=>{n.systems.find(z=>z.key===k).owner=o;log(SYSM[k].name+' task reassigned to '+o,'Checklist',r);});});this.setState({clSel:{}});}});
  v.clDue=()=>this.modal({title:'Change due date for '+clIds.length+' tasks',desc:'Task due dates must stay before the statutory deadline ('+sl.deadline+').',confirmLabel:'Change due dates',action:'Due dates changed',options:['15 Oct','17 Oct','20 Oct'],optionLabel:'New due date',reasonLabel:'Reason',onConfirm:(r,o)=>{this.upd(c.id,(n,log)=>{clIds.forEach(k=>{n.systems.find(z=>z.key===k).due=o;});log('Due date changed to '+o+' for '+clIds.length+' tasks','Checklist',r);});this.setState({clSel:{}});}});
  v.toIdentity=()=>this.setState({tab:'identity'});
  // identity tab
  v.idv={emailV:P(EMAILV,c.emailV),match:P(MATCH,c.idMatch),matchNote:c.idMatchNote,risk:P(RISK,c.risk,' risk'),doc:c.idDoc?'ID document provided (masked)':'No ID document requested',decided:!!c.idDecision,decision:c.idDecision||{},rejected:!!(c.idDecision&&c.idDecision.rejected),canAct:!c.idVerified&&st!=='Rejected',canDecide:!(c.risk==='High'&&!isApprover),blockedHigh:c.risk==='High'&&!isApprover,approve:()=>this.idApprove(c.id),info:()=>this.idInfo(c.id),reject:()=>this.idReject(c.id),toQueue:()=>this.setState({screen:'verify',vqSel:c.id})};
  // redaction
  const fsel=c.files.find(f=>f.id===s.fileSel)||c.files[0];
  v.rwFiles=c.files.map(f=>{const a=fsel&&f.id===fsel.id;return {...f,bg:a?'#D7F0EF':'#FFFFFF',bd:a?'#0E7C7B':'#E4E7EC',needsRed:!!f.needsRed,redacted:!!f.redacted,go:()=>this.setState({fileSel:f.id,selTok:null})};});
  v.rwHasFiles=c.files.length>0;v.rwNoFiles=!c.files.length;
  const isDoc=fsel&&fsel.id==='zendesk'&&c.tokens.length>0;
  v.rwIsDoc=isDoc;v.rwNotDoc=!isDoc&&!!fsel;v.rwFile=fsel||{};
  v.rwOpened=c.docOpened;v.rwBlur=c.docOpened?'none':'blur(6px)';v.rwLocked=!c.docOpened;
  v.rwOpen=()=>this.modal({title:'Open original file',desc:'The original contains unredacted personal data. Opening it is logged. The original stays versioned and access-controlled.',confirmLabel:'Open file',action:'Original file opened · '+(fsel?fsel.name:''),reasonLabel:'Reason',placeholder:'e.g. Redaction review',onConfirm:(r)=>this.upd(c.id,(n,log)=>{n.docOpened=true;log('Original file opened for redaction','Redaction',r,fsel.name);})});
  const tk=Object.fromEntries(c.tokens.map(t=>[t.id,t]));
  const lineSt={h:['17px','600','#0B1F3A','transparent','0'],meta:['13px','500','#667085','transparent','0'],p:['15px','400','#101828','transparent','0'],note:['14px','400','#101828','#FFF8EB','10px 12px']};
  v.rwLines=!isDoc?[]:DOC.map(l=>{const ls=lineSt[l.kind];return {fs:ls[0],fw:ls[1],color:ls[2],bg:ls[3],pad:ls[4],segs:l.segs.map(sg=>{if(typeof sg==='string')return {text:sg,bg:'transparent',fg:'inherit',bd:'transparent',pad:'0',cursor:'text',on:undefined,role:undefined,tab:undefined,label:undefined};const t=tk[sg.t];const sel=s.selTok===t.id;
    if(t.red)return {text:'█ '+t.cat,bg:'#0B1F3A',fg:'#FFFFFF',bd:'#0B1F3A',pad:'1px 6px',cursor:'default',on:undefined,role:undefined,tab:undefined,label:'Redacted: '+t.cat};
    return {text:t.text,bg:t.flag?'#FDF0DC':'#EEF1F4',fg:'#101828',bd:sel?'#0E7C7B':(t.flag?'#DC6803':'#98A2B3'),pad:'1px 3px',cursor:'pointer',role:'button',tab:'0',label:'Select for redaction: '+t.cat,on:()=>{if(!c.docOpened)return;this.setState({selTok:t.id,redCat:t.cat,redReason:'',redErr:''});}};})};});
  const unred=c.tokens.filter(t=>t.flag&&!t.red).length;
  v.rwWarn=unred>0;v.rwWarnLabel=unred+(unred===1?' flagged item may contain':' flagged items may contain')+' third-party or confidential data';
  const stok=tk[s.selTok];v.rwHasSel=!!stok&&!stok.red;v.rwNoSel=!v.rwHasSel;v.rwSel=stok||{};
  v.redCats=REDCATS.map(x=>({label:x,value:x}));v.redCat=s.redCat;v.onRedCat=e=>this.setState({redCat:e.target.value});
  v.redReason=s.redReason;v.onRedReason=e=>this.setState({redReason:e.target.value,redErr:''});v.redErr=s.redErr;v.hasRedErr=!!s.redErr;
  v.applyRed=()=>this.applyRed(c.id);v.cancelSel=()=>this.setState({selTok:null});
  v.rwLog=c.redLog.slice().reverse();v.rwHasLog=c.redLog.length>0;v.rwNoLog=!c.redLog.length;
  const rr=c.redReview;
  v.rwReview=rr==='done'?pill('Review complete','ok','circle-check'):rr==='requested'?pill('Review requested','warn','hourglass'):pill('Not reviewed','gray','circle-dashed');
  v.rwCanRequest=rr==='none'&&c.redLog.length>0;v.rwCantRequest=!v.rwCanRequest;
  v.rwRequest=()=>this.upd(c.id,(n,log)=>{n.redReview='requested';log('Redaction review requested from Daniel Okafor','Redaction',unred?unred+' flagged items left unredacted':'');});
  v.rwCanMark=rr==='requested'&&isApprover;v.rwMarkHint=rr==='requested'&&!isApprover;
  v.rwMark=()=>this.modal({title:'Complete redaction review',desc:'Confirms the redactions are adequate. A final redacted export can then be generated.',confirmLabel:'Complete review',action:'Redaction review completed',reasonLabel:'Review note',placeholder:'e.g. Third-party contact details removed; internal note withheld',onConfirm:(r)=>this.upd(c.id,(n,log)=>{n.redReview='done';log('Redaction review completed','Redaction',r);})});
  v.rwCanExport=rr==='done'&&!c.exportDone;v.rwCantExport=!v.rwCanExport&&!c.exportDone;v.rwExported=c.exportDone;
  v.rwExport=()=>this.upd(c.id,(n,log,t,actor)=>{n.exportDone=true;n.files.push({id:'zendesk_r',name:'zendesk_tickets_00418_redacted_v2.pdf',type:'PDF',size:'179 KB',by:actor,at:t,sys:'Zendesk',redacted:true});log('Final redacted export generated','Redaction','','zendesk_tickets_00418_redacted_v2.pdf');});
  v.rwUpload=()=>this.upd(c.id,(n,log,t,actor)=>{const f='supporting_file_'+(n.files.length+1)+'.pdf';n.files.push({id:'u'+n.files.length,name:f,type:'PDF',size:'42 KB',by:actor,at:t,sys:'Manual upload'});log('File uploaded','Redaction','',f);});
  // erasure board
  v.board=Object.keys(OUT).map(o=>{const items=c.systems.filter(x=>(x.outcome||'Action required')===o&&(x.outcome||x.status!=='Not started'||o==='Action required'));const t=OUT[o];
   return {label:o,pill:P(OUT,o),count:items.length,topBd:T[t[0]][1],empty:!items.length,cards:items.map(x=>({name:SYSM[x.key].name,sub:SYSM[x.key].sub,owner:x.owner,date:x.outDate||'Pending',reason:x.reason||'No outcome recorded yet',hasEv:x.evidence.length>0,evLabel:x.evidence.length?'Evidence attached':'No evidence',evIcon:x.evidence.length?'icon-paperclip':'icon-circle-alert',evFg:x.evidence.length?'#0E6B4D':'#B54708',exCat:x.exCat,hasEx:!!x.exCat&&o==='Retained under exception',pill:P(OUT,o),go:()=>this.outcome(c.id,x.key)}))};});
  const actN=c.systems.filter(x=>x.status==='Action required').length;
  v.erBlock=actN>0;v.erBlockLabel=actN+(actN===1?' system is':' systems are')+' in Action required. The case cannot enter approval until '+(actN===1?'it is':'they are')+' resolved.';
  v.erOk=!actN;
  // approval
  v.apChecks=v.cvChecks;v.apAllOk=!blockers.length;v.apNotOk=blockers.length>0;
  v.tplOpts=['',...TEMPLATES].map(x=>({label:x||'Select a template',value:x}));v.tpl=c.template;
  v.onTpl=e=>{const val=e.target.value;this.upd(c.id,(n,log)=>{n.template=val;log('Response template selected: '+(val||'none'),'Approval');});};
  v.respText=respText(c,client);
  v.apStatus=P(STATUS,st);
  v.canSendApproval=(st==='In progress'||st==='Extended')&&!blockers.length;v.showSendApproval=st==='In progress'||st==='Extended';v.sendApprovalDis=v.showSendApproval&&blockers.length>0;
  v.sendApproval=()=>this.sendForApproval(c.id);
  v.isAwaiting=st==='Awaiting approval';v.canApprove=v.isAwaiting&&isApprover&&!blockers.length;v.approveDis=v.isAwaiting&&!v.canApprove;
  v.approveNote=!isApprover?'Switch to the Approver role to approve. Approver identity and timestamp are mandatory.':'Resolve the open checklist items first.';
  v.doApprove=()=>this.approve(c.id);v.doChanges=()=>this.requestChanges(c.id);v.doRefuse=()=>this.refuse(c.id);
  v.isClosed=st==='Completed'||st==='Rejected';v.notClosed=!v.isClosed;
  v.canSendResp=st==='Completed'&&!c.responseSent;v.respSent=c.responseSent;v.respNotReady=st!=='Completed';
  v.sendResp=()=>this.sendResp(c.id);v.copyResp=()=>this.copyResp(c);
  v.autoSendOff=!s.autoSend;
  // evidence
  v.packs=c.packs.slice().reverse().map((p,i)=>({...p,label:'v'+p.v,cur:i===0,kind:p.draft?pill('Draft','gray','file-pen'):pill('Final','ok','circle-check')}));
  v.hasPacks=c.packs.length>0;v.noPacks=!c.packs.length;v.packBtn=c.packs.length?'Regenerate pack':'Generate evidence pack';
  v.genPack=()=>this.genPack(c.id);v.sharePack=()=>this.sharePack(c.id);v.dlZip=()=>this.dlPack(c.id,'ZIP');v.dlPdf=()=>this.dlPack(c.id,'PDF');
  const owners={};c.audit.forEach(a=>{if(a.actor!=='System'&&a.actor.indexOf('requester')<0)owners[a.actor]=(owners[a.actor]||0)+1;});
  v.pk={reqRows:[['Case reference',c.id],['Request type',c.type],['Requester',c.name+' · '+c.email],['Account identifier',c.ident||'—'],['Received',fmt(pd(c.received))+' via hosted intake form']].map(([k,val])=>({k,val})),
   idRows:[['Email confirmation',c.emailV],['Identifier match',c.idMatch],['Decision',c.idDecision?(c.idDecision.rejected?'Rejected':'Approved')+' by '+c.idDecision.by+', '+c.idDecision.at:'Pending'],['Reason',c.idDecision?c.idDecision.reason:'—']].map(([k,val])=>({k,val})),
   slaRows:[['Received',fmt(pd(c.received))],['Statutory deadline',fmt(addM(pd(c.received),1))],['Extension',c.extMonths?c.extMonths+' month(s), deadline '+sl.deadline:'None'],['Closed',c.closed?c.closed+' 2026':'Open']].map(([k,val])=>({k,val})),
   sys:c.systems.map(x=>({name:SYSM[x.key].name,owner:x.owner,res:x.outcome||x.status,ev:x.evidence.join(', ')||'—'})),
   owners:Object.entries(owners).map(([n,k])=>({name:n,count:k+' recorded actions'})),
   red:c.redLog.map(r=>({...r})),hasRed:c.redLog.length>0,noRed:!c.redLog.length,
   appr:c.approvals.map(a=>({...a})),hasAppr:c.approvals.length>0,noAppr:!c.approvals.length,
   comms:c.comms.map(x=>({...x})),final:c.status+(c.closed?' · closed '+c.closed+' 2026':' · case still open'),isDraft:!v.isClosed};
  // audit
  const cats=['All','Identity','Checklist','Redaction','Erasure','Approval','Evidence','Communications','SLA'];
  v.auditFilters=cats.map(x=>{const a=s.auditFilter===x;return {label:x,bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',pressed:a?'true':'false',go:()=>this.setState({auditFilter:x})};});
  v.auditRows=c.audit.filter(a=>s.auditFilter==='All'||a.cat===s.auditFilter).slice().reverse().map(a=>({...a,hasReason:!!a.reason,hasObj:!!a.obj}));
  v.exportAudit=()=>{this.upd(c.id,(n,log)=>log('Audit log exported (CSV)','Evidence'));this.show('audit_'+c.id+'.csv prepared.');};
  // notes
  v.noteDraft=s.noteDraft;v.onNote=e=>this.setState({noteDraft:e.target.value});
  v.addNote=()=>{const tx=s.noteDraft.trim();if(!tx)return;this.upd(c.id,(n,log,t,actor)=>{n.notes.push({by:actor,at:t,text:tx});log('Internal note added','Case',tx);});this.setState({noteDraft:''});};
  v.goChecklist=()=>this.setState({tab:'checklist'});v.goWork=()=>this.setState({tab:'work'});v.goEvidence=()=>this.setState({tab:'evidence'});v.goApproval=()=>this.setState({tab:'approval'});
  v.backToCases=()=>this.go('cases');
  return v;
 }
}
