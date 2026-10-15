// Verbatim logic class from Privacyspace Admin.dc.html.
class Component extends DCLogic {
 state={screen:this.props.startScreen||'overview',role:this.props.defaultRole||'Platform admin',orgs:ORGS,orgSel:'northlight',orgQ:'',orgF:'All',planDraft:null,reviews:REVIEWS,reserved:['google','apple','microsoft','amazon','meta','paypal','stripe','admin','www','api','app','status','support','help','login','mail','privacyspace'],newRes:'',domains:DOMAINS,grants:GRANTS,staff:STAFF,audit:AUDIT,policy:{mfa:'new',retention:'24',access:'24',fallback:'on',dunning:'3'},auditF:'All',modal:null,mReason:'',mOpt:null,mTried:false,toast:null,clock:10*60+42,billTab:'revenue',subs:SUBS,payments:PAYMENTS,invoices:INVOICES,subSel:'mirabel',payF:'All',invF:'All'};
 stamp(){const c=this.state.clock,h=Math.floor(c/60),m=c%60;return '13 Oct 2026, '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
 me(){const r=this.state.role;return r==='Platform admin'?{name:'Noor Haddad',role:'Platform admin',initials:'NH'}:r==='Billing'?{name:'Ines Farah',role:'Billing',initials:'IF'}:{name:'Elif Demir',role:'Support',initials:'ED'};}
 show(msg){this.setState({toast:msg});clearTimeout(this._t);this._t=setTimeout(()=>this.setState({toast:null}),4000);}
 log(action,cat,reason){this.setState(s=>({clock:s.clock+1,audit:[{t:this.stamp(),actor:this.me().name,action,cat,reason:reason||''},...s.audit]}));}
 ask(m){this.setState({modal:m,mReason:'',mOpt:m.option||null,mTried:false});}
 setSub(k,fn){this.setState(s=>({subs:{...s.subs,[k]:fn({...s.subs[k]})}}));}
 go(screen){this.setState({screen});if(typeof window!=='undefined')window.scrollTo(0,0);}
 setOrg(key,fn){this.setState(s=>({orgs:s.orgs.map(o=>o.key===key?fn({...o}):o)}));}
 componentDidMount(){this._k=e=>{if(e.key==='Escape'&&this.state.modal)this.setState({modal:null});};window.addEventListener('keydown',this._k);}
 componentWillUnmount(){window.removeEventListener('keydown',this._k);clearTimeout(this._t);}
 renderVals(){
  const s=this.state,v={},isAdmin=s.role==='Platform admin';
  v.notAdmin=!isAdmin;v.me=this.me();v.roleHint=ROLES_INFO[s.role];
  v.roles=['Platform admin','Support','Billing'].map(r=>({label:r==='Platform admin'?'Admin':r,bg:r===s.role?'#FFFFFF':'transparent',fg:r===s.role?'#0B1F3A':'#C7D2E0',pressed:r===s.role?'true':'false',go:()=>this.setState({role:r})}));
  const pendRev=s.reviews.filter(r=>r.status==='pending');
  const badDom=s.domains.filter(d=>d.status!=='ok');
  const pendGr=s.grants.filter(g=>g.status==='pending');
  const overdueInv=s.invoices.filter(i=>i.status==='overdue');
  const NAV=[['overview','Overview','icon-layout-dashboard',0],['orgs','Organizations','icon-building-2',0],['billing','Billing & revenue','icon-receipt',overdueInv.length],['reviews','Subdomain reviews','icon-badge-check',pendRev.length],['domains','Domains & email','icon-globe',badDom.length],['access','Support access','icon-key-round',pendGr.length],['staff','Staff','icon-users',0],['policy','Platform policies','icon-sliders-horizontal',0],['audit','Staff audit log','icon-scroll-text',0]];
  v.nav=NAV.map(([k,label,icon,n])=>{const a=s.screen===k;return {label,icon,hasCount:n>0,count:n,countBg:k==='domains'||k==='billing'?'#B42318':'#24507A',bg:a?'#173A5E':'transparent',fg:a?'#FFFFFF':'#C7D2E0',bar:a?'#14919B':'transparent',current:a?'page':'false',go:()=>this.go(k)};});
  ['overview','orgs','billing','reviews','domains','access','staff','policy','audit'].forEach(k=>v['is'+{overview:'Overview',orgs:'Orgs',billing:'Billing',reviews:'Reviews',domains:'Domains',access:'Access',staff:'Staff',policy:'Policy',audit:'Audit'}[k]]=s.screen===k);
  const orgName=k=>(s.orgs.find(o=>o.key===k)||{}).name||k;
  const mrrOf=k=>{const b=s.subs[k];if(b.status==='trial'||b.status==='past_due')return 0;return b.cycle==='Annual'?b.price/12:b.price;};
  const subKeys=Object.keys(s.subs);const mrr=subKeys.reduce((a,k)=>a+mrrOf(k),0);
  const atRisk=subKeys.filter(k=>s.subs[k].status==='past_due').reduce((a,k)=>a+s.subs[k].price,0);
  // overview
  const allWs=s.orgs.reduce((a,o)=>a+o.ws.length,0),live=s.orgs.reduce((a,o)=>a+o.ws.filter(w=>w.p==='live').length,0);
  v.kpis=[{label:'Organizations',val:s.orgs.length,sub:s.orgs.filter(o=>o.kind==='Agency').length+' agency · '+s.orgs.filter(o=>o.status==='Trial').length+' on trial'},{label:'Workspaces',val:allWs,sub:'Across all organizations'},{label:'Live portals',val:live,sub:(allWs-live)+' not live yet'},{label:'Open requests',val:s.orgs.reduce((a,o)=>a+o.openReq,0),sub:'Counts only. Contents stay private.'},{label:'Monthly recurring revenue',val:E(mrr),sub:atRisk?E(atRisk)+' at risk · '+overdueInv.length+' overdue':'Nothing overdue'}];
  const att=[];
  pendRev.forEach(r=>att.push({icon:'icon-badge-check',tone:r.flag?'bad':'info',title:'Review '+r.sub+'.privacyspace.com',sub:r.orgName+(r.flag?' · looks like a protected brand':''),age:r.age,go:()=>this.go('reviews')}));
  badDom.forEach(d=>att.push({icon:'icon-globe',tone:d.status==='failing'?'bad':'warn',title:(d.status==='failing'?'Sender failing · ':'Waiting for DNS · ')+d.domain,sub:d.issue,age:d.status==='failing'?'4 d':'3 d',go:()=>this.go('domains')}));
  overdueInv.forEach(i=>att.push({icon:'icon-credit-card',tone:'bad',title:'Payment failed · '+orgName(i.org),sub:i.no+' · '+E(i.amount)+' overdue since '+i.due.slice(0,6)+' · '+i.note,age:'',go:()=>{this.setState({billTab:'subs',subSel:i.org});this.go('billing');}}));
  s.orgs.filter(o=>!o.mfa&&o.status!=='Suspended').forEach(o=>att.push({icon:'icon-shield-alert',tone:'warn',title:o.name+' hasn’t turned on MFA',sub:'Trial ends '+(o.trialEnds||'—')+'. Required before going to a paid plan.',age:'',go:()=>{this.setState({orgSel:o.key,planDraft:null});this.go('orgs');}}));
  v.attention=att.map(a=>({...a,bg:T[a.tone][0],fg:T[a.tone][1]}));v.noAttention=!att.length;
  v.services=[['Request portals','ok'],['Email sending','ok'],['Evidence pack exports','ok'],['DNS checks','ok'],['Public API','degraded']].map(([name,st])=>({name,state:st==='ok'?'Operational':'Slower than usual',dot:st==='ok'?'#12B76A':'#F79009',fg:st==='ok'?'#0E6B4D':'#B54708'}));
  // orgs
  const q=s.orgQ.trim().toLowerCase();
  const rows=s.orgs.filter(o=>(!q||(o.name+' '+o.adminEmail).toLowerCase().indexOf(q)>-1)&&(s.orgF==='All'||(s.orgF==='Needs attention'?(o.status!=='Active'||!o.mfa):o.kind===s.orgF)));
  v.orgQ=s.orgQ;v.onOrgQ=e=>this.setState({orgQ:e.target.value});
  v.orgFilters=['All','Agency','Direct','Needs attention'].map(f=>{const a=s.orgF===f;return {label:f,pressed:a?'true':'false',bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',go:()=>this.setState({orgF:f})};});
  const stP=o=>o.status==='Active'?pill('Active','ok','circle-check'):o.status==='Trial'?pill('Trial · ends '+o.trialEnds.slice(0,6),'info','clock'):pill('Suspended','bad','ban');
  v.orgRows=rows.map(o=>{const lv=o.ws.filter(w=>w.p==='live').length;return {name:o.name,initial:o.name[0],kind:o.kind,adminEmail:o.adminEmail,plan:o.plan,wsCount:o.ws.length,liveLabel:lv+' of '+o.ws.length+' live',mfa:o.mfa?pill('Required','ok','shield-check'):pill('Optional','warn','shield-alert'),st:stP(o),bg:o.key===s.orgSel?'#F2F7F7':'#FFFFFF',go:()=>this.setState({orgSel:o.key,planDraft:null})};});
  v.noOrgs=!rows.length;
  const o=s.orgs.find(x=>x.key===s.orgSel);v.hasOrg=!!o;v.planOpts=['Starter','Growth','Agency'];
  if(o){
   const gr=s.grants.find(g=>g.org===o.key&&g.status==='active'),pg=s.grants.find(g=>g.org===o.key&&g.status==='pending');
   const pd=s.planDraft||o.plan;
   const note=o.status==='Suspended'?o.suspendReason:o.status==='Trial'?'Trial ends '+o.trialEnds+'. MFA is optional for this organization.':'';
   const sb=s.subs[o.key];
   v.od={...o,initial:o.name[0],st:stP(o),billLine:sb?(sb.status==='trial'?'Trial · no payment method':sb.status==='past_due'?'Past due · '+E(sb.price)+' unpaid':E(sb.price)+(sb.cycle==='Annual'?' / year':' / month')+' · next invoice '+sb.next.split(',')[0]):'—',toBilling:()=>{this.setState({billTab:'subs',subSel:o.key});this.go('billing');},hasNote:!!note,note,noteBg:o.status==='Suspended'?'#FEE4E2':'#D9E8FF',noteFg:o.status==='Suspended'?'#B42318':'#175CD3',
    mfaText:o.mfa?'Required for every member':'Optional. Members can sign in without it.',
    ws:o.ws.map(w=>({...w,p:pill(WSP[w.p][0],WSP[w.p][1])})),
    planDraft:pd,planSame:pd===o.plan||!isAdmin,onPlan:e=>this.setState({planDraft:e.target.value}),
    savePlan:()=>this.ask({title:'Change plan to '+pd,desc:o.name+' moves from '+o.plan+' to '+pd+'. Billing changes on the next invoice. The owner, '+o.admin+', gets an email.',confirmLabel:'Change plan',run:r=>{this.setOrg(o.key,x=>{x.plan=pd;return x;});this.setState({planDraft:null});this.log('Changed plan for '+o.name+': '+o.plan+' → '+pd,'Organizations',r);this.show('Plan changed');}}),
    hasGrant:!!gr,grantWs:gr?gr.ws:'',grantLeft:gr?gr.left:'',pendingGrant:!gr&&!!pg,canRequest:!gr&&!pg&&o.status!=='Suspended',
    requestAccess:()=>this.ask({title:'Request support access',desc:'Asks '+o.admin+' to let '+this.me().name+' open '+o.ws[0].name+' for 24 hours with settings and portal access only. Request contents stay hidden. The customer sees this request in their audit log.',confirmLabel:'Send request',reasonLabel:'Reason shown to the customer',placeholder:'e.g. Ticket #4840 · portal shows the wrong logo',run:r=>{this.setState(st=>({grants:[{id:'g'+Date.now(),org:o.key,orgName:o.name,ws:o.ws[0].name,staff:this.me().name,scope:'Settings and portal only',reason:r,status:'pending',approvedBy:'',left:''},...st.grants]}));this.log('Requested support access to '+o.ws[0].name+' · '+o.name,'Access',r);this.show('Request sent to '+o.admin);}}),
    needsMfa:!o.mfa,enforceMfa:()=>this.ask({title:'Require MFA',desc:'Every member of '+o.name+' must set up MFA at their next sign-in. Members without it are blocked until they do.',confirmLabel:'Require MFA',run:r=>{this.setOrg(o.key,x=>{x.mfa=true;return x;});this.log('Required MFA for '+o.name,'Organizations',r);this.show('MFA now required');}}),
    canSuspend:o.status!=='Suspended',canReactivate:o.status==='Suspended',
    suspend:()=>this.ask({danger:true,title:'Suspend '+o.name,desc:'Members can’t sign in. Portals stay online and keep accepting requests so requesters aren’t blocked, and statutory deadlines keep running. The owner is told by email.',confirmLabel:'Suspend organization',run:r=>{this.setOrg(o.key,x=>{x.status='Suspended';x.suspendReason=r;return x;});this.log('Suspended '+o.name,'Organizations',r);this.show(o.name+' suspended');}}),
    reactivate:()=>this.ask({title:'Reactivate '+o.name,desc:'Members can sign in again straight away.',confirmLabel:'Reactivate',run:r=>{this.setOrg(o.key,x=>{x.status='Active';x.suspendReason='';return x;});this.log('Reactivated '+o.name,'Organizations',r);this.show(o.name+' reactivated');}})};
  }
  // billing
  const canBill=isAdmin||s.role==='Billing';v.canBill=canBill;v.notBill=!canBill;
  const overdueN=overdueInv.length;
  v.billTabs=[['revenue','Revenue',''],['subs','Subscriptions',''],['payments','Payments',''],['invoices','Invoices',overdueN?String(overdueN):''],['plans','Plans & prices','']].map(([k,label,b])=>{const a=s.billTab===k;return {label,badge:b,hasBadge:!!b,sel:a?'true':'false',fg:a?'#0B1F3A':'#667085',bd:a?'#0E7C7B':'transparent',w:a?'600':'500',go:()=>this.setState({billTab:k})};});
  v.btRevenue=s.billTab==='revenue';v.btSubs=s.billTab==='subs';v.btPayments=s.billTab==='payments';v.btInvoices=s.billTab==='invoices';v.btPlans=s.billTab==='plans';
  const octPays=s.payments.filter(p=>p.at.indexOf('Oct 2026')>-1&&p.status!=='failed');const recOct=octPays.reduce((a,p)=>a+p.amount,0);
  const outstanding=overdueInv.reduce((a,i)=>a+i.amount,0);const paying=subKeys.filter(k=>mrrOf(k)>0).length;
  const trials=subKeys.filter(k=>s.subs[k].status==='trial');
  v.billKpis=[{label:'Monthly recurring revenue',val:E(mrr),fg:'#0B1F3A',sub:paying+' paying organizations · ARR '+E(mrr*12)},{label:'Received in October',val:E(recOct),fg:'#0B1F3A',sub:octPays.filter(p=>p.amount>0).length+' payments · to 13 Oct'},{label:'Outstanding',val:E(outstanding),fg:outstanding?'#B42318':'#0B1F3A',sub:overdueN?overdueN+' overdue invoice'+(overdueN===1?'':'s'):'Nothing overdue'},{label:'On trial',val:String(trials.length),fg:'#0B1F3A',sub:trials.map(k=>orgName(k)+' · ends '+String(s.orgs.find(o=>o.key===k).trialEnds||'').slice(0,6)).join(' · ')||'No trials running'}];
  const cash=[...CASH,['Oct',recOct]];const cmax=Math.max(...cash.map(c=>c[1]));
  v.cashBars=cash.map(([m,val],i)=>{const cur=i===cash.length-1;return {m:cur?m+' (to date)':m,label:E(val),h:Math.max(3,Math.round(val/cmax*100))+'%',bg:cur?'#D7F0EF':'#0E7C7B',bdStyle:cur?'dashed':'solid'};});
  v.cashAria='Cash received by month: '+cash.map(c=>c[0]+' '+E(c[1])).join(', ');
  v.mrrPlans=['Agency','Growth','Starter'].map(pl=>{const ks=subKeys.filter(k=>(s.orgs.find(o=>o.key===k)||{}).plan===pl);const val=ks.reduce((a,k)=>a+mrrOf(k),0);const pay=ks.filter(k=>mrrOf(k)>0).length;return {name:pl,val:E(val),sub:pay+' paying'+(ks.length>pay?' · '+(ks.length-pay)+' trial or past due':''),pct:(mrr?Math.round(val/mrr*100):0)+'%'};});
  const ba=[];
  subKeys.forEach(k=>{const b=s.subs[k],o=s.orgs.find(x=>x.key===k);const sel=()=>this.setState({billTab:'subs',subSel:k});
   if(b.status==='past_due')ba.push({icon:'icon-credit-card',tone:'bad',title:'Payment failed · '+o.name,sub:(b.failed||0)+' failed attempts · '+E(b.price)+' overdue since 1 Oct'+(o.status==='Suspended'?' · organization suspended':''),go:sel});
   if(b.status==='trial')ba.push({icon:'icon-clock',tone:'warn',title:'Trial ends '+String(o.trialEnds||'').slice(0,6)+' · '+o.name,sub:b.method==='None on file'?'No payment method on file. Moves to '+o.plan+' at '+E(b.price)+' / month once one is added.':'Converts to '+o.plan+' at '+E(b.price)+' / month.',go:sel});
   if(b.used>b.incl)ba.push({icon:'icon-trending-up',tone:'info',title:o.name+' is over its included DSARs',sub:b.used+' of '+b.incl+' this period · '+E((b.used-b.incl)*b.over)+' overage on the next invoice',go:sel});});
  const rank={bad:0,warn:1,info:2};ba.sort((a,b)=>rank[a.tone]-rank[b.tone]);v.billAttention=ba.map(a=>({...a,bg:T[a.tone][0],fg:T[a.tone][1]}));v.noBillAttention=!ba.length;
  const subSt=b=>b.status==='active'?pill('Active','ok','circle-check'):b.status==='trial'?pill('Trial','info','clock'):b.status==='past_due'?pill('Past due','bad','credit-card'):pill('Cancels '+b.next.split(',')[0],'warn','circle-x');
  const invSt=i=>i.status==='paid'?pill('Paid '+i.paid,'ok','circle-check'):i.status==='overdue'?pill('Overdue','bad','circle-alert'):i.status==='void'?pill('Void','gray','ban'):pill('Upcoming','gray','calendar');
  v.subRows=subKeys.map(k=>{const b=s.subs[k],o=s.orgs.find(x=>x.key===k),over=b.used>b.incl;return {name:o.name,kind:o.kind,plan:o.plan,cycle:b.cycle,mrr:mrrOf(k)?E(mrrOf(k)):'—',usage:b.used+' of '+b.incl,useFg:over?'#B54708':'#101828',useW:over?'600':'400',next:b.status==='past_due'?'Held':b.next.split(',')[0],st:subSt(b),bg:k===s.subSel?'#F2F7F7':'#FFFFFF',go:()=>this.setState({subSel:k})};});
  {const k=s.subSel,b=s.subs[k],o=s.orgs.find(x=>x.key===k);const over=Math.max(0,b.used-b.incl);const overAmt=over*b.over;
   const nextAmt=Math.max(0,(b.cycle==='Annual'?b.price:b.price+overAmt)-b.credit);
   const note=b.status==='past_due'?(b.failed||0)+' payment attempts failed. '+(o.status==='Suspended'?'Suspended automatically for non-payment; portals still accept requests. Paying the invoice reactivates it automatically.':'Suspends automatically '+s.policy.dunning+' days after the final failed attempt.'):b.status==='trial'?'Trial ends '+o.trialEnds+'. '+(b.method==='None on file'?'No payment method yet.':''):b.status==='canceling'?'Cancels at the end of the current period. Portals keep running until then.':'';
   v.sd={name:o.name,plan:o.plan,cycle:b.cycle,started:b.started,st:subSt(b),hasNote:!!note,note,noteBg:b.status==='past_due'?'#FEE4E2':b.status==='canceling'?'#FDF0DC':'#D9E8FF',noteFg:b.status==='past_due'?'#B42318':b.status==='canceling'?'#B54708':'#175CD3',
    priceLine:E(b.price)+(b.cycle==='Annual'?' / year':' / month')+(b.cycle==='Annual'?' · '+E(b.price/12)+' MRR':''),method:b.method,period:b.period,
    nextLine:b.status==='past_due'?b.next:b.status==='canceling'?'None. Ends '+b.next.split(',')[0]:b.next.split(',')[0]+' · '+E(nextAmt)+(over&&b.cycle!=='Annual'?' incl. '+E(overAmt)+' overage':'')+(b.credit?' after '+E(b.credit)+' credit':''),
    credit:b.credit?E(b.credit):'€0',usage:b.used+' of '+b.incl,usePct:Math.min(100,Math.round(b.used/b.incl*100))+'%',useBar:over?'#B54708':'#0E7C7B',
    overLine:over?over+' over × '+E(b.over)+' = '+E(overAmt)+(b.cycle==='Annual'?', billed monthly in arrears':', added to the next invoice'):(b.incl-b.used)+' left this period. Overage is '+E(b.over)+' per DSAR.',
    invoices:s.invoices.filter(i=>i.org===k).slice(0,4).map(i=>({no:i.no,period:i.period,amt:E(i.amount),st:invSt(i)})),
    canRetry:b.status==='past_due',canExtend:b.status==='trial',canCredit:b.status!=='trial',canCancel:b.status==='active',canResume:b.status==='canceling',
    toOrg:()=>{this.setState({orgSel:k,planDraft:null});this.go('orgs');},
    retry:()=>this.ask({title:'Retry payment for '+o.name,desc:'Charges '+b.method.split(' · ')[0]+' for '+E(b.price)+' (INV-2026-0141) now. If it succeeds the invoice is marked paid and, if the organization was suspended for non-payment, it’s reactivated automatically.',confirmLabel:'Retry payment',run:r=>{this.setState(st=>({payments:[{id:'py_'+Date.now(),at:'13 Oct 2026',org:k,inv:'INV-2026-0141',method:b.method.split(' · ')[0],amount:b.price,status:'succeeded',note:'Manual retry by '+this.me().name},...st.payments],invoices:st.invoices.map(i=>i.org===k&&i.status==='overdue'?{...i,status:'paid',paid:'13 Oct',note:'Paid on manual retry'}:i),subs:{...st.subs,[k]:{...st.subs[k],status:'active',method:b.method.split(' · ')[0],failed:0,next:'1 Nov 2026'}}}));const wasSusp=o.status==='Suspended';if(wasSusp)this.setOrg(k,x=>{x.status='Active';x.suspendReason='';return x;});this.log('Retried payment for '+o.name+' · '+E(b.price)+' succeeded','Billing',r);if(wasSusp)this.setState(st=>({audit:[{t:this.stamp(),actor:'System',action:'Reactivated '+o.name+' automatically after payment',cat:'Billing',reason:''},...st.audit]}));this.show(wasSusp?'Payment received. '+o.name+' reactivated automatically.':'Payment received.');}}),
    extend:()=>this.ask({title:'Extend trial for '+o.name,desc:'The trial end date moves. The owner, '+o.admin+', gets an email with the new date.',confirmLabel:'Extend trial',options:['7 days','14 days'],optionLabel:'Extend by',run:(r,opt)=>{const nd=opt==='7 days'?'28 Oct 2026':'4 Nov 2026';this.setOrg(k,x=>{x.trialEnds=nd;return x;});this.setSub(k,x=>{x.period='Trial, 7 Oct – '+nd.slice(0,6)+' 2026';x.next=nd+', if a payment method is added';return x;});this.log('Extended trial for '+o.name+' by '+opt+' to '+nd,'Billing',r);this.show('Trial extended to '+nd);}}),
    credit2:()=>this.ask({title:'Apply credit to '+o.name,desc:'The credit is taken off the next invoice. It shows on the customer’s invoice with your reason.',confirmLabel:'Apply credit',options:['€25','€50','€100'],optionLabel:'Amount',reasonLabel:'Reason shown on the invoice',placeholder:'e.g. Goodwill credit for the 9 Oct export outage',run:(r,opt)=>{const n=Number(opt.slice(1));this.setSub(k,x=>{x.credit=(x.credit||0)+n;return x;});this.log('Applied '+opt+' credit to '+o.name,'Billing',r);this.show(opt+' credit applied to the next invoice');}}),
    cancel:()=>this.ask({danger:true,title:'Cancel '+o.name+' at period end',desc:'The subscription ends on '+b.next.split(',')[0]+'. Until then nothing changes. After that, members lose access; open cases and evidence packs stay downloadable for 30 days.',confirmLabel:'Cancel subscription',run:r=>{this.setSub(k,x=>{x.status='canceling';return x;});this.log('Set '+o.name+' to cancel at period end ('+b.next.split(',')[0]+')','Billing',r);this.show('Subscription will cancel on '+b.next.split(',')[0]);}}),
    resume:()=>this.ask({title:'Resume subscription',desc:o.name+' continues on '+o.plan+' with no gap.',confirmLabel:'Resume',run:r=>{this.setSub(k,x=>{x.status='active';return x;});this.log('Resumed subscription for '+o.name,'Billing',r);this.show('Subscription resumed');}})};
  }
  const pf=s.payF;const prow=s.payments.filter(p=>pf==='All'||(pf==='Succeeded'&&p.status==='succeeded')||(pf==='Failed'&&p.status==='failed')||(pf==='Refunds'&&p.status==='refund'));
  v.payFilters=['All','Succeeded','Failed','Refunds'].map(f=>{const a=pf===f;return {label:f,pressed:a?'true':'false',bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',go:()=>this.setState({payF:f})};});
  const refunded=id=>s.payments.some(x=>x.refundOf===id)||false;
  v.payRows=prow.map(p=>({at:p.at,orgName:orgName(p.org),inv:p.inv,method:p.method,note:p.note,hasNote:!!p.note,noteFg:p.status==='failed'?'#B42318':'#667085',amt:E(p.amount),amtFg:p.status==='failed'?'#98A2B3':p.amount<0?'#475467':'#0B1F3A',
   st:p.status==='succeeded'?pill(refunded(p.id)?'Refunded':'Succeeded',refunded(p.id)?'gray':'ok',refunded(p.id)?'undo-2':'circle-check'):p.status==='failed'?pill('Failed','bad','circle-x'):pill('Refund','gray','undo-2'),
   canRefund:p.status==='succeeded'&&!refunded(p.id),
   refund:()=>this.ask({danger:true,title:'Refund '+E(p.amount)+' to '+orgName(p.org),desc:'Returns the full payment for '+p.inv+' to '+p.method+'. It can take 5–10 business days to arrive. The invoice shows the refund.',confirmLabel:'Refund payment',reasonLabel:'Reason shown to the customer',run:r=>{this.setState(st=>({payments:[{id:'py_'+Date.now(),at:'13 Oct 2026',org:p.org,inv:p.inv,method:p.method,amount:-p.amount,status:'refund',note:r,refundOf:p.id},...st.payments]}));this.log('Refunded '+E(p.amount)+' to '+orgName(p.org)+' · '+p.inv,'Billing',r);this.show('Refund issued');}})}));
  v.noPays=!prow.length;
  const rec=prow.filter(p=>p.status==='succeeded').reduce((a,p)=>a+p.amount,0),ref=prow.filter(p=>p.status==='refund').reduce((a,p)=>a-p.amount,0);
  v.payTotals={rec:E(rec),ref:E(ref),net:E(rec-ref),fail:String(prow.filter(p=>p.status==='failed').length)};
  const inf=s.invF;const irow=s.invoices.filter(i=>inf==='All'||i.status===inf.toLowerCase());
  v.invFilters=['All','Upcoming','Overdue','Paid','Void'].map(f=>{const a=inf===f;return {label:f,pressed:a?'true':'false',bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',go:()=>this.setState({invF:f})};});
  v.invRows=irow.map(i=>({no:i.no,orgName:orgName(i.org),period:i.period,due:i.status==='upcoming'?'Issues '+i.due:i.due,amt:E(i.amount),note:i.note,hasNote:!!i.note,st:invSt(i),canPdf:i.status!=='upcoming',canRemind:i.status==='overdue',
   pdf:()=>this.show(i.no+'.pdf prepared'),
   remind:()=>{this.log('Sent payment reminder for '+i.no+' to '+orgName(i.org),'Billing');this.show('Reminder sent to '+(s.orgs.find(o=>o.key===i.org)||{}).adminEmail);},
   void:()=>this.ask({danger:true,title:'Void '+i.no,desc:'The invoice is cancelled and no longer owed. This can’t be undone; issue a new invoice if needed.',confirmLabel:'Void invoice',run:r=>{this.setState(st=>({invoices:st.invoices.map(x=>x.no===i.no?{...x,status:'void',note:'Voided by '+this.me().name}:x),subs:st.subs[i.org]&&st.subs[i.org].status==='past_due'?{...st.subs,[i.org]:{...st.subs[i.org],status:'active',failed:0,next:'1 Nov 2026'}}:st.subs}));this.log('Voided '+i.no+' for '+orgName(i.org),'Billing',r);this.show(i.no+' voided');}})}));
  v.noInvs=!irow.length;
  v.planCards=PLANS.map(p=>{const n=s.orgs.filter(o=>o.plan===p.name).length;return {name:p.name,m:E(p.m),y:E(p.y),incl:p.incl,ws:p.ws,over:E(p.over)+' per extra DSAR',extra:p.extra,count:n+(n===1?' organization':' organizations')};});
  v.exportBilling=()=>{this.log('Exported billing data ('+s.billTab+')','Billing');this.show('Billing CSV exported');};
  // reviews
  v.reviewCards=s.reviews.map(r=>{const setR=(status,decision,extra)=>this.setState(st=>({reviews:st.reviews.map(x=>x.id===r.id?{...x,status,decision}:x),...(extra?extra(st):{})}));const host=r.sub+'.privacyspace.com';
   return {...r,host,hasFlag:!!r.flag,pending:r.status==='pending',decided:r.status!=='pending',p:r.status==='pending'?(r.flag?pill('Flagged','bad'):pill('Waiting','info')):r.status==='approved'?pill('Approved','ok'):pill('Rejected','gray'),
    approve:()=>this.ask({title:'Approve '+host,desc:r.orgName+' can publish their portal at this address. The requester is told by email.',confirmLabel:'Approve name',run:x=>{setR('approved','Approved by '+this.me().name+' · '+x,st=>({orgs:st.orgs.map(o=>o.key===r.org?{...o,ws:o.ws.map(w=>w.host===host?{...w,p:'setup'}:w)}:o)}));this.log('Approved subdomain '+host+' for '+r.orgName,'Subdomains',x);this.show('Name approved');}}),
    reject:()=>this.ask({danger:true,title:'Reject '+host,desc:'The customer is asked to choose another name. Your reason is shown to them.',confirmLabel:'Reject',reasonLabel:'Reason shown to the customer',run:x=>{setR('rejected','Rejected by '+this.me().name+' · '+x);this.log('Rejected subdomain '+host,'Subdomains',x);this.show('Name rejected');}}),
    reserve:()=>this.ask({danger:true,title:'Reject and reserve “'+r.sub+'”',desc:'Rejects this claim and adds the name to the reserved list so no one else can claim it.',confirmLabel:'Reject and reserve',run:x=>{setR('rejected','Rejected and reserved by '+this.me().name+' · '+x,st=>({reserved:[...st.reserved,r.sub]}));this.log('Rejected and reserved '+r.sub,'Subdomains',x);this.show('Rejected and reserved');}})};});
  v.reservedChips=s.reserved.map(n=>({name:n,remove:()=>this.ask({title:'Remove “'+n+'” from reserved names',desc:'Any customer could then claim '+n+'.privacyspace.com.',confirmLabel:'Remove',run:x=>{this.setState(st=>({reserved:st.reserved.filter(y=>y!==n)}));this.log('Removed reserved name '+n,'Subdomains',x);}})}));
  v.newRes=s.newRes;v.onNewRes=e=>this.setState({newRes:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')});
  v.addRes=()=>{const n=s.newRes;if(n.length<3)return this.show('Use at least 3 characters');if(s.reserved.includes(n))return this.show(n+' is already reserved');this.ask({title:'Reserve “'+n+'”',desc:'New claims for '+n+'.privacyspace.com are blocked. Existing portals aren’t affected.',confirmLabel:'Reserve name',run:x=>{this.setState(st=>({reserved:[...st.reserved,n],newRes:''}));this.log('Reserved name '+n,'Subdomains',x);}});};
  // domains
  v.domainRows=s.domains.map(d=>({...d,hasIssue:!!d.issue,canCheck:d.status!=='ok',p:d.status==='ok'?pill('Verified','ok','circle-check'):d.status==='failing'?pill('Failing','bad','circle-x'):pill('Waiting for DNS','warn','hourglass'),
   recheck:()=>{this.setState(st=>({clock:st.clock+1,domains:st.domains.map(x=>x.id===d.id?{...x,checked:'13 Oct, '+this.stamp().slice(-5)}:x)}));this.log('Re-checked DNS for '+d.domain+' · still not passing','Domains');this.show('Checked. Records still not found.');},
   remind:()=>{this.log('Emailed owner about '+d.domain+' with the records to add','Domains');this.show('Email sent with the DNS records');}}));
  // access
  v.grantRows=s.grants.map(g=>({...g,ws:g.ws,org:g.orgName,isPending:g.status==='pending',isActive:g.status==='active',
   p:g.status==='active'?pill('Active','ok'):g.status==='pending'?pill('Waiting for customer','warn'):pill('Ended','gray'),
   detail:g.status==='active'?'Approved by '+g.approvedBy+' · '+g.left:g.status==='pending'?'Sent to the owner':g.left,
   simApprove:()=>{const o2=s.orgs.find(x=>x.key===g.org);this.setState(st=>({grants:st.grants.map(x=>x.id===g.id?{...x,status:'active',approvedBy:o2.admin,left:'24 h left'}:x)}));this.log(o2.admin+' (customer) approved support access for '+g.staff+' · '+g.ws+' · 24 h','Access');this.show('Access approved for 24 hours');},
   revoke:()=>this.ask({danger:true,title:'End support access',desc:g.staff+' loses access to '+g.ws+' immediately. The customer is told.',confirmLabel:'End access',run:x=>{this.setState(st=>({grants:st.grants.map(y=>y.id===g.id?{...y,status:'ended',left:'Ended '+this.stamp().slice(0,6)+', '+this.stamp().slice(-5)}:y)}));this.log('Ended support access for '+g.staff+' · '+g.ws,'Access',x);this.show('Access ended');}})}));
  // staff
  v.staffRoles=['Platform admin','Support','Security','Billing'];
  v.staffRows=s.staff.map(p=>{const self=p.name===v.me.name;return {...p,initials:p.name.split(' ').map(x=>x[0]).join(''),key:p.key?pill('Registered','ok','key-round'):pill('Not set up','warn','shield-alert'),lock:!isAdmin||self,canRemove:isAdmin&&!self,
   onRole:e=>{const r2=e.target.value;this.ask({title:'Change role for '+p.name,desc:p.name+' becomes '+r2+'. Permissions change at their next action.',confirmLabel:'Change role',run:x=>{this.setState(st=>({staff:st.staff.map(y=>y.name===p.name?{...y,role:r2}:y)}));this.log('Changed '+p.name+' from '+p.role+' to '+r2,'Staff',x);}});},
   remove:()=>this.ask({danger:true,title:'Remove '+p.name,desc:'Their console access and any active support access end immediately.',confirmLabel:'Remove',run:x=>{this.setState(st=>({staff:st.staff.filter(y=>y.name!==p.name),grants:st.grants.map(g=>g.staff===p.name&&g.status==='active'?{...g,status:'ended',left:'Ended on removal'}:g)}));this.log('Removed staff member '+p.name,'Staff',x);}})};});
  v.inviteStaff=()=>this.show('Invitation sent. A security key is required at first sign-in.');
  // policy
  const PL=[['mfa','Multi-factor authentication','Who must use MFA. Agencies and paid plans always require it.',[['new','Required for new organizations'],['all','Required for every organization'],['paid','Required on paid plans only']]],
   ['retention','Delete closed cases after','Default for new workspaces. Customers can choose a shorter period.',[['12','12 months'],['24','24 months'],['36','36 months']]],
   ['access','Longest support access','Maximum length a customer can approve per request.',[['4','4 hours'],['24','24 hours'],['72','72 hours']]],
   ['dunning','Suspend for non-payment','Automatic. Members are locked out this long after the final failed payment attempt. Portals keep accepting requests and deadlines keep running. Paying reactivates the organization.',[['3','3 days after final attempt'],['7','7 days after final attempt'],['14','14 days after final attempt']]],
   ['fallback','Fallback sender','When a customer’s sending domain fails, send from no-reply@privacyspace.com so requesters still get emails.',[['on','Use fallback sender'],['off','Hold emails until fixed']]]];
  v.policies=PL.map(([k,label,help,opts])=>({label,help,val:s.policy[k],opts:opts.map(([v2,l])=>({v:v2,l})),onChange:e=>{const nv=e.target.value,nl=opts.find(x=>x[0]===nv)[1],ol=opts.find(x=>x[0]===s.policy[k])[1];this.ask({title:'Change “'+label+'”',desc:ol+' → '+nl+'. Applies to every organization from now on.',confirmLabel:'Change policy',run:x=>{this.setState(st=>({policy:{...st.policy,[k]:nv}}));this.log('Policy “'+label+'”: '+ol+' → '+nl,'Policy',x);this.show('Policy updated');}});}}));
  // audit
  const cats=['All','Organizations','Billing','Subdomains','Domains','Access','Staff','Policy'];
  v.auditFilters=cats.map(f=>{const a=s.auditF===f;return {label:f,pressed:a?'true':'false',bg:a?'#0B1F3A':'#FFFFFF',fg:a?'#FFFFFF':'#344054',bd:a?'#0B1F3A':'#D0D5DD',go:()=>this.setState({auditF:f})};});
  v.auditRows=s.audit.filter(a=>s.auditF==='All'||a.cat===s.auditF).map(a=>({...a,hasReason:!!a.reason}));
  v.exportAudit=()=>{this.log('Exported staff audit log','Staff');this.show('Audit log exported as CSV');};
  // modal
  const m=s.modal;v.hasModal=!!m;v.mReason=s.mReason;
  v.md=m?{title:m.title,desc:m.desc,confirmLabel:m.confirmLabel,reasonLabel:m.reasonLabel||'Reason (required, saved in the audit log)',placeholder:m.placeholder||'Why are you doing this?',btnBg:m.danger?'#B42318':'#0E7C7B',hasErr:s.mTried&&s.mReason.trim().length<5,hasOptions:!!m.options,optionLabel:m.optionLabel||'Option',optErr:s.mTried&&!!m.options&&!s.mOpt,options:(m.options||[]).map(o=>{const a=s.mOpt===o;return {label:o,checked:a?'true':'false',bg:a?'#D7F0EF':'#FFFFFF',bd:a?'#0E7C7B':'#D0D5DD',dot:a?'#0E7C7B':'#FFFFFF',dotB:a?'#0E7C7B':'#98A2B3',pick:()=>this.setState({mOpt:o})};})}:{};
  v.onReason=e=>this.setState({mReason:e.target.value});v.closeModal=()=>this.setState({modal:null});v.stop=e=>e.stopPropagation();
  v.confirmModal=()=>{const r=s.mReason.trim();if(r.length<5||(m.options&&!s.mOpt))return this.setState({mTried:true});const run=m.run,opt=s.mOpt;this.setState({modal:null});run(r,opt);};
  v.hasToast=!!s.toast;v.toast=s.toast;
  return v;
 }
}
