import {afterEach,describe,expect,it,vi} from 'vitest';
import {asset} from './assets';
afterEach(()=>vi.unstubAllEnvs());
describe('portable project imagery',()=>{
 it('resolves stored paths under the GitHub repository path',()=>{vi.stubEnv('BASE_URL','/Interior-Que/');expect(asset('/images/living.jpg')).toBe('/Interior-Que/images/living.jpg');});
 it('keeps uploaded blob URLs intact',()=>{vi.stubEnv('BASE_URL','/Interior-Que/');expect(asset('blob:https://example.test/photo')).toBe('blob:https://example.test/photo');});
 it('works at a root origin for local development',()=>{vi.stubEnv('BASE_URL','/');expect(asset('/icon.svg')).toBe('/icon.svg');});
});
