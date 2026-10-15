// Verbatim logic from Requester Portal.dc.html. window.__rp hook and the "scenario" prop are prototype-only.
const SC_STATUS={
 info:{label:'Confirming your identity',bg:'#FDF0DC',fg:'#B54708',icon:'icon-circle-alert'},
 progress:{label:'Collecting your data',bg:'#D7F0EF',fg:'#0A6463',icon:'icon-circle-dot'},
 extended:{label:'Extended',bg:'#D9E8FF',fg:'#175CD3',icon:'icon-calendar-clock'},
 review:{label:'Final review',bg:'#D9E8FF',fg:'#175CD3',icon:'icon-lock'},
 done:{label:'Completed',bg:'#D9F2E7',fg:'#0E6B4D',icon:'icon-circle-check'}
};
class Component extends DCLogic {
 state={screen:null,emailDraft:'',email:'maya.lindqvist@fjordmail.se',emailErr:'',code:'',codeErr:'',resent:false,sel:'DSAR-2026-00418',upload:false,uploadErr:false,infoNote:'',infoSent:false,extra:[],msgDraft:'',toast:null};
 componentDidMount(){if(typeof window!=='undefined')window.__rp=this;}
 componentWillUnmount(){clearTimeout(this._t);}
 show(m){this.setState({toast:m});clearTimeout(this._t);this._t=setTimeout(()=>this.setState({toast:null}),4000);}
 go(screen,o){this.setState({screen,...(o||{})});if(typeof window!=='undefined')window.scrollTo(0,0);}
 renderVals(){
  const s=this.state,p=this.props;
  const brand=p.brandColor||'#3B4CCA',company=p.companyName||'Lumen Analytics',privacyEmail=p.privacyEmail||'privacy@lumen.io';
  const scen=s.scen||p.scenario||'progress';
  const screen=s.screen||p.startScreen||'signin';
  const v={brand,company,privacyEmail,initial:company.charAt(0),poweredBy:p.poweredBy??true,email:s.email,toast:s.toast,hasToast:!!s.toast};
  v.isSignin=screen==='signin';v.isCode=screen==='code';v.isList=screen==='list';v.isDetail=screen==='detail';v.signedIn=v.isList||v.isDetail;
  v.emailDraft=s.emailDraft;v.onEmail=e=>this.setState({emailDraft:e.target.value,emailErr:''});v.emailErr=s.emailErr;v.emailBd=s.emailErr?'#B42318':'#D0D5DD';
  v.sendLink=()=>{const e=s.emailDraft.trim();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return this.setState({emailErr:'Enter a valid email address, like name@example.com.'});this.go('code',{email:e,code:'',codeErr:'',resent:false});};
  v.emailKey=e=>{if(e.key==='Enter')v.sendLink();};
  v.code=s.code;v.onCode=e=>this.setState({code:e.target.value.replace(/\D/g,'').slice(0,6),codeErr:''});v.codeErr=s.codeErr;v.codeBd=s.codeErr?'#B42318':'#D0D5DD';
  v.verifyCode=()=>{if(s.code.length!==6)return this.setState({codeErr:'Enter the 6-digit code from the email.'});this.go('list');};
  v.codeKey=e=>{if(e.key==='Enter')v.verifyCode();};
  v.openLink=()=>this.go('list');v.resent=s.resent;v.resend=()=>this.setState({resent:true,code:''});v.changeEmail=()=>this.go('signin',{emailErr:''});
  v.signOut=()=>this.go('signin',{emailDraft:'',code:''});
  const st=scen==='info'&&s.infoSent?'info':scen;
  const due=scen==='extended'?'24 Nov 2026':'24 Oct 2026';
  const r418={id:'DSAR-2026-00418',type:'Access',title:'Copy of your personal data',received:'24 Sep 2026',st:SC_STATUS[st],
   dueLabel:scen==='done'?'Completed':'Response due by',due:scen==='done'?'13 Oct 2026':due,
   details:'Please send me a copy of all personal data you hold about me, including support conversations and billing records, and tell me who it has been shared with.'};
  const r287={id:'DSAR-2026-00287',type:'Rectification',title:'Correct your personal data',received:'3 Jun 2026',st:SC_STATUS.done,dueLabel:'Completed',due:'11 Jun 2026'};
  v.reqCards=[r418,r287].map(r=>({...r,action:r.id===r418.id&&scen==='info'&&!s.infoSent,open:()=>{this.go('detail',{sel:r.id});}}));
  v.toList=()=>this.go('list');
  const isOld=s.sel==='DSAR-2026-00287';
  const cur=isOld?{...r287,details:'My billing address is wrong. Please correct it to Storgatan 14, 211 34 Malmö.'}:r418;
  const sumMap={info:s.infoSent?'Thanks for sending your document. We’re checking it now.':'We need one more document from you before we can start collecting your data.',progress:'Your identity is confirmed. We’re now checking every place your data may be held.',extended:'Your identity is confirmed and we’re still collecting your data. We’ve extended the deadline.',done:'Your request is complete. Your documents are ready to download below.'};
  const pctMap={info:40,progress:63,extended:32,done:100};
  const leftMap={info:'11 days left',progress:'11 days left',extended:'42 days left',done:'Closed 19 days after we received it'};
  v.rq={...cur,summary:isOld?'We corrected your billing address on 11 Jun 2026.':sumMap[scen],pct:(isOld?100:pctMap[scen])+'%',dueNote:isOld?'Closed 8 days after we received it':leftMap[scen]};
  v.needsInfo=!isOld&&scen==='info'&&!s.infoSent;v.infoSent=!isOld&&scen==='info'&&s.infoSent;v.isExtended=!isOld&&scen==='extended';v.isDone=!isOld&&scen==='done';
  v.noUpload=!s.upload;v.hasUpload=s.upload;v.pickFile=()=>this.setState({upload:true,uploadErr:false});v.clearFile=()=>this.setState({upload:false});
  v.uploadErr=s.uploadErr;v.infoNote=s.infoNote;v.onInfoNote=e=>this.setState({infoNote:e.target.value});
  v.sendInfo=()=>{if(!s.upload)return this.setState({uploadErr:true});this.setState(x=>({infoSent:true,extra:[...x.extra,{dir:'in',at:'13 Oct 2026, 10:44',subject:'You sent a document',body:'proof_of_address.pdf'+(x.infoNote.trim()?' · “'+x.infoNote.trim()+'”':'')}]}));};
  v.docs=[{icon:'icon-file-archive',label:'Your personal data',file:'lumen_data_DSAR-2026-00418.zip',size:'1.2 MB',dl:()=>this.show('Download started. The link expires 7 days after first opened.')},{icon:'icon-file-text',label:'Our response letter',file:'response_DSAR-2026-00418.pdf',size:'86 KB',dl:()=>this.show('Download started.')}];
  v.dlNote='Download links expire 7 days after you first open them. The files are deleted on 12 Nov 2026, 30 days after we closed your request. This record of your request stays here.';
  v.isPurged=isOld;v.purgedNote='We deleted the files for this request on 11 Jul 2026, 30 days after we closed it, as our retention policy requires. The record of what you asked for, what we did and our messages stays here.';
  // timeline
  const S=(label,date,desc,state)=>({label,date,desc,state});
  let steps;
  if(isOld)steps=[S('Received','3 Jun','We sent a reference number to your email.','done'),S('Identity confirmed','3 Jun','Your email and customer ID matched our records.','done'),S('Making the correction','5 Jun','We updated your billing address in every system that holds it.','done'),S('Final review','10 Jun','A senior member of our privacy team checked the response.','done'),S('Completed','11 Jun','We emailed you confirmation of the change.','done')];
  else{
   const idDone=scen!=='info';
   steps=[S('Received','24 Sep','We sent a reference number to your email.','done'),
    S(idDone?'Identity confirmed':'Confirming your identity',idDone?'24 Sep':(s.infoSent?'13 Oct':'25 Sep'),idDone?'Your email and customer ID matched our records.':(s.infoSent?'We’re reviewing the document you sent.':'We need one more document from you. See above.'),idDone?'done':'current'),
    S('Collecting your data',scen==='done'?'10 Oct':'',scen==='done'?'We checked every place your data may be held.':'We’re checking every place your data may be held.',scen==='done'?'done':idDone?'current':'todo'),
    S('Final review',scen==='done'?'13 Oct':'','A senior member of our privacy team reviews the response before it’s sent.',scen==='done'?'done':'todo'),
    S('Completed',scen==='done'?'13 Oct':'',scen==='done'?'Your documents are ready to download.':'You’ll get an email when your documents are ready.',scen==='done'?'done':'todo')];
  }
  v.steps=steps.map((x,i)=>{const done=x.state==='done',c=x.state==='current';return {...x,n:i+1,done,notDone:!done,bg:done?brand:'#FFFFFF',fg:done?'#FFFFFF':c?brand:'#667085',bd:done||c?brand:'#D0D5DD',lfg:done||c?'#101828':'#667085',w:c?'600':'500',line:i<steps.length-1,lineBg:done?brand:'#E4E7EC',state:done?'(complete)':c?'(current step)':'(not started)'};});
  // messages
  const M=(dir,at,subject,body)=>({dir,at,subject,body:body||''});
  let base;
  if(isOld)base=[M('out','3 Jun 2026, 14:02','We received your request'),M('out','11 Jun 2026, 09:30','Your request is complete','We corrected your billing address in our records.')];
  else{base=[M('out','24 Sep 2026, 09:12','We received your request','Your reference is DSAR-2026-00418.'),M('in','24 Sep 2026, 09:31','You confirmed your email address')];
   if(scen==='info')base.push(M('out','25 Sep 2026, 10:15','We need one more thing to confirm it’s you','Please upload a recent document showing your name and address.'));
   else base.push(M('out','24 Sep 2026, 11:05','Identity confirmed','We’ve started collecting your data.'));
   if(scen==='extended')base.push(M('out','13 Oct 2026, 09:40','We need more time to complete your request','New deadline: 24 Nov 2026.'));
   if(scen==='done')base.push(M('out','13 Oct 2026, 10:50','Your request is complete','Your documents are ready to download in this portal.'));
   base=base.concat(s.extra);}
  v.msgs=base.map(m=>{const out=m.dir==='out';return {...m,hasBody:!!m.body,who:out?company:'You',align:out?'flex-start':'flex-end',bg:out?'#F7F8FA':'#FFFFFF',bd:out?'#EEF1F4':'#D0D5DD'};});
  v.msgDraft=s.msgDraft;v.onMsg=e=>this.setState({msgDraft:e.target.value});v.msgEmpty=!s.msgDraft.trim();
  v.sendMsg=()=>{const t=s.msgDraft.trim();if(!t)return;this.setState(x=>({msgDraft:'',extra:[...x.extra,{dir:'in',at:'13 Oct 2026, 10:46',subject:'Your message',body:t}]}));this.show('Message sent. We usually reply within 2 business days.');};
  return v;
 }
}
