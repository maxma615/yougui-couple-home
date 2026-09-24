import {afterEach,describe,expect,it,vi} from 'vitest';
import {appErrorResponse} from '../../src/lib/errors';
import {auditSecurityEvent} from '../../src/lib/security';

afterEach(()=>vi.restoreAllMocks());
describe('secret redaction at public boundaries',()=>{
  it('does not serialize unexpected properties into audit logs',()=>{
    const logs:string[]=[];
    vi.spyOn(console,'info').mockImplementation(value=>logs.push(String(value)));
    const payload={actorId:'account-id',reason:'invalid_credentials',password:'NeverLogThisPassword',cookie:'NeverLogThisCookie',body:'NeverLogPrivateText'};
    auditSecurityEvent('login','failure',payload);
    const log=logs.join('');
    expect(log).toContain('invalid_credentials');
    for(const secret of [payload.password,payload.cookie,payload.body])expect(log).not.toContain(secret);
  });
  it('returns a generic response for internal paths, credentials and SQL errors',async()=>{
    const response=appErrorResponse(new Error('postgres://owner:NeverLogThisPassword@localhost/private /private/attachments secret-cookie'));
    expect(response.status).toBe(500);
    const body=await response.text();
    for(const sensitive of ['NeverLogThisPassword','/private/attachments','secret-cookie','postgres://'])expect(body).not.toContain(sensitive);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
