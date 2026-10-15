// Extracted verbatim from Privacyspace Admin.dc.html.
const T={gray:['#EEF1F4','#344054'],info:['#D9E8FF','#175CD3'],teal:['#D7F0EF','#0A6463'],warn:['#FDF0DC','#B54708'],ok:['#D9F2E7','#0E6B4D'],bad:['#FEE4E2','#B42318']};
const pill=(label,tone,icon)=>({label,bg:T[tone][0],fg:T[tone][1],icon:'icon-'+(icon||'circle')});
const WSP={live:['Live','ok'],setup:['Setup in progress','warn'],none:['Not started','gray'],review:['Name in review','info'],off:['Offline','bad']};
const ORGS=[
 {key:'northlight',name:'Northlight Privacy',kind:'Agency',plan:'Agency',admin:'Mara Voss',adminEmail:'mara@northlight.eu',seats:'9 of 15',openReq:14,mfa:true,status:'Active',created:'Mar 2025',region:'EU (Frankfurt)',
  ws:[{name:'Lumen Analytics',host:'lumen.privacyspace.com',p:'setup'},{name:'Fernwood Commerce',host:'privacy.fernwood.shop',p:'live'},{name:'Kesto Health',host:'kesto-health.privacyspace.com',p:'review'},{name:'Ardent Labs',host:'ardent.privacyspace.com',p:'live'}]},
 {key:'halden',name:'Halden Bikes',kind:'Direct',plan:'Growth',admin:'Ola Berg',adminEmail:'ola@halden.bike',seats:'4 of 10',openReq:3,mfa:true,status:'Active',created:'Jun 2025',region:'EU (Frankfurt)',ws:[{name:'Halden Bikes',host:'halden.privacyspace.com',p:'live'}]},
 {key:'okto',name:'Okto Payments',kind:'Direct',plan:'Growth',admin:'Rhea Patel',adminEmail:'rhea@okto.com',seats:'7 of 10',openReq:6,mfa:true,status:'Active',created:'Jan 2026',region:'EU (Frankfurt)',ws:[{name:'Okto Payments',host:'privacy.okto.com',p:'live'}]},
 {key:'vesna',name:'Vesna Clinics',kind:'Direct',plan:'Growth',admin:'Tina Kovač',adminEmail:'tina@vesnaklinik.si',seats:'3 of 10',openReq:0,mfa:true,status:'Active',created:'Sep 2026',region:'EU (Frankfurt)',ws:[{name:'Vesna Clinics',host:'vesna-care.privacyspace.com',p:'review'}]},
 {key:'corvid',name:'Corvid Travel',kind:'Direct',plan:'Starter',admin:'Sam Doyle',adminEmail:'sam@corvidtravel.com',seats:'2 of 3',openReq:1,mfa:false,status:'Trial',trialEnds:'21 Oct 2026',created:'Oct 2026',region:'EU (Frankfurt)',ws:[{name:'Corvid Travel',host:'Not claimed',p:'none'}]},
 {key:'mirabel',name:'Mirabel Studio',kind:'Direct',plan:'Starter',admin:'Lea Marchand',adminEmail:'lea@mirabel.studio',seats:'2 of 3',openReq:1,mfa:true,status:'Suspended',suspendReason:'Suspended automatically on 12 Oct for non-payment: INV-2026-0141 was unpaid 3 days after the final failed attempt. Portal shows a notice and still accepts requests.',created:'Feb 2026',region:'EU (Frankfurt)',ws:[{name:'Mirabel Studio',host:'mirabel.privacyspace.com',p:'live'}]}
];
const REVIEWS=[
 {id:'r1',sub:'vesna-care',org:'vesna',orgName:'Vesna Clinics',vdom:'vesnaklinik.si',by:'Tina Kovač',at:'13 Oct, 09:14',age:'2 h',note:'Our patient-facing brand is Vesna Care. The domain is older.',flag:'',status:'pending'},
 {id:'r2',sub:'kesto-health',org:'northlight',orgName:'Northlight Privacy · Kesto Health',vdom:'kesto.fi',by:'Jakob Lund',at:'12 Oct, 16:40',age:'19 h',note:'Agency setting up the client portal. Kesto Health verified kesto.fi themselves.',flag:'',status:'pending'},
 {id:'r3',sub:'paypa1-support',org:'corvid',orgName:'Corvid Travel',vdom:'corvidtravel.com',by:'Sam Doyle',at:'12 Oct, 11:02',age:'1 d',note:'Testing.',flag:'Looks like a protected brand (paypal). Name has no link to corvidtravel.com.',status:'pending'}
];
const DOMAINS=[
 {id:'d1',domain:'privacy.ardentlabs.io',kind:'Custom portal domain',ws:'Ardent Labs · Northlight',status:'waiting',issue:'CNAME not found after 3 days',checked:'13 Oct, 10:00'},
 {id:'d2',domain:'halden.bike',kind:'Sending domain',ws:'Halden Bikes',status:'failing',issue:'DKIM record ps2._domainkey removed on 9 Oct',checked:'13 Oct, 10:00'},
 {id:'d3',domain:'privacy.fernwood.shop',kind:'Custom portal domain',ws:'Fernwood Commerce · Northlight',status:'ok',issue:'',checked:'13 Oct, 10:00'},
 {id:'d4',domain:'fernwood.shop',kind:'Sending domain',ws:'Fernwood Commerce · Northlight',status:'ok',issue:'',checked:'13 Oct, 10:00'},
 {id:'d5',domain:'privacy.okto.com',kind:'Custom portal domain',ws:'Okto Payments',status:'ok',issue:'',checked:'13 Oct, 10:00'}
];
const GRANTS=[
 {id:'g1',org:'northlight',orgName:'Northlight Privacy',ws:'Ardent Labs',staff:'Elif Demir',scope:'Settings and portal only',reason:'Ticket #4821 · custom domain not verifying',status:'active',approvedBy:'Mara Voss',left:'5 h left'},
 {id:'g2',org:'halden',orgName:'Halden Bikes',ws:'Halden Bikes',staff:'Tom Ruiz',scope:'Settings and portal only',reason:'Ticket #4830 · DKIM failing, emails using fallback sender',status:'pending',approvedBy:'',left:''},
 {id:'g3',org:'okto',orgName:'Okto Payments',ws:'Okto Payments',staff:'Elif Demir',scope:'Read-only case view',reason:'Ticket #4777 · evidence pack export error',status:'ended',approvedBy:'Rhea Patel',left:'Ended 8 Oct, 17:20'}
];
const STAFF=[
 {name:'Noor Haddad',email:'noor@privacyspace.com',role:'Platform admin',key:true,last:'Active now'},
 {name:'Elif Demir',email:'elif@privacyspace.com',role:'Support',key:true,last:'Active now'},
 {name:'Tom Ruiz',email:'tom@privacyspace.com',role:'Support',key:true,last:'25 min ago'},
 {name:'Kai Nieminen',email:'kai@privacyspace.com',role:'Security',key:true,last:'Yesterday'},
 {name:'Ines Farah',email:'ines@privacyspace.com',role:'Billing',key:true,last:'Active now'}
];
const SUBS={
 northlight:{cycle:'Monthly',price:499,method:'SEPA Direct Debit · DE89 ••• 3000',started:'1 Mar 2025',period:'1–31 Oct 2026',next:'1 Nov 2026',used:38,incl:100,over:8,status:'active',credit:0},
 halden:{cycle:'Annual',price:1990,method:'Visa •••• 4417',started:'12 Jun 2025',period:'12 Jun 2026 – 11 Jun 2027',next:'12 Jun 2027',used:7,incl:25,over:10,status:'active',credit:0},
 okto:{cycle:'Monthly',price:199,method:'Mastercard •••• 8820',started:'1 Jan 2026',period:'1–31 Oct 2026',next:'1 Nov 2026',used:31,incl:25,over:10,status:'active',credit:0},
 vesna:{cycle:'Monthly',price:199,method:'Visa •••• 2051',started:'22 Sep 2026',period:'22 Sep – 21 Oct 2026',next:'22 Oct 2026',used:2,incl:25,over:10,status:'active',credit:0},
 corvid:{cycle:'Monthly',price:79,method:'None on file',started:'7 Oct 2026',period:'Trial, 7–21 Oct 2026',next:'21 Oct 2026, if a payment method is added',used:1,incl:5,over:15,status:'trial',credit:0},
 mirabel:{cycle:'Monthly',price:79,method:'Visa •••• 9034 · declined',started:'1 Feb 2026',period:'1–31 Oct 2026',next:'Held until INV-2026-0141 is paid',used:1,incl:5,over:15,status:'past_due',credit:0,failed:3}
};
const PAYMENTS=[
 {id:'py_1093',at:'9 Oct 2026',org:'mirabel',inv:'INV-2026-0141',method:'Visa •••• 9034',amount:79,status:'failed',note:'Card declined · attempt 3 of 3'},
 {id:'py_1091',at:'5 Oct 2026',org:'mirabel',inv:'INV-2026-0141',method:'Visa •••• 9034',amount:79,status:'failed',note:'Card declined · attempt 2 of 3'},
 {id:'py_1089',at:'1 Oct 2026',org:'mirabel',inv:'INV-2026-0141',method:'Visa •••• 9034',amount:79,status:'failed',note:'Card declined · attempt 1 of 3'},
 {id:'py_1088',at:'1 Oct 2026',org:'okto',inv:'INV-2026-0140',method:'Mastercard •••• 8820',amount:239,status:'succeeded',note:'Includes 4 overage DSARs from September'},
 {id:'py_1087',at:'1 Oct 2026',org:'northlight',inv:'INV-2026-0139',method:'SEPA ••• 3000',amount:499,status:'succeeded',note:''},
 {id:'py_1080',at:'22 Sep 2026',org:'vesna',inv:'INV-2026-0137',method:'Visa •••• 2051',amount:199,status:'succeeded',note:'First payment after trial'},
 {id:'py_1074',at:'18 Sep 2026',org:'okto',inv:'INV-2026-0134',method:'Mastercard •••• 8820',amount:-20,status:'refund',note:'Overage billed twice'},
 {id:'py_1071',at:'1 Sep 2026',org:'okto',inv:'INV-2026-0134',method:'Mastercard •••• 8820',amount:219,status:'succeeded',note:''},
 {id:'py_1070',at:'1 Sep 2026',org:'northlight',inv:'INV-2026-0133',method:'SEPA ••• 3000',amount:499,status:'succeeded',note:''},
 {id:'py_1069',at:'1 Sep 2026',org:'mirabel',inv:'INV-2026-0132',method:'Visa •••• 9034',amount:79,status:'succeeded',note:''}
];
const INVOICES=[
 {no:'Upcoming',org:'okto',period:'Nov 2026',due:'1 Nov 2026',amount:259,status:'upcoming',note:'Estimate · includes 6 overage DSARs'},
 {no:'Upcoming',org:'northlight',period:'Nov 2026',due:'1 Nov 2026',amount:499,status:'upcoming',note:''},
 {no:'Upcoming',org:'vesna',period:'22 Oct – 21 Nov 2026',due:'22 Oct 2026',amount:199,status:'upcoming',note:''},
 {no:'INV-2026-0141',org:'mirabel',period:'Oct 2026',due:'1 Oct 2026',amount:79,status:'overdue',note:'3 failed attempts'},
 {no:'INV-2026-0140',org:'okto',period:'Oct 2026',due:'1 Oct 2026',amount:239,status:'paid',paid:'1 Oct',note:''},
 {no:'INV-2026-0139',org:'northlight',period:'Oct 2026',due:'1 Oct 2026',amount:499,status:'paid',paid:'1 Oct',note:''},
 {no:'INV-2026-0137',org:'vesna',period:'22 Sep – 21 Oct 2026',due:'22 Sep 2026',amount:199,status:'paid',paid:'22 Sep',note:''},
 {no:'INV-2026-0134',org:'okto',period:'Sep 2026',due:'1 Sep 2026',amount:219,status:'paid',paid:'1 Sep',note:'€20 refunded on 18 Sep'},
 {no:'INV-2026-0133',org:'northlight',period:'Sep 2026',due:'1 Sep 2026',amount:499,status:'paid',paid:'1 Sep',note:''},
 {no:'INV-2026-0132',org:'mirabel',period:'Sep 2026',due:'1 Sep 2026',amount:79,status:'paid',paid:'1 Sep',note:''},
 {no:'INV-2026-0098',org:'halden',period:'12 Jun 2026 – 11 Jun 2027',due:'12 Jun 2026',amount:1990,status:'paid',paid:'12 Jun',note:'Annual'}
];
const CASH=[['May',777],['Jun',2767],['Jul',797],['Aug',797],['Sep',976]];
const PLANS=[{name:'Starter',m:79,y:790,incl:'5 DSARs / month',ws:'1 workspace',over:15,extra:'3 data-source checklists, evidence export'},{name:'Growth',m:199,y:1990,incl:'25 DSARs / month',ws:'3 workspaces',over:10,extra:'Unlimited checklists, approvals, API'},{name:'Agency',m:499,y:4990,incl:'100 DSARs / month',ws:'15 client workspaces',over:8,extra:'White-label portal, priority support'}];
const E=n=>(n<0?'−€':'€')+Math.abs(Math.round(n)).toLocaleString('en-IE');
const AUDIT=[
 {t:'13 Oct 2026, 10:00',actor:'System',action:'DNS checks ran for 5 domains · 2 not passing',cat:'Domains',reason:''},
 {t:'13 Oct 2026, 09:14',actor:'Tina Kovač (customer)',action:'Claimed vesna-care.privacyspace.com · sent to review',cat:'Subdomains',reason:''},
 {t:'13 Oct 2026, 05:12',actor:'Mara Voss (customer)',action:'Approved support access for Elif Demir · Ardent Labs · 24 h',cat:'Access',reason:''},
 {t:'12 Oct 2026, 09:00',actor:'System',action:'Suspended Mirabel Studio automatically for non-payment',cat:'Billing',reason:'INV-2026-0141 unpaid 3 days after the final failed attempt on 9 Oct.'},
 {t:'11 Oct 2026, 14:22',actor:'Noor Haddad',action:'Invited Ines Farah as Billing',cat:'Staff',reason:'New billing operations hire.'}
];
const ROLES_INFO={'Platform admin':'Platform admin: manages organizations, plans, suspensions, reserved names, staff and policies.','Support':'Support: reviews subdomains, checks domains and requests time-limited access to customer workspaces. Can’t change plans, policies or staff.','Billing':'Billing: manages subscriptions, payments, refunds and invoices. Can’t open customer workspaces, change policies or manage staff.'};

export { T, WSP, ORGS, REVIEWS, DOMAINS, GRANTS, STAFF, AUDIT, ROLES_INFO, SUBS, PAYMENTS, INVOICES, CASH, PLANS, E };
