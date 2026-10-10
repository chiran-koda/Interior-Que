import {createContext,useContext,type Dispatch,type SetStateAction} from 'react';
import type {Workspace,Page,Project} from './model';
import type {DriveAccount} from './drive';
export type FormKind='project'|'client'|'payment'|'purchase'|'material'|'task'|'member'|'estimate'|'upload'|'help'|'notifications'|'install';
export interface FormState {kind:FormKind;data?:any;projectId?:string;}
export interface AppContext {w:Workspace;edit:(fn:(w:Workspace)=>Workspace)=>Promise<boolean>;page:Page;navigate:(page:Page)=>void;open:(kind:FormKind,data?:any,projectId?:string)=>void;detail:Project|null;setDetail:Dispatch<SetStateAction<Project|null>>;notify:(text:string,error?:boolean)=>void;query:string;setQuery:(s:string)=>void;account:DriveAccount|null;online:boolean;busy:string;connect:()=>Promise<void>;disconnect:()=>void;sync:()=>Promise<void>;refresh:()=>Promise<void>;backup:()=>Promise<void>;restore:()=>Promise<void>;importLocal:()=>Promise<void>;clientId:string;setClientId:(s:string)=>void;install:()=>Promise<void>;installable:boolean;}
export const Context=createContext<AppContext|null>(null);
export const useApp=()=>useContext(Context)!;
