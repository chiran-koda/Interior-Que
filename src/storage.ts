import {openDB} from 'idb';
import type {Workspace} from './model';
const db=openDB('nexora-studio',1,{upgrade(db){db.createObjectStore('workspaces');db.createObjectStore('files');}});
export const storage={load:async (key:string):Promise<Workspace|undefined>=>migrateBrand(await (await db).get('workspaces',key)),save:async(key:string,data:Workspace)=>{await(await db).put('workspaces',data,key);},file:async(id:string):Promise<Blob|undefined>=>(await db).get('files',id),putFile:async(id:string,file:Blob)=>{await(await db).put('files',file,id);}};

function migrateBrand(w:Workspace|undefined){if(w?.settings.studio==='Nexora Interior Studio'||w?.settings.studio==='Nexora Studio')return {...w,settings:{...w.settings,studio:'Interior Que'}};return w;}
