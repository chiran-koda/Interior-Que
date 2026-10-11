import {describe,expect,it} from 'vitest';
import {parseCloudConfig} from './studio-cloud';
import {developmentConfig} from './firebase-development';

describe('development-only connection',()=>{
 it('accepts the registered development web configuration',()=>{
  expect(parseCloudConfig(JSON.stringify(developmentConfig)).projectId).toBe('interior-que-development');
 });
 it('rejects a different project or authentication key before starting authentication',()=>{
  for(const change of [{projectId:'designquote-production'},{apiKey:'another-project-key'},{authDomain:'another-project.firebaseapp.com'}])
   expect(()=>parseCloudConfig(JSON.stringify({...developmentConfig,...change}))).toThrow('development release');
 });
});
