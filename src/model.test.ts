import {describe,it,expect} from 'vitest';
import {seed,projectTotals,estimateTotals,stockStatus} from './model';
import {validateWorkspace} from './validation';
describe('linked financial records',()=>{
 it('keeps dashboard and project totals consistent',()=>{const w=seed();expect(projectTotals(w)).toEqual({value:4850000,received:2920000,spent:2160000,pending:1930000,cash:760000});expect(w.projects.reduce((s,p)=>s+projectTotals(w,p.id).received,0)).toBe(projectTotals(w).received);});
 it('updates receipt, balance and cash without changing contract value',()=>{const w=seed();const before=projectTotals(w,'p1');w.transactions.push({id:'new',projectId:'p1',amount:50000,type:'Received',date:'2026-10-10',contact:'Client',description:'Second installment',mode:'UPI'});const after=projectTotals(w,'p1');expect(after.value).toBe(before.value);expect(after.pending).toBe(before.pending-50000);expect(after.cash).toBe(before.cash+50000);});
 it('applies discount before GST and calculates quantity × rate',()=>{expect(estimateTotals([{id:'i',projectId:'p',room:'Kitchen',name:'Cabinet',specification:'Ply',qty:12.5,rate:2000,unit:'Sq.ft'}],18,1000)).toEqual({subtotal:25000,discount:1000,tax:4320,total:28320});});
 it('identifies low stock and zero stock correctly',()=>{const m=seed().materials[0];expect(stockStatus({...m,stock:0})).toBe('Out of stock');expect(stockStatus({...m,stock:49,min:50})).toBe('Low stock');expect(stockStatus({...m,stock:50,min:50})).toBe('In stock');});
});
describe('workspace recovery',()=>{
 it('accepts a complete exported workspace',()=>expect(validateWorkspace(JSON.parse(JSON.stringify(seed()))).projects.length).toBe(8));
 it('rejects broken project links',()=>{const w=seed();w.transactions[0].projectId='missing';expect(()=>validateWorkspace(w)).toThrow(/links/);});
 it('rejects unsafe media URLs',()=>{const w=seed();w.attachments[0].image='https://attacker.example/token';expect(()=>validateWorkspace(w)).toThrow(/attachments/);});
 it('rejects invalid numeric records and malformed collections',()=>{const w=seed();w.tasks[0].progress=101;expect(()=>validateWorkspace(w)).toThrow(/tasks/);expect(()=>validateWorkspace({version:1,projects:[]})).toThrow();});
});
