import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {storage} from './storage';
import {seed} from './model';
describe('offline workspace storage',()=>{
 it('persists edits independently for two accounts',async()=>{const a=seed(),b=seed();a.projects[0].name='Account A project';b.projects[0].name='Account B project';await storage.save('account-a',a);await storage.save('account-b',b);expect((await storage.load('account-a'))?.projects[0].name).toBe('Account A project');expect((await storage.load('account-b'))?.projects[0].name).toBe('Account B project');});
 it('stores uploaded binary files without using localStorage',async()=>{const file=new Blob(['photo-binary'],{type:'image/jpeg'});await storage.putFile('upload-test',file);const read=await storage.file('upload-test');expect(read?.type).toBe('image/jpeg');expect(await read?.text()).toBe('photo-binary');});
});
