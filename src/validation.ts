import type {Workspace} from './model';
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=20000;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00'));
const fields=(r:any,names:string[])=>r&&typeof r==='object'&&names.every(k=>text(r[k]));
export function validateWorkspace(data:unknown):Workspace{
 const w=data as any;
 const collections=['projects','clients','transactions','tasks','materials','purchases','members','estimates','attachments','activity'];
 if(!w||w.version!==1||!collections.every(k=>Array.isArray(w[k])&&w[k].length<=10000))throw new Error('Choose a valid Interior Que workspace backup.');
 if(!fields(w.settings,['studio','name'])||!number(w.settings.gst)||w.settings.gst>100||typeof w.settings.notifications!=='boolean')throw new Error('Workspace settings in this backup are invalid.');
 const validators:Record<string,(r:any)=>boolean>={
 projects:r=>fields(r,['id','name','clientId','type','location','image','description'])&&number(r.value)&&date(r.start)&&date(r.end)&&r.end>=r.start&&number(r.progress)&&r.progress<=100&&['In progress','Completed','Planning','Delayed'].includes(r.status)&&/^\/(?!\/)/.test(r.image),
 clients:r=>fields(r,['id','name','email','phone','company','location','notes']),
 transactions:r=>fields(r,['id','projectId','contact','description','mode'])&&['Received','Spent'].includes(r.type)&&number(r.amount)&&r.amount>0&&date(r.date),
 tasks:r=>fields(r,['id','projectId','name','assignee','stage','priority'])&&date(r.due)&&number(r.progress)&&r.progress<=100,
 materials:r=>fields(r,['id','name','category','brand','unit'])&&['stock','min','rate'].every(k=>number(r[k])),
 purchases:r=>fields(r,['id','projectId','supplier','item','status'])&&number(r.qty)&&r.qty>0&&number(r.rate)&&date(r.date),
 members:r=>fields(r,['id','name','role','email','location','color'])&&/^#[\da-f]{6}$/i.test(r.color),
 estimates:r=>fields(r,['id','projectId','room','name','specification','unit'])&&number(r.qty)&&r.qty>0&&number(r.rate),
 attachments:r=>fields(r,['id','projectId','name','mime','room','caption','accountId'])&&number(r.size)&&date(r.date)&&['Queued','Synced','Sample'].includes(r.status)&&(!r.image||typeof r.image==='string'&&/^\/(?!\/)/.test(r.image)),
 activity:r=>fields(r,['id','text','date'])&&!Number.isNaN(Date.parse(r.date))
 };
 for(const key of collections){if(!w[key].every(validators[key]))throw new Error(`The ${key} records in this backup are invalid.`);if(new Set(w[key].map((r:any)=>r.id)).size!==w[key].length)throw new Error(`Duplicate ${key} records found in this backup.`);}
 const projectIds=new Set(w.projects.map((p:any)=>p.id)),clientIds=new Set(w.clients.map((c:any)=>c.id));
 if(w.projects.some((p:any)=>!clientIds.has(p.clientId))||['transactions','tasks','purchases','estimates','attachments'].some(k=>w[k].some((r:any)=>!projectIds.has(r.projectId))))throw new Error('This backup has records with missing project or client links.');
 return structuredClone(w) as Workspace;
}
